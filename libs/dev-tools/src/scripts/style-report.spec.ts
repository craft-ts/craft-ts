/**
 * The three questions the CLI and the MCP tools both ask.
 *
 * They share this module rather than each reading the graph their own way: one
 * question must not have two answers depending on who asked it.
 */
import { describe, expect, it } from 'vitest';
import type { StyleDump } from './style-graph.ts';
import {
  paletteContrastMatrix,
  styleDebt,
  styleImpact,
  styleMatrix,
} from './style-report.ts';

const dump: StyleDump = {
  classes: [
    {
      key: 'card-root',
      className: 'a',
      axes: { viewport: ['md'] },
      atoms: ['a'],
      unproven: [],
      requires: [],
      provides: [],
      violates: [],
    },
    {
      key: 'badge-root',
      className: 'b',
      axes: { tone: ['danger', 'success'] },
      atoms: ['b'],
      unproven: ['legacy alignment'],
      requires: ['scrollPort.block'],
      provides: [],
      violates: [],
    },
  ],
  atoms: [
    {
      className: 'a',
      property: 'padding',
      value: 'var(--ds-gutter)',
      conditions: ['viewport:md'],
      unproven: '',
    },
    {
      className: 'b',
      property: 'color',
      value: 'var(--ds-ink)',
      conditions: ['tone:danger'],
      unproven: '',
    },
  ],
  vars: [
    {
      name: '--ds-gutter',
      syntax: '<length>',
      inherits: true,
      initialValue: '16px',
      role: 'none',
    },
    {
      name: '--ds-ink',
      syntax: '<color>',
      inherits: true,
      initialValue: '#111318',
      role: 'text',
    },
  ],
};

describe('impact', () => {
  it('narrows to what the change reaches', () => {
    const report = styleImpact(dump, ['--ds-gutter']);

    expect(report.classes).toEqual(['card-root']);
    expect(report.narrowed).toBe(true);
  });

  it('falls back to everything for a name it does not know, and says so', () => {
    const report = styleImpact(dump, ['--who-knows']);

    // Silently narrowing on an unknown name is how a suite skips a capture by
    // accident. The flag is what lets a caller tell the two apart.
    expect(report.classes).toEqual(['badge-root', 'card-root']);
    expect(report.narrowed).toBe(false);
  });
});

describe('matrix', () => {
  it('reports the two numbers a reduction decision hangs on', () => {
    const report = styleMatrix(dump);

    // card: 2 viewports. badge: 3 tones. Median and largest are what the plan
    // gates the reduction wave on, so they are computed rather than eyeballed.
    expect(report.bySheet).toEqual({ 'card-root': 2, 'badge-root': 3 });
    expect(report.total).toBe(5);
    expect(report.median).toBe(2.5);
    expect(report.largest).toEqual({ key: 'badge-root', size: 3 });
  });
});

describe('debt', () => {
  it('lists what is owed, and what nobody is looking at', () => {
    const report = styleDebt(dump);

    expect(report.unproven).toEqual(['badge-root: legacy alignment']);
    expect(report.undischarged).toEqual(['scrollPort.block']);
    expect(report.dischargers).toEqual([]);
    expect(report.unreadVars).toEqual([]);
    expect(report.axesWritingVars).toEqual({});
    // No axis moves a box here; one entry would mean a reduction that assumed
    // otherwise is wrong.
    expect(report.axesTouchingLayout).toEqual({
      viewport: ['padding'],
      tone: ['color'],
    });
  });
});

/* ------------------------------------------------------------------------ *
 * The palette matrix
 * ------------------------------------------------------------------------ */

const token = (
  group: string,
  name: string,
  light: string,
  dark: string,
  role: string,
) => ({ palette: 'ui', group, token: name, role, light, dark, side: 'light' as const });

const onAccent = token('text', 'onAccent', '#ffffff', '#0b0d11', 'text');
const warning = token('accent', 'warning', '#8a5a00', '#f5b544', 'accent');
const page = token('surface', 'page', '#ffffff', '#0b0d11', 'surface');

const palettedDump: StyleDump = {
  version: 2,
  classes: [
    {
      key: 'dsButton-root',
      className: 'ink bg',
      axes: {},
      atoms: ['ink', 'bg'],
      unproven: [],
      requires: [],
      provides: [],
      violates: [],
    },
  ],
  atoms: [
    {
      className: 'ink',
      property: 'color',
      value: '#ffffff',
      conditions: [],
      unproven: '',
      provenance: onAccent,
    },
    {
      className: 'bg',
      property: 'background-color',
      value: '#8a5a00',
      conditions: [],
      unproven: '',
      provenance: warning,
    },
  ],
  vars: [
    {
      name: '--ds-surface',
      syntax: '<color>',
      inherits: true,
      initialValue: '#ffffff',
      role: 'surface',
      initialProvenance: page,
    },
  ],
};

