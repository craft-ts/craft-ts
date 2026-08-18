import {
  type Signal,
} from './host/craft-compat';
import { describe, expect, it } from 'vitest';
import { craftException } from './craft-exception';
import { craftGen, CraftGenShortCircuit } from './craft-gen';
import { SERVICE_YIELD_REQUEST_MARKER } from './craft-generator-runtime';
import { createPrimitiveGen } from './craft-primitive-gen';
import { onAppStart } from './craft-service';
import { craftUse } from './craft-use';
import { craftUntilDefined } from './craft-until-settled';

describe('craftUse', () => {
  it('drives an inline generator and resolves its dependency yields', () => {
    const request = {
      [SERVICE_YIELD_REQUEST_MARKER]: true,
      scope: 'global',
      resolve: () => 'resolved-dependency',
    } as const;

    const result = craftUse(
      (function* () {
        const resolved = yield request;
        return { resolved };
      })(),
    );

    expect(result).toEqual({ resolved: 'resolved-dependency' });
  });

  it('returns the success value of a craftGen invocation', () => {
    const okGuard = craftGen(function* (value: number) {
      return value * 2;
    });

    expect(craftUse(okGuard(21))).toBe(42);
  });

  it('propagates CraftGenShortCircuit from a craftGen invocation', () => {
    const failGuard = craftGen(function* () {
      return craftException({ _tag: 'FORBIDDEN' });
    });

    expect(() => craftUse(failGuard())).toThrow(CraftGenShortCircuit);
  });

  it('accepts an argument-less generator function', () => {
    const result = craftUse(function* () {
      return 'from-generator-function';
    });

    expect(result).toBe('from-generator-function');
  });

  it('drives a trivial primitive generator outside any injection context', () => {
    const ref = { value: () => 7 };

    expect(craftUse(createPrimitiveGen(ref))).toBe(ref);
  });

  it('returns undefined when driving an already-consumed primitive generator', () => {
    const gen = createPrimitiveGen({ value: 1 });

    expect(craftUse(gen)).toEqual({ value: 1 });
    expect(craftUse(gen)).toBeUndefined();
  });

  it('rejects onAppStart(...) with a dedicated error', () => {
    expect(() =>
      craftUse(function* () {
        yield* onAppStart(() => undefined);
        return 1;
      }),
    ).toThrow(/craftUse\(\.\.\.\) does not support onAppStart/);
  });

  it('rejects guard await requests (craftUntilDefined/craftUntilSettled) with a dedicated error', () => {
    const neverReady = (() => undefined) as unknown as Signal<string>;

    expect(() => craftUse(craftUntilDefined(neverReady))).toThrow(
      /craftUse\(\.\.\.\) does not support craftUntilSettled/,
    );
  });

  it('rejects unknown yields with the craftUse error message', () => {
    expect(() =>
      craftUse(
        (function* () {
          yield { some: 'unknown-yield' };
        })(),
      ),
    ).toThrow(/craftUse\(\.\.\.\) generators can only yield/);
  });
});
