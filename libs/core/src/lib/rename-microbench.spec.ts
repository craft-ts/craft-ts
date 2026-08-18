// Runtime micro-benchmark for the wave-1 renames.
//
// The rename touches exactly two operations: building a craft exception, and
// discriminating on it. Everything else is untouched, so nothing else is timed.
//
// It runs on BOTH branches: the meta key is detected rather than hard-coded,
// so the same file measures `code` before the rename and `_tag` after.
//
// Not an assertion of speed — it prints. `vitest run … --reporter=verbose` and
// read the numbers.
import { describe, expect, it } from 'vitest';
import { craftException, isCraftException } from './craft-exception';

const ITERATIONS = 200_000;

/** 'code' before wave 1, '_tag' after. */
function detectMetaKey(): 'code' | '_tag' {
  const probe = craftException({ _tag: 'Probe' } as never) as unknown as Record<
    string,
    unknown
  >;
  return probe['_tag'] === 'Probe' ? '_tag' : 'code';
}

function timeNsPerOp(label: string, run: () => void): number {
  // Warm up so the JIT is not part of the measurement.
  for (let i = 0; i < 10_000; i += 1) run();

  const started = process.hrtime.bigint();
  for (let i = 0; i < ITERATIONS; i += 1) run();
  const elapsed = Number(process.hrtime.bigint() - started);

  const nsPerOp = elapsed / ITERATIONS;
  console.log(`MICROBENCH ${label}: ${nsPerOp.toFixed(1)} ns/op`);
  return nsPerOp;
}

describe('wave-1 rename micro-benchmark', () => {
  it('times exception construction and discrimination', () => {
    const key = detectMetaKey();
    console.log(`MICROBENCH meta-key: ${key}`);

    const meta = { [key]: 'UserNotFound', scope: 'loader' } as never;
    const payload = { userId: 'u-1' };

    timeNsPerOp('construct', () => {
      craftException(meta, payload);
    });

    const exception = craftException(meta, payload) as unknown as Record<
      string,
      unknown
    >;

    timeNsPerOp('discriminate', () => {
      // The whole point of a discriminant: read it and branch.
      if (exception[key] === 'UserNotFound') {
        // consume the payload so the branch is not optimised away
        void exception['payload'];
      }
    });

    timeNsPerOp('isCraftException', () => {
      isCraftException(exception);
    });

    expect(isCraftException(exception)).toBe(true);
  });
});
