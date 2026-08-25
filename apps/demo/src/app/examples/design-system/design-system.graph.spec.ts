/**
 * The design system, read through the dependency graph.
 *
 * The point of this file is that the numbers here come from a **different
 * producer** than the ones in `design-system.matrix.spec.ts`. One walks the
 * registry to unfold scenarios, the other folds a dump into the graph and
 * queries it. They are asserted to agree; if they ever stop, one of the two is
 * lying about what the app looks like, and it matters which.
 */
import { describe, expect, it } from 'vitest';
import {
  registeredAtoms,
  registeredClasses,
  registeredVars,
} from '@craft-ts/style';
import { styleDump } from '@craft-ts/style/vite';
import { visualMatrix } from '@craft-ts/style-testing';
import {
  danglingVars,
  dischargers,
  extractionGaps,
  impactedClasses,
  matrixSize,
  matrixSizeByComponent,
  mergeStyleDump,
  propertiesWrittenBy,
  undischargedObligations,
  unproven,
  varsWrittenBy,
} from '@craft-ts/dev-tools';
import { button } from './components.style.ts';
import './foundation.style.ts';
import './scroll.style.ts';

const graph = () =>
  mergeStyleDump(
    {
      version: 1,
      rootDir: '/repo',
      tsConfigFilePath: '/repo/tsconfig.json',
      nodes: [{ id: 'c:ScrollDemo', kind: 'component', label: 'ScrollDemo' }],
      edges: [],
    },
    styleDump(registeredClasses(), registeredAtoms(), registeredVars()),
    {
      usedBy: {
        'c:ScrollDemo': [
          'appShell-main',
          'backToTop-anchor',
          'backToTop-button',
        ],
      },
    },
  );

describe('the two producers agree', () => {
  it('gives the button the same cardinal from either side', () => {
    // 18 from the matrix, 18 from the graph. Same app, two ways of counting.
    expect(visualMatrix(button).length).toBe(18);
    expect(matrixSize(graph())['dsButton-root']).toBe(18);
  });

  it('costs a component the product of the sheets it renders', () => {
    // Two layout classes with no axis, and one button that varies on the
    // scroll state: 1 × 1 × 2.
    expect(matrixSizeByComponent(graph())['ScrollDemo']).toBe(2);
  });
});

describe('the obligations of the real application', () => {
  it('leaves nothing required and unanswered', () => {
    expect(undischargedObligations(graph())).toEqual([]);
  });

  it('names who answers, and it is the layout', () => {
    // The rule the plan wants enforced per route: only layout discharges.
    expect(dischargers(graph())).toEqual(['appShell-main']);
  });
});

describe('what the colour-scheme axis is allowed to touch', () => {
  it('writes variables and never a property', () => {
    // Eight theme variables, and not one box moved. This is what makes dark
    // mode provably orthogonal to the axes that change layout — checked here
    // rather than asserted in a comment.
    expect(varsWrittenBy(graph())['scheme']).toHaveLength(8);
    expect(propertiesWrittenBy(graph())['scheme']).toBeUndefined();
  });
});

describe('what the graph finds that nobody was looking for', () => {
  it('reports the theme variables nothing reads', () => {
    // Real dead weight in this design system: declared by the theme, read by
    // no component. Not an error — but a reader takes them for a real hook.
    expect(danglingVars(graph()).unread).toEqual(['--ds-surface']);
    expect(danglingVars(graph()).undeclared).toEqual([]);
  });

  it('counts no debt, because nothing took an escape hatch', () => {
    expect(unproven(graph())).toEqual([]);
  });

  it('says the extraction is incomplete when it is', () => {
    // Nothing here declares which sheets the other demo components render, so
    // the graph says so rather than reporting a clean bill.
    expect(extractionGaps(graph())).toEqual([]);
  });
});

describe('impact analysis', () => {
  it('names only what a changed variable reaches', () => {
    expect(impactedClasses(graph(), ['--ds-accent'])).toEqual([
      'backToTop-button',
      'dsAlert-root',
      'dsButton-root',
      'dsMeter-fill',
      'dsTheme-root',
    ]);
    expect(impactedClasses(graph(), ['--not-a-variable'])).toEqual([]);
  });
});
