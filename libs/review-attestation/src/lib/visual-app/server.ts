/** Node-only image comparison and independently recomputed source provenance. */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import ts from 'typescript';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import {
  DEFAULT_VISUAL_APP_COMPARISON,
  visualHttpSources,
  type VisualAppComparison,
  type VisualAppConfig,
  type VisualAppCaptureTarget,
} from '../visual-app.js';

export const hashBytes = (bytes: string | Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');
export function canonicalCaptureValue(value: unknown): string {
  if (value instanceof Uint8Array) return JSON.stringify([...value]);
  if (value instanceof ArrayBuffer)
    return JSON.stringify([...new Uint8Array(value)]);
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value))
    return `[${value.map(canonicalCaptureValue).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalCaptureValue(v)}`)
    .join(',')}}`;
}
export function compareVisualScreenshots(
  current: Uint8Array,
  reference: Uint8Array,
  comparison: VisualAppComparison = DEFAULT_VISUAL_APP_COMPARISON,
) {
  const a = PNG.sync.read(Buffer.from(current));
  const b = PNG.sync.read(Buffer.from(reference));
  const sameDimensions = a.width === b.width && a.height === b.height;
  if (!sameDimensions)
    return {
      matches: false,
      sameDimensions,
      diffPixels: null,
      comparison,
      current: { width: a.width, height: a.height },
      reference: { width: b.width, height: b.height },
    };
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: comparison.threshold,
  });
  return {
    matches: diffPixels <= comparison.maxDiffPixels,
    sameDimensions,
    diffPixels,
    comparison,
    diff: PNG.sync.write(diff),
    current: { width: a.width, height: a.height },
    reference: { width: b.width, height: b.height },
  };
}

export type VisualAppProvenance = {
  readonly contract: string;
  readonly sources: Readonly<Record<string, string>>;
};
export const visualAppContractHash = (
  config: VisualAppConfig,
  target: VisualAppCaptureTarget,
): string =>
  hashBytes(
    canonicalCaptureValue({
      version: 2,
      httpContracts: config.httpContracts,
      sourceFiles: config.sourceFiles,
      page: {
        id: target.page.id,
        route: target.page.route,
        url: target.page.url,
        component: target.page.component,
        dependencies: target.page.dependencies,
      },
      scenario: target.scenario,
      capture: target.capture.id,
      viewportName: target.viewportName,
      viewport: target.viewport,
      comparison: config.comparison ?? DEFAULT_VISUAL_APP_COMPARISON,
      environment: config.environment ?? 'chromium-v1',
      stabilityTimeoutMs: config.stabilityTimeoutMs ?? 10_000,
    }),
  );

/** Follow TypeScript-resolved local imports, including styles/templates, for this page only. */
export async function visualAppProvenance(
  config: VisualAppConfig,
  target: VisualAppCaptureTarget,
  rootDir: string,
  tsconfigPath?: string,
): Promise<VisualAppProvenance> {
  const configFile =
    tsconfigPath ??
    ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');
  let options: ts.CompilerOptions = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
  };
  if (configFile) {
    const loaded = ts.readConfigFile(
      resolve(rootDir, configFile),
      ts.sys.readFile,
    );
    if (loaded.error)
      throw new Error(
        ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'),
      );
    options = ts.parseJsonConfigFileContent(
      loaded.config,
      ts.sys,
      dirname(resolve(rootDir, configFile)),
    ).options;
  }
  const sources: Record<string, string> = {};
  const visit = async (file: string): Promise<void> => {
    const path = resolve(rootDir, file);
    const key = relative(rootDir, path).split('\\').join('/');
    if (key in sources || path.includes('/node_modules/')) return;
    const content = await readFile(path);
    sources[key] = hashBytes(content);
    if (!/\.[cm]?[jt]sx?$/.test(path)) return;
    const source = content.toString('utf8');
    for (const imported of ts.preProcessFile(source, true, true)
      .importedFiles) {
      const resolved = ts.resolveModuleName(
        imported.fileName,
        path,
        options,
        ts.sys,
      ).resolvedModule;
      if (resolved) await visit(resolved.resolvedFileName);
      else if (imported.fileName.startsWith('.')) {
        const asset = resolve(dirname(path), imported.fileName);
        if (
          await stat(asset).then(
            (s) => s.isFile(),
            () => false,
          )
        )
          await visit(asset);
        else
          throw new Error(
            `Unresolved capture dependency '${imported.fileName}' in '${key}'.`,
          );
      }
    }
  };
  const componentFile = (id: string) => {
    const match = /^component:(.+):[^:]+$/.exec(id);
    if (!match?.[1]) throw new Error(`Invalid capture component '${id}'.`);
    return match[1];
  };
  await visit(componentFile(target.page.component));
  for (const file of config.sourceFiles ?? []) await visit(file);
  for (const component of [
    ...(target.page.dependencies ?? []),
    ...(target.scenario.modals ?? []).map((m) => m.component),
  ])
    await visit(componentFile(component));
  for (const fixture of visualHttpSources(target.scenario.mocks))
    await visit(fixture);
  // Lockfile pins package code, browser adapter and fonts delivered by packages.
  for (const lock of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']) {
    if (
      await stat(resolve(rootDir, lock)).then(
        (s) => s.isFile(),
        () => false,
      )
    )
      await visit(lock);
  }
  return { contract: visualAppContractHash(config, target), sources };
}
