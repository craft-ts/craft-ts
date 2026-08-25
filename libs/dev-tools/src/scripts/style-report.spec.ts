/**
 * The three questions the CLI and the MCP tools both ask.
 *
 * They share this module rather than each reading the graph their own way: one
 * question must not have two answers depending on who asked it.
 */
import { describe, expect, it } from 'vitest';
import type { StyleDump } from './style-graph.ts';
import { styleDebt, styleImpact, styleMatrix } from './style-report.ts';

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
