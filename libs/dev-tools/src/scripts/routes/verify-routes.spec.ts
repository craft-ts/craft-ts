import { chmod, mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRouteVerificationFixtures,
  matchRouteVerificationDiagnostics,
  runRouteVerification,
} from './verify-routes';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('route verification', () => {
  it('publishes a balanced fixture catalog covering routing, DI, templates and exceptions', () => {
    const fixtures = createRouteVerificationFixtures();
    const ids = new Set(fixtures.map((fixture) => fixture.id));

    expect(ids).toEqual(
      new Set([
        'support',
        'valid-routes',
        'route-provider',
        'lazy-parent',
        'lazy-child',
        'pending',
        'exception-components',
        'template-pipe',
        'template-component',
        'template-routes',
        'missing-provider',
        'missing-input',
        'pending-missing',
        'exception-component-missing',
        'exception-missing-handler',
        'exception-extra-handler',
        'pending-component',
        'pending-missing-component',
      ]),
    );
    expect(fixtures.filter((fixture) => fixture.kind === 'positive').length).toBeGreaterThan(0);
    expect(fixtures.filter((fixture) => fixture.kind === 'negative').length).toBeGreaterThan(0);
  });

  it('matches all expected diagnostic fragments', () => {
    expect(
      matchRouteVerificationDiagnostics(
        'The VerifyMissingService service is not provided in path: "missing-provider"',
        ['VerifyMissingService', 'path: "missing-provider"'],
      ),
    ).toEqual([
      'VerifyMissingService',
      'path: "missing-provider"',
    ]);
  });

  it('runs the positive and negative passes and removes temporary fixtures', async () => {
    const root = await createFakeProject(false);
    temporaryDirectories.push(root);

    const result = await runRouteVerification({
      rootDir: root,
      project: 'tsconfig.json',
      log: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(result.baseline.status).toBe('passed');
    expect(result.cases.every((item) => item.status === 'passed')).toBe(true);
    expect(result.fixtureDirectory).toBeUndefined();
    expect(
      (await readdir(root)).some((entry) => entry.startsWith('craft-route-verify-')),
    ).toBe(false);
  }, 60_000);

  it('runs the generated fixtures through the real TypeScript compiler', async () => {
    const root = await mkdtemp(join(process.cwd(), '.craft-route-verify-integration-'));
    temporaryDirectories.push(root);
    const binDirectory = join(root, 'node_modules', '.bin');
    await mkdir(binDirectory, { recursive: true });
    await writeFile(join(binDirectory, 'eslint'), '#!/bin/sh\nexit 0\n', 'utf8');
    await chmod(join(binDirectory, 'eslint'), 0o755);
    await writeFile(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: root,
          module: 'preserve',
          moduleResolution: 'bundler',
          paths: {
            '@craft-ng/core': [join(process.cwd(), 'libs/core/src/index.ts')],
          },
          skipLibCheck: true,
          strict: true,
          target: 'ES2022',
        },
        exclude: ['node_modules'],
        include: ['**/*.ts'],
      }),
      'utf8',
    );
    await writeFile(join(root, 'baseline.ts'), 'export const baseline = true;\n', 'utf8');

    const result = await runRouteVerification({
      rootDir: root,
      project: 'tsconfig.json',
      log: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(result.cases.every((item) => item.status === 'passed')).toBe(true);
  }, 60_000);

  it('keeps fixtures only when explicitly requested', async () => {
    const root = await createFakeProject(false);
    temporaryDirectories.push(root);

    const result = await runRouteVerification({
      rootDir: root,
      project: 'tsconfig.json',
      keepFixtures: true,
      log: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(result.fixtureDirectory).toBeDefined();
    await rm(result.fixtureDirectory!, { recursive: true, force: true });
  }, 60_000);

  it('stops before creating fixtures when the project baseline is already broken', async () => {
    const root = await createFakeProject(true);
    temporaryDirectories.push(root);

    const result = await runRouteVerification({
      rootDir: root,
      project: 'tsconfig.json',
      log: () => undefined,
    });

    expect(result.exitCode).toBe(1);
    expect(result.baseline.status).toBe('failed');
    expect(result.cases).toEqual([]);
    expect(result.diagnostics[0]).toContain('baseline');
  });
});

async function createFakeProject(alwaysFail: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-route-verify-test-'));
  const binDirectory = join(root, 'node_modules', '.bin');
  await mkdir(binDirectory, { recursive: true });
  await writeFile(join(root, 'tsconfig.json'), '{}\n', 'utf8');

  const expectedDiagnostics = createRouteVerificationFixtures()
    .filter((fixture) => fixture.kind === 'negative')
    .flatMap((fixture) => fixture.expected)
    .map((message) => `echo ${JSON.stringify(message)}`)
    .join('\n');
  const script = `#!/bin/sh
state="${join(binDirectory, 'verification-count')}"
count=0
if [ -f "$state" ]; then count=$(cat "$state"); fi
count=$((count + 1))
printf '%s' "$count" > "$state"
${alwaysFail ? 'echo "existing project error"\nexit 1' : `if [ "$count" -ge 3 ]; then
${expectedDiagnostics}
exit 1
fi
exit 0`}
`;
  const compiler = join(binDirectory, 'tsc');
  await writeFile(compiler, script, 'utf8');
  await chmod(compiler, 0o755);
  const angularCompiler = join(binDirectory, 'ngc');
  await writeFile(angularCompiler, script, 'utf8');
  await chmod(angularCompiler, 0o755);
  return root;
}