describe('the palette matrix', () => {
  it('gives each pair both of its ratios, light and dark', () => {
    const pairs = paletteContrastMatrix(palettedDump);
    const pair = pairs.find(
      (entry) =>
        entry.foreground === 'ui.text.onAccent' &&
        entry.background === 'ui.accent.warning',
    );
    // The two sides are genuinely different numbers — white on the light
    // warning is 5.93:1, near-black on the dark one is 10.72:1 — which is
    // exactly why one ratio per pair would be a lie about one of the themes.
    expect(pair?.light.ratio).toBeCloseTo(5.927, 2);
    expect(pair?.light.normalText).toBe('pass');
    expect(pair?.dark.ratio).toBeCloseTo(10.719, 2);
    expect(pair?.dark.normalText).toBe('pass');
    expect(pair?.light.ratio).not.toBeCloseTo(pair?.dark.ratio ?? 0, 1);
  });

  it('separates the two thresholds instead of collapsing them', () => {
    const pairs = paletteContrastMatrix(palettedDump, {
      foregroundRoles: ['surface'],
      backgroundRoles: ['accent'],
    });
    const pair = pairs.find((entry) => entry.background === 'ui.accent.warning');
    // `#ffffff` on `#8a5a00` is 5.93 — a pass at both thresholds. What the
    // shape buys is that a 3.8 would read pass at 3 and fail at 4.5 rather
    // than becoming one undifferentiated verdict.
    expect(pair?.light).toMatchObject({ normalText: 'pass', largeText: 'pass' });
  });

  it('names where a pair is rendered, from the analysis and not the dump', () => {
    // Co-occurrence in a sheet is not usage: a theme rule can write two
    // tokens into two variables and put neither on top of the other. Only a
    // resolved result says an element is actually painted in the pair.
    const pairs = paletteContrastMatrix(palettedDump, {
      usages: [
        {
          kind: 'resolved',
          component: 'DsButton',
          element: 'button.root',
          scenario: { id: 'base', axes: {} },
          equivalentScenarios: [],
          foreground: { value: '#ffffff', source: 'x', token: 'ui.text.onAccent' },
          background: { value: '#8a5a00', source: 'y', token: 'ui.accent.warning' },
          fontSizePx: 14,
          fontWeight: 600,
          textScale: 'normal',
          ratio: 5.927,
          required: 4.5,
          verdict: 'pass',
        },
      ],
    });
    const used = pairs.find(
      (entry) =>
        entry.foreground === 'ui.text.onAccent' &&
        entry.background === 'ui.accent.warning',
    );
    expect(used?.usedBy).toEqual(['DsButton/button.root']);
    const unused = pairs.find(
      (entry) => entry.background === 'ui.surface.page',
    );
    expect(unused?.usedBy).toEqual([]);
  });

  it('leaves usedBy absent when nobody supplied an analysis', () => {
    // Absent and empty are different answers: `[]` means the analysis looked
    // and found nowhere, `undefined` means nobody looked. Collapsing them
    // would let `--palette-contrast`, which never builds the program, report
    // every pair as unused.
    const pair = paletteContrastMatrix(palettedDump)[0];
    expect(pair && 'usedBy' in pair).toBe(false);
  });

  it('leaves a pair nobody renders in the table, and says nobody renders it', () => {
    // The reason this table is informative and not a gate: `onAccent` over
    // `surface.page` is a real pair of the palette and it is white on white.
    // Failing a build on it would be failing on a combination that does not
    // exist in the application.
    const pair = paletteContrastMatrix(palettedDump).find(
      (entry) =>
        entry.foreground === 'ui.text.onAccent' &&
        entry.background === 'ui.surface.page',
    );
    expect(pair?.light.ratio).toBeCloseTo(1, 6);
    expect(pair?.light.normalText).toBe('fail');
  });

  it('lists a token once, whichever side it was reached from', () => {
    const names = paletteContrastMatrix(palettedDump).map(
      (entry) => entry.foreground,
    );
    expect(new Set(names)).toEqual(new Set(['ui.text.onAccent']));
  });
});
