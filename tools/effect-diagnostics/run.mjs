#!/usr/bin/env node
/**
 * Diagnostic-quality harness for the Effect-compat dossier — plan task 0.4.
 *
 * The task as written asks: "when extraction of the Effect error channel E
 * fails, does the compiler point at the offending guard, or only at
 * assertExhaustiveRouteExceptions?"
 *
 * That question presupposes a mechanism that does not exist yet: E never
 * reaches RouteExceptionUnion at all (finding 0.1-b), so extraction does not
 * "fail" — it is simply absent. What this harness measures instead is the
 * diagnostic quality of the exhaustiveness machinery as it stands today, since
 * that is exactly what a wave-2 E-extraction would inherit.
 *
 * Each case is a file that is EXPECTED to fail to compile. What is recorded is
 * where the error lands and what it says.
 *
 * Usage:  node tools/effect-diagnostics/run.mjs [--keep]
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');
const casesDir = join(here, 'cases');
const keep = process.argv.includes('--keep');

// A guard declares its exceptions through craftGen: RouteExceptionUnion reads
// the generator's YIELDED type, and craftGen is what lifts a returned
// craftException into that channel. A bare `function*` that merely returns (or
// throws) exceptions declares NOTHING, and every handler map is then accepted.
const CRAFT_GUARD = `export const probeGuard = craftGen(function* () {
  const roll = Math.random();
  if (roll < 0.3) {
    return craftException({ code: 'NotFound' }, { id: 'x' });
  }
  if (roll < 0.6) {
    return craftException({ code: 'Unauthorized' }, { reason: 'x' });
  }
  if (roll < 0.9) {
    return craftException({ code: 'RateLimited' }, { retryAfter: 1 });
  }
  return true;
});`;

const handler = (name) => `      ${name}: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),`;

// The exhaustiveness check is NOT a constraint on craftRoute's own definition
// (the union resolves to never there); it is a post-inference assert over the
// whole collection. A case that omits craftRoutes + assertExhaustiveRouteExceptions
// therefore tests nothing at all.
const routeCollection = (handlers) => `export const { probeRoutes } = craftRoutes('probe', [
  craftRoute(
    'probe',
    {
      canActivate: probeGuard,
      loadChildren: () => Promise.resolve([]),
    },
    {
${handlers}
    },
  ),
]);

assertExhaustiveRouteExceptions(probeRoutes);
`;

const cases = [
  {
    name: 'missing-handler',
    what: 'guard can raise 3 exceptions, the handler map covers only 2',
    source: `import {
  assertExhaustiveRouteExceptions,
  craftException,
  craftExceptionHandler,
  craftGen,
  craftRoute,
  craftRoutes,
} from '@craft-ts/core';

${CRAFT_GUARD}

${routeCollection([handler('NotFound'), handler('Unauthorized')].join('\n'))}`,
  },
  {
    name: 'extra-handler',
    what: 'the handler map covers a code the guard cannot raise',
    source: `import {
  assertExhaustiveRouteExceptions,
  craftException,
  craftExceptionHandler,
  craftGen,
  craftRoute,
  craftRoutes,
} from '@craft-ts/core';

${CRAFT_GUARD}

${routeCollection([handler('NotFound'), handler('Unauthorized'), handler('RateLimited'), handler('TotallyMadeUp')].join('\n'))}`,
  },
  {
    name: 'effect-errors-not-extracted',
    what:
      'guard yields an Effect whose E has 3 tags; handlers are written for those tags',
    source: `import {
  assertExhaustiveRouteExceptions,
  craftExceptionHandler,
  craftGen,
  craftRoute,
  craftRoutes,
} from '@craft-ts/core';
import { Data, Effect } from 'effect';

export class NotFound extends Data.TaggedError('NotFound')<{
  readonly id: string;
}> {}
export class Unauthorized extends Data.TaggedError('Unauthorized')<{
  readonly reason: string;
}> {}
export class RateLimited extends Data.TaggedError('RateLimited')<{
  readonly retryAfter: number;
}> {}

const probeEffect: Effect.Effect<
  boolean,
  NotFound | Unauthorized | RateLimited
> = Effect.succeed(true);

// The guard's exceptions live entirely in the Effect's E channel.
export const probeGuard = craftGen(function* () {
  return yield* probeEffect;
});

${routeCollection([handler('NotFound'), handler('Unauthorized'), handler('RateLimited')].join('\n'))}`,
  },
];

function tsconfigFor(caseName) {
  return {
    compilerOptions: {
      noEmit: true,
      target: 'es2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      lib: ['es2022', 'dom'],
      strict: true,
      skipLibCheck: true,
      types: [],
      customConditions: ['@craft-ts/source'],
      paths: { '@craft-ts/core': ['../../libs/core/src/index.ts'] },
    },
    include: [`cases/${caseName}.ts`],
  };
}

mkdirSync(casesDir, { recursive: true });

for (const entry of cases) {
  const file = join(casesDir, `${entry.name}.ts`);
  writeFileSync(file, entry.source);
  const configPath = join(here, `tsconfig.${entry.name}.json`);
  writeFileSync(configPath, `${JSON.stringify(tsconfigFor(entry.name), null, 2)}\n`);

  let output = '';
  try {
    execFileSync('npx', ['tsc', '-p', relative(workspaceRoot, configPath)], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }

  if (!keep) rmSync(configPath, { force: true });

  console.log(`\n${'='.repeat(72)}`);
  console.log(`CASE  ${entry.name}`);
  console.log(`WHAT  ${entry.what}`);
  console.log('='.repeat(72));

  if (output.trim() === '') {
    console.log('  !! compiled cleanly — the mistake is NOT caught at all.');
    continue;
  }

  const lines = output.trim().split('\n');
  const anchors = lines
    .filter((line) => /error TS/.test(line))
    .map((line) => line.split('(')[0]);
  const unique = [...new Set(anchors)];

  console.log(`  errors: ${anchors.length}, anchored in: ${unique.join(', ')}`);
  console.log('  first error, truncated:\n');
  for (const line of lines.slice(0, 6)) {
    console.log(`    ${line.slice(0, 150)}`);
  }
}

if (!keep) rmSync(casesDir, { recursive: true, force: true });
console.log('');
