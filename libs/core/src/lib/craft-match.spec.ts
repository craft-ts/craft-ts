import { describe, expect, expectTypeOf, it } from 'vitest';
import { craftMatch } from './craft-match';

type Status = 'active' | 'idle' | 'error';

describe('craftMatch (single case)', () => {
  it('runs the handler and returns its result on a match', () => {
    const status = 'active' as Status;
    expect(craftMatch(status, 'active', () => 'Running')).toBe('Running');
  });

  it('returns undefined when the case does not match', () => {
    const status = 'idle' as Status;
    expect(craftMatch(status, 'active', () => 'Running')).toBeUndefined();
  });

  it('narrows the value passed to the handler to the matched literal', () => {
    const status = 'error' as Status;
    craftMatch(status, 'error', (value) => {
      expectTypeOf(value).toEqualTypeOf<'error'>();
      return value;
    });
  });

  it('types the result as R | undefined', () => {
    const status = 'active' as Status;
    const result = craftMatch(status, 'active', () => 42);
    expectTypeOf(result).toEqualTypeOf<number | undefined>();
  });
});

describe('craftMatch.exhaustive', () => {
  it('dispatches to the handler for the current value', () => {
    const label = (status: Status) =>
      craftMatch.exhaustive(status, {
        active: () => 'Running',
        idle: () => 'Waiting',
        error: () => 'Failed',
      });

    expect(label('active')).toBe('Running');
    expect(label('idle')).toBe('Waiting');
    expect(label('error')).toBe('Failed');
  });

  it('narrows each handler to its own literal', () => {
    const status = 'active' as Status;
    craftMatch.exhaustive(status, {
      active: (value) => expectTypeOf(value).toEqualTypeOf<'active'>(),
      idle: (value) => expectTypeOf(value).toEqualTypeOf<'idle'>(),
      error: (value) => expectTypeOf(value).toEqualTypeOf<'error'>(),
    });
  });

  it('infers the result as the union of the handler return types', () => {
    const status = 'active' as Status;
    const result = craftMatch.exhaustive(status, {
      active: () => 1,
      idle: () => 'two',
      error: () => true,
    });
    expectTypeOf(result).toEqualTypeOf<number | string | boolean>();
  });

  it('rejects a handler map that is missing a union member', () => {
    const status = 'active' as Status;
    craftMatch.exhaustive(status, {
      active: () => 'Running',
      idle: () => 'Waiting',
      // @ts-expect-error — missing handler for 'error'
      error: undefined,
    });
    // @ts-expect-error — 'error' handler entirely absent
    craftMatch.exhaustive(status, { active: () => 'a', idle: () => 'b' });
  });

  it('rejects a handler for a member outside the union', () => {
    const status = 'active' as Status;
    craftMatch.exhaustive(status, {
      active: () => 'Running',
      idle: () => 'Waiting',
      error: () => 'Failed',
      unknown: () => 'nope',
    });
  });
});
