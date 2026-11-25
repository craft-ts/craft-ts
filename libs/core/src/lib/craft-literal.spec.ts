import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { Equal, Expect } from 'test-type';
import { craftComputed } from './craft-computed';
import { craftLiteral } from './craft-literal';
import { craftUse } from './craft-use';
import { CraftTestBed } from './host/craft-test-bed';
import { craftSignal } from './host/craft-signal';

describe('craftLiteral', () => {
  beforeEach(() => {
    CraftTestBed.resetTestingModule();
  });

  it('returns the technical value unchanged, typed as its literal', () => {
    const drawerOpen = craftLiteral('open');

    expect(drawerOpen).toBe('open');
    expectTypeOf(drawerOpen).toEqualTypeOf<'open'>();

    type _KeepsTheLiteral = Expect<Equal<typeof drawerOpen, 'open'>>;
  });

  it('lets a computed returning marked values infer their union', () => {
    const drawerOpen = craftLiteral('open');
    const drawerClosed = craftLiteral('closed');
    const open = craftSignal(false);

    const drawerState = CraftTestBed.runInInjectionContext(() =>
      craftUse(
        craftComputed('drawerState', () => (open() ? drawerOpen : drawerClosed)),
      ),
    );
    const drawerStateFromGenerator = CraftTestBed.runInInjectionContext(() =>
      craftUse(
        craftComputed('drawerStateFromGenerator', function* () {
          return open() ? drawerOpen : drawerClosed;
        }),
      ),
    );

    expect(craftUse(drawerState())).toBe('closed');
    open.set(true);
    expect(craftUse(drawerState())).toBe('open');
    expect(craftUse(drawerStateFromGenerator())).toBe('open');

    const plainValue = craftUse(drawerState());
    const generatorValue = craftUse(drawerStateFromGenerator());
    expectTypeOf(plainValue).toEqualTypeOf<'open' | 'closed'>();
    expectTypeOf(generatorValue).toEqualTypeOf<'open' | 'closed'>();

    type _ComputedInfersTheUnion = Expect<
      Equal<typeof plainValue, 'open' | 'closed'>
    >;
  });
});
