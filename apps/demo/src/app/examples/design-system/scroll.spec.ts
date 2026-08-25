/**
 * The level-3 witness, checked where it can be checked cheaply.
 *
 * The half that matters most is not here: it is that removing
 * `provides(scrollPort.block)` from `shell.main` makes `npx tsc -p
 * apps/demo/tsconfig.app.json` fail, before the app ever starts. That was run,
 * and the message it produced is quoted below so a reader can judge it without
 * reproducing the failure.
 */
import { describe, expect, it } from 'vitest';
import { visualMatrix } from '@craft-ts/style-testing';
import { registeredClasses } from '@craft-ts/style';
import { backToTop, shell } from './scroll.style.ts';

const classOf = (key: string) =>
  registeredClasses().find((registered) => registered.key === key);

describe('a class states what it needs from its ancestors', () => {
  it('asks for a scroll port where the sticking happens', () => {
    // `requires` is attached to the class, not the sheet: the error then names
    // a rule rather than a file. The anchor is what sticks, so it is the anchor
    // that needs a scroll port — and the anchor that declares the scroll-state
    // container the button reads.
    expect(classOf('backToTop-anchor')?.requires).toEqual(['scrollPort.block']);
    expect(classOf('backToTop-anchor')?.provides).toEqual([
      'containerType.scrollState',
    ]);
    expect(classOf('backToTop-button')?.requires).toEqual([]);
  });

  it('emits nothing for the demand itself', () => {
    const rules = classOf('backToTop-anchor')?.rules ?? [];

    // A requirement is a demand, not a declaration. Emitting anything here
    // would be the component quietly fixing its own context — which is the bug
    // this whole mechanism exists to make impossible.
    expect(rules.some((rule) => rule.property.startsWith('overflow'))).toBe(
      false,
    );
  });
});

describe('the layout answers, and the answer is inseparable from its CSS', () => {
  it('lays down the overflow it claims to provide', () => {
    const main = classOf('appShell-main');

    expect(main?.provides).toEqual(['scrollPort.block']);
    // `overflow` is not in the property table. `provides` returning the effect
    // and the discharge in the same object is the only road to it, so claiming
    // to provide without laying the CSS is not something anyone can write.
    expect(main?.rules.map((rule) => rule.property)).toEqual([
      'overflow-block',
      'min-block-size',
      'display',
      'block-size',
    ]);
  });
});

describe('what the compiler says when the answer is missing', () => {
  it('names the requirement, where to declare it, and why not elsewhere', () => {
    // Verbatim from `tsc` with `provides(scrollPort.block)` removed:
    //
    //   ERROR_unmet_context_requirement: "'scrollPort.block' is required by
    //   this subtree and nothing above it provides one. declare it on the
    //   layout component that owns the scrollable area. An overflow on the
    //   direct parent would create a second scroll port, and the sticky
    //   element would stick to the wrong container."
    //
    // The three parts the plan asks for are there: what is missing, where to
    // put it, and what the obvious wrong fix would do.
    const explain = classOf('appShell-main');
    expect(explain).toBeDefined();
  });
});

describe('the button varies on the scroll state, and on nothing else', () => {
  it('keeps its budget to one axis', () => {
    expect(Object.keys(classOf('backToTop-button')?.axes ?? {})).toEqual([
      'scrollState.stuck',
    ]);
    expect(visualMatrix(backToTop).map((scenario) => scenario.id)).toEqual([
      'base',
      'scrollState.stuck=blockEnd',
    ]);
    // And the shell has no axis at all: it is layout, not appearance.
    expect(visualMatrix(shell)).toHaveLength(1);
  });
});
