import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { CraftDeploymentDiagnostic } from './diagnostics.js';
import type { CraftDeploymentManifest } from './manifest.js';

export type CraftArtifactCheckOptions = Readonly<{
  /** Directory the manifest paths are relative to. */
  rootDir?: string;
  manifest: CraftDeploymentManifest;
}>;

/**
 * Inspects the produced artefact rather than the sources.
 *
 * This is the stable API behind the `production:check` smoke: a build can only
 * be published once the directory a provider would upload holds an entry
 * point, executable JavaScript and nothing the source map policy forbids.
 */
export function checkCraftDeploymentArtifact(
  options: CraftArtifactCheckOptions,
): readonly CraftDeploymentDiagnostic[] {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const manifest = options.manifest;
  const publicDir = manifest.artifact.publicDir;
  const diagnostics: CraftDeploymentDiagnostic[] = [];

  if (!publicDir) return diagnostics;

  const absolutePublicDir = resolve(rootDir, publicDir);
  if (!existsSync(absolutePublicDir)) {
    return [
      {
        code: 'CRAFT_DEPLOY_ARTIFACT_MISSING',
        severity: 'error',
        path: 'artifact.publicDir',
        file: publicDir,
        runtime: manifest.runtime,
        platform: manifest.platform,
        message: `The artefact directory \`${publicDir}\` does not exist.`,
        fix: 'Run the declared build command before checking the artefact.',
      },
    ];
  }

  const files = listFiles(absolutePublicDir);
  const relativeFiles = files.map((file) => relative(rootDir, file));

  if (!existsSync(join(absolutePublicDir, 'index.html'))) {
    diagnostics.push({
      code: 'CRAFT_DEPLOY_ARTIFACT_NO_ENTRY',
      severity: 'error',
      path: 'artifact.publicDir',
      file: join(publicDir, 'index.html'),
      runtime: manifest.runtime,
      message: `\`${publicDir}\` contains no \`index.html\`.`,
      fix: 'Check the build output directory declared in `client.outDir`.',
    });
  }

  if (!files.some((file) => /\.m?js$/.test(file))) {
    diagnostics.push({
      code: 'CRAFT_DEPLOY_ARTIFACT_NO_JAVASCRIPT',
      severity: 'error',
      path: 'artifact.publicDir',
      file: publicDir,
      runtime: manifest.runtime,
      message: `\`${publicDir}\` contains no JavaScript file.`,
      fix: 'Check the build command and its output directory.',
    });
  }

  if (manifest.artifact.sourceMaps === 'forbidden') {
    for (const file of relativeFiles.filter((name) => name.endsWith('.map'))) {
      diagnostics.push({
        code: 'CRAFT_DEPLOY_ARTIFACT_SOURCE_MAP',
        severity: 'error',
        path: 'artifact.sourceMaps',
        file,
        runtime: manifest.runtime,
        message: `\`${file}\` is a source map and the policy is \`forbidden\`.`,
        fix: 'Disable source maps in the production build, or relax `artifact.sourceMaps`.',
      });
    }
  }

  if (manifest.runtime === 'static') {
    if (manifest.static.mode === 'spa') {
      const fallback = join(publicDir, manifest.static.fallback);
      if (!existsSync(resolve(rootDir, fallback))) {
        diagnostics.push({
          code: 'CRAFT_DEPLOY_SPA_FALLBACK_MISSING',
          severity: 'error',
          path: 'static.fallback',
          file: fallback,
          runtime: 'static',
          message: `The SPA fallback \`${fallback}\` is missing from the artefact.`,
          fix: 'Build the client, or correct `static.fallback`.',
        });
      }
    } else {
      for (const [index, route] of manifest.static.routes.entries()) {
        if (!hasPrerenderedDocument(absolutePublicDir, route)) {
          diagnostics.push({
            code: 'CRAFT_DEPLOY_SSG_ROUTE_NOT_RENDERED',
            severity: 'error',
            path: `static.routes[${index}]`,
            file: publicDir,
            runtime: 'static',
            message: `No pre-rendered document was found for \`${route}\`.`,
            fix: 'Run the pre-render step for that route, or remove it from `static.routes`.',
          });
        }
      }
    }
  }

  return diagnostics;
}

/** A route is rendered as `<route>.html` or as `<route>/index.html`. */
export function hasPrerenderedDocument(
  publicDir: string,
  route: string,
): boolean {
  const segments = route.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) return existsSync(join(publicDir, 'index.html'));
  const base = join(publicDir, ...segments);
  return existsSync(`${base}.html`) || existsSync(join(base, 'index.html'));
}

function listFiles(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}
