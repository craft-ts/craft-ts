/**
 * The level-1 witness, checked where it can be checked cheaply: on the values
 * the sheet registers, which are the same values the emitter turns into CSS.
 *
 * The visual half of this — the seven statuses looking like they did before —
 * was verified in the browser against the running demo, and is what the visual
 * matrix will take over in wave 2.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { registeredAtoms, registeredClasses } from '@craft-ts/style';
import { status, statusTone, TONE_OF_STATUS, v } from './status.style';

describe('the badge no longer builds a class at runtime', () => {
  it('renders one static class plus a data attribute', () => {
    const source = readFileSync(
      'apps/demo/src/app/ui/status.component.ts',
      'utf8',
    );

    // The old shape was `class: function* () { return `badge badge-${colour}` }`,
    // which made the set of visual states impossible to enumerate.
    expect(source).not.toMatch(/class:\s*function\*/);
    expect(source).toContain("'data-status'");
    expect(typeof status.badge).toBe('string');
  });

  it('has a class for every status the component can be given', () => {
    const tones = new Set(Object.values(TONE_OF_STATUS));

    for (const tone of tones) {
      expect(statusTone[tone].point).toBe(tone);
      // Each point carries the driver that reaches it; an axis without one
      // would put unreachable scenarios in the matrix.
      expect(statusTone[tone].driver).toEqual({
        kind: 'setAttribute',
        name: 'data-status',
        value: tone,
      });
    }
  });
});

describe('the CSS the sheet produces', () => {
  it('reads only variables it declared', () => {
    const declared = new Set([v.bg.declaration.name, v.ink.declaration.name]);
    const used = registeredAtoms()
      .flatMap((atom) => [...atom.value.matchAll(/var\((--[^),]+)/g)])
      .map((match) => match[1])
      // The capture always starts with `--`; the guard is what tells the type,
      // so `declared.has(...)` reads a custom property name and not a string.
      .filter((name): name is `--${string}` => name.startsWith('--'));

    expect(used.length).toBeGreaterThan(0);
    for (const name of used) expect(declared.has(name)).toBe(true);
  });

  it('writes the tone colours through the two variables, not through five classes', () => {
    const badge = registeredClasses().find(
      (registered) => registered.key === 'status-badge',
    );

    const written = badge?.rules
      .filter((rule) => rule.conditions.length > 0)
      .map((rule) => rule.property);
    // Two custom properties per tone, and nothing else: a class per tone per
    // property would have multiplied the atoms by five for no gain.
    expect(new Set(written)).toEqual(new Set(['--status-bg', '--status-ink']));
    expect(written).toHaveLength(10);
  });

  it('carries no unproven debt', () => {
    for (const registered of registeredClasses()) {
      expect(registered.unproven).toEqual([]);
    }
  });
});
