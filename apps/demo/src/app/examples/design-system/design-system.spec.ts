/**
 * What the mini design system claims, checked on the values its sheets
 * register — the same values the emitter turns into CSS.
 *
 * The visual half (colours, dark mode, the meter tracking its signal) was
 * verified in the browser against the running demo; wave 2 replaces that with a
 * scenario matrix and baselines.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  registeredAtoms,
  registeredClasses,
  registeredVars,
} from '@craft-ts/style';
import { alert, button, card, meter, stack } from './components.style';
import { dsTheme, theme } from './foundation.style';

const classOf = (key: string) =>
  registeredClasses().find((registered) => registered.key === key);

describe('every class is a constant, and nothing builds one', () => {
  it('hands back plain strings, not functions', () => {
    for (const value of [
      stack.column,
      button.root,
      card.root,
      alert.root,
      meter.track,
    ]) {
      expect(typeof value).toBe('string');
    }
  });

  it('keeps template class bindings free of interpolation', () => {
    // Comments are stripped first: the doc comments in that file quote the
    // shape being replaced, and a check that trips on its own explanation is a
    // check nobody trusts.
    const source = readFileSync(
      'apps/demo/src/app/examples/design-system/ds-components.ts',
      'utf8',
    );
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(code).not.toMatch(/class:\s*function\*/);
    expect(code).not.toMatch(/class:\s*`/);
    expect(code).toContain("'data-tone'");
  });
});

describe('the theme is the only thing that knows the palette', () => {
  it('registers every theme variable as inheriting', () => {
    const themed = registeredVars().filter((declaration) =>
      declaration.name.startsWith('--ds-'),
    );

    expect(themed.length).toBeGreaterThan(0);
    // A theme variable is set on a wrapper and read below it. Registered as
    // non-inheriting — the default — every descendant would silently get the
    // initial value instead, and dark mode would appear to do nothing.
    for (const declaration of themed) {
      expect(declaration.inherits).toBe(true);
    }
  });

  it('keeps component-local variables non-inheriting', () => {
    const local = registeredVars().filter((declaration) =>
      declaration.name.startsWith('--dsButton-'),
    );

    expect(local.length).toBeGreaterThan(0);
    for (const declaration of local) {
      expect(declaration.inherits).toBe(false);
    }
  });

  it('registers lengths with a computationally independent initial value', () => {
    const lengths = registeredVars().filter((declaration) =>
      declaration.syntax.includes('length'),
    );

    expect(lengths.length).toBeGreaterThan(0);
    // `@property` rejects a relative unit here and drops the registration
    // without a word; `cssVars` refuses it instead.
    for (const declaration of lengths) {
      expect(declaration.initialValue).not.toMatch(/r?em|v[wh]/);
    }
  });

  it('flips the whole theme in one place', () => {
    const root = classOf('dsTheme-root');
    const dark = root?.rules.filter((rule) =>
      rule.conditions.some((point) => point.axis === 'scheme'),
    );

    expect(dark?.length).toBe(8);
    // Every dark rule writes a variable. A dark rule touching a property would
    // mean a component knows about dark mode, which is what this avoids.
    for (const rule of dark ?? []) {
      expect(rule.property.startsWith('--ds-')).toBe(true);
    }
  });
});

describe('a variant costs one rule, not one copy of the component', () => {
  it('writes a variable per tone and reads it once', () => {
    const root = classOf('dsButton-root');
    const toned = root?.rules.filter((rule) =>
      rule.conditions.some((point) => point.axis === 'tone'),
    );

    expect(toned).toHaveLength(5);
    expect(new Set(toned?.map((rule) => rule.property))).toEqual(
      new Set(['--dsButton-bg']),
    );
    // And the base rule that reads it exists exactly once.
    expect(
      root?.rules.filter((rule) => rule.property === 'background-color'),
    ).toHaveLength(1);
  });

  it('records only the breakpoint the card actually crosses', () => {
    // `bp` defines sm, md and lg; the card crosses md. Unfolding every point of
    // the axis would triple the captures for scenarios nobody renders.
    expect(classOf('dsCard-root')?.axes['viewport']).toEqual(['md']);
    expect(classOf('dsTheme-root')?.axes['viewport']).toEqual(['md']);
  });
});

describe('the sheet grows with the vocabulary, not with the components', () => {
  it('shares atoms across sheets instead of repeating them', () => {
    const declarations = registeredClasses().reduce(
      (total, registered) => total + registered.rules.length,
      0,
    );

    // Every sheet in the app — the design system, the status badge, the
    // examples — collapses onto a smaller set of atoms than it writes.
    expect(registeredAtoms().length).toBeLessThan(declarations);
  });

  it('carries no unproven debt', () => {
    for (const registered of registeredClasses()) {
      expect(registered.unproven).toEqual([]);
    }
    expect(theme.gutter.declaration.name).toBe('--ds-gutter');
    expect(dsTheme.root.length).toBeGreaterThan(0);
  });
});
