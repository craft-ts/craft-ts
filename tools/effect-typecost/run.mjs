#!/usr/bin/env node
/**
 * Type-level cost harness for the Effect-compat dossier — plan task 0.2.
 *
 * Method. The naive comparison ("a program with Effect" vs "a program without")
 * is worthless: the two programs do not have the same craft surface, so the
 * ratio between them measures nothing. This harness instead holds the craft
 * surface FIXED and varies only the Effect content, then reads the slope.
 *
 *   case A — bare yield: N yields in an otherwise identical query loader,
 *            N in {0,1,5,10}, once with Effect and once with a craft-native
 *            suspension (craftSleep). The slope is the marginal cost of one
 *            yield; comparing the two slopes says what Effect costs *over*
 *            what craft already pays for the same shape.
 *   case B — a ~15-member service, written as a craftService and as an
 *            Effect Context.Tag service.
 *   case C — a route with exhaustiveness checking over 3 exceptions, with the
 *            exceptions originating in craft and in Effect.
 *
 * Usage:  node tools/effect-typecost/run.mjs [--keep]
 *         --keep leaves the generated cases on disk for inspection.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../..');
const casesDir = join(here, 'cases');
const keep = process.argv.includes('--keep');

// ---------------------------------------------------------------------------
// Case sources
// ---------------------------------------------------------------------------

const YIELD_COUNTS = [0, 1, 5, 10];

function caseAEffect(n) {
  const body = Array.from(
    { length: n },
    (_, i) => `      const v${i} = yield* Effect.succeed(${i});`,
  ).join('\n');
  const result = Array.from({ length: n }, (_, i) => `v${i}`).join(', ');
  return `import { query } from '@craft-ts/core';
${n > 0 ? "import { Effect } from 'effect';" : ''}

export function build() {
  return query('probe', {
    params: () => 'p',
    loader: function* () {
${body}
      return { ${result} };
    },
  });
}
`;
}

function caseACraft(n) {
  const body = Array.from(
    { length: n },
    (_, i) => `      const v${i} = yield* craftSleep(${i + 1});`,
  ).join('\n');
  const result = Array.from({ length: n }, (_, i) => `v${i}`).join(', ');
  return `import { craftSleep, query } from '@craft-ts/core';

export function build() {
  return query('probe', {
    params: () => 'p',
    loader: function* () {
${body}
      return { ${result} };
    },
  });
}
`;
}

const MEMBERS = 15;

function caseBCraft() {
  const members = Array.from(
    { length: MEMBERS },
    (_, i) =>
      `    member${i}: craftMethod('member${i}', function* (input: string) {\n      return \`\${input}-${i}\`;\n    }),`,
  ).join('\n');
  return `import { craftMethod, craftService } from '@craft-ts/core';

export const { ProbeService } = craftService(
  { name: 'ProbeService', scope: 'global' },
  function* () {
    return {
${members}
    };
  },
);
`;
}

function caseBEffect() {
  const shape = Array.from(
    { length: MEMBERS },
    (_, i) =>
      `    readonly member${i}: (input: string) => Effect.Effect<string, ProbeError>;`,
  ).join('\n');
  const impl = Array.from(
    { length: MEMBERS },
    (_, i) =>
      `      member${i}: (input: string) => Effect.succeed(\`\${input}-${i}\`),`,
  ).join('\n');
  const uses = Array.from(
    { length: MEMBERS },
    (_, i) => `      const r${i} = yield* service.member${i}('x');`,
  ).join('\n');
  const result = Array.from({ length: MEMBERS }, (_, i) => `r${i}`).join(', ');
  return `import { query } from '@craft-ts/core';
import { Context, Data, Effect } from 'effect';

export class ProbeError extends Data.TaggedError('ProbeError')<{
  readonly why: string;
}> {}

export class ProbeService extends Context.Tag('ProbeService')<
  ProbeService,
  {
${shape}
  }
>() {}

export const probeLayer = {
${impl}
};

export function build(service: {
${shape}
}) {
  return query('probe', {
    params: () => 'p',
    loader: function* () {
${uses}
      return { ${result} };
    },
  });
}
`;
}

function caseCCraft() {
  return `import {
  craftException,
  craftExceptionHandler,
  craftRoute,
} from '@craft-ts/core';

// Exceptions are declared by RETURNING them: that is what puts them in
// RouteExceptionUnion and makes the handler map exhaustively checked.
export function* probeGuard() {
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
}

// NOTE: this measures craftRoute's exhaustiveness machinery — RouteExceptionUnion,
// TypedExceptionHandlers and MissingExceptionHandlers, which is where the type
// work lives — but not craftRoutes()/assertExhaustiveRouteExceptions on top.
// Both arms are identical in that respect, so the delta stays attributable.
export const probeRoute = craftRoute(
  'probe',
  {
    canActivate: [probeGuard],
  },
  {
    NotFound: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
    Unauthorized: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
    RateLimited: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
  },
);
`;
}

function caseCEffect() {
  return `import {
  craftException,
  craftExceptionHandler,
  craftRoute,
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

// Same exhaustiveness machinery as the craft arm, PLUS a yielded Effect whose
// E is a 3-member union. Note what this file cannot do: derive the handler map
// from that E. Effect's error channel does not reach RouteExceptionUnion, so
// the craftException returns below still have to be written by hand — see
// finding 0.1-b. What is measured here is therefore the cost of adding Effect
// ON TOP of exhaustiveness, not the cost of exhaustiveness driven by Effect.
export function* probeGuard() {
  const allowed = yield* probeEffect;
  const roll = Math.random();
  if (!allowed || roll < 0.3) {
    return craftException({ code: 'NotFound' }, { id: 'x' });
  }
  if (roll < 0.6) {
    return craftException({ code: 'Unauthorized' }, { reason: 'x' });
  }
  if (roll < 0.9) {
    return craftException({ code: 'RateLimited' }, { retryAfter: 1 });
  }
  return true;
}

// NOTE: this measures craftRoute's exhaustiveness machinery — RouteExceptionUnion,
// TypedExceptionHandlers and MissingExceptionHandlers, which is where the type
// work lives — but not craftRoutes()/assertExhaustiveRouteExceptions on top.
// Both arms are identical in that respect, so the delta stays attributable.
export const probeRoute = craftRoute(
  'probe',
  {
    canActivate: [probeGuard],
  },
  {
    NotFound: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
    Unauthorized: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
    RateLimited: craftExceptionHandler(function* ({ globalError }) {
      return globalError();
    }),
  },
);
`;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const cases = [
  ...YIELD_COUNTS.map((n) => ({
    group: 'A · bare yield',
    arm: 'craft (craftSleep)',
    n,
    name: `a-craft-${n}`,
    source: caseACraft(n),
  })),
  ...YIELD_COUNTS.map((n) => ({
    group: 'A · bare yield',
    arm: 'effect',
    n,
    name: `a-effect-${n}`,
    source: caseAEffect(n),
  })),
  {
    group: 'B · 15-member service',
    arm: 'craft',
    n: MEMBERS,
    name: 'b-craft',
    source: caseBCraft(),
  },
  {
    group: 'B · 15-member service',
    arm: 'effect',
    n: MEMBERS,
    name: 'b-effect',
    source: caseBEffect(),
  },
  {
    group: 'C · route exhaustiveness',
    arm: 'craft',
    n: 3,
    name: 'c-craft',
    source: caseCCraft(),
  },
  {
    group: 'C · route exhaustiveness',
    arm: 'effect',
    n: 3,
    name: 'c-effect',
    source: caseCEffect(),
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
      paths: {
        '@craft-ts/core': ['../../libs/core/src/index.ts'],
        '@craft-ts/component': ['../../libs/component/src/index.ts'],
      },
    },
    include: [`cases/${caseName}.ts`],
  };
}

function measure(caseName) {
  const configPath = join(here, `tsconfig.${caseName}.json`);
  writeFileSync(configPath, `${JSON.stringify(tsconfigFor(caseName), null, 2)}\n`);

  let output;
  let failed = false;
  try {
    output = execFileSync(
      'npx',
      ['tsc', '-p', relative(workspaceRoot, configPath), '--extendedDiagnostics'],
      { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (error) {
    // tsc exits non-zero when the case has type errors; the diagnostics are
    // still printed, and a failing case must be reported, not silently used.
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    failed = true;
  }

  if (!keep) rmSync(configPath, { force: true });

  const read = (label) => {
    const match = output.match(new RegExp(`^${label}:\\s+(\\d+)`, 'm'));
    return match ? Number(match[1]) : null;
  };
  const errors = (output.match(/error TS\d+/g) ?? []).length;

  return {
    types: read('Types'),
    instantiations: read('Instantiations'),
    errors,
    failed,
  };
}

mkdirSync(casesDir, { recursive: true });

const results = [];
for (const entry of cases) {
  writeFileSync(join(casesDir, `${entry.name}.ts`), entry.source);
  process.stderr.write(`measuring ${entry.name}…\n`);
  results.push({ ...entry, ...measure(entry.name) });
}

if (!keep) rmSync(casesDir, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pad = (value, width) => String(value).padEnd(width);
const padStart = (value, width) => String(value).padStart(width);

console.log('\n=== Raw measurements ===\n');
console.log(
  `${pad('case', 24)}${padStart('N', 4)}${padStart('types', 12)}${padStart('instantiations', 16)}${padStart('errors', 8)}`,
);
for (const r of results) {
  console.log(
    `${pad(`${r.name}`, 24)}${padStart(r.n, 4)}${padStart(r.types ?? '—', 12)}${padStart(r.instantiations ?? '—', 16)}${padStart(r.errors, 8)}`,
  );
}

const byName = Object.fromEntries(results.map((r) => [r.name, r]));

// A single averaged slope would be misleading: the first yield in a file pays a
// one-off cost (bringing the machinery into that program) that later yields do
// not. Report the first-yield cost and the marginal cost separately.
function profile(prefix) {
  const at = (n) => byName[`${prefix}-${n}`]?.instantiations ?? null;
  const [zero, one, five, ten] = [at(0), at(1), at(5), at(10)];
  if ([zero, one, five, ten].some((v) => v === null)) return null;
  return {
    base: zero,
    firstYield: one - zero,
    marginal: (ten - one) / 9,
    total10: ten,
  };
}

console.log('\n=== Case A — cost of a yield ===\n');
const craftProfile = profile('a-craft');
const effectProfile = profile('a-effect');
console.log(
  `${pad('arm', 24)}${padStart('base', 10)}${padStart('1st yield', 12)}${padStart('each after', 12)}`,
);
for (const [label, prof] of [
  ['craft (craftSleep)', craftProfile],
  ['effect', effectProfile],
]) {
  if (!prof) continue;
  console.log(
    `${pad(label, 24)}${padStart(prof.base, 10)}${padStart(`+${prof.firstYield}`, 12)}${padStart(`+${prof.marginal.toFixed(1)}`, 12)}`,
  );
}
if (craftProfile && effectProfile) {
  console.log(
    `\nA craft program that imports Effect but yields none costs exactly the same ` +
      `(${effectProfile.base} = ${craftProfile.base}): the import alone is free.`,
  );
  console.log(
    `The first Effect yield costs ${effectProfile.firstYield} instantiations ` +
      `(craft's own first yield: ${craftProfile.firstYield}); each further Effect yield ` +
      `costs ${effectProfile.marginal.toFixed(1)} (craft: ${craftProfile.marginal.toFixed(1)}).`,
  );
}

console.log('\n=== Cases B and C — craft arm vs effect arm ===\n');
for (const [label, craftName, effectName] of [
  ['B · 15-member service', 'b-craft', 'b-effect'],
  ['C · route exhaustiveness', 'c-craft', 'c-effect'],
]) {
  const a = byName[craftName];
  const b = byName[effectName];
  if (!a?.instantiations || !b?.instantiations) continue;
  const delta = b.instantiations - a.instantiations;
  console.log(
    `${pad(label, 26)} craft=${padStart(a.instantiations, 9)}  effect=${padStart(b.instantiations, 9)}  ` +
      `delta=${padStart(delta, 9)} (${((delta / a.instantiations) * 100).toFixed(2)}%)`,
  );
}

const BUDGET_PCT = 3; // reference budget from the style system's wave 0
console.log('\n=== Verdict against the +3% budget ===\n');
for (const [label, craftName, effectName] of [
  ['B · 15-member service', 'b-craft', 'b-effect'],
  ['C · route exhaustiveness', 'c-craft', 'c-effect'],
]) {
  const a = byName[craftName];
  const b = byName[effectName];
  if (!a?.instantiations || !b?.instantiations) continue;
  const pct = ((b.instantiations - a.instantiations) / a.instantiations) * 100;
  console.log(
    `${pad(label, 26)} +${pct.toFixed(2)}%  ${pct <= BUDGET_PCT ? 'UNDER' : 'OVER'} budget ` +
      `(${(BUDGET_PCT / pct).toFixed(0)}x margin)`,
  );
}

const broken = results.filter((r) => r.failed);
if (broken.length > 0) {
  console.log(
    `\n!! ${broken.length} case(s) did not type-check: ${broken.map((r) => r.name).join(', ')}`,
  );
  console.log('   Their numbers are reported but must not be trusted as-is.');
}
console.log('');
