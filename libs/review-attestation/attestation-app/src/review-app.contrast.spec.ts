/**
 * Static contrast proof for the migrated decision-control slice.
 *
 * The surrounding review application still contains legacy CSS and dynamic
 * classes, so this graph deliberately names only the typed subtree. It is a
 * proof of that slice, not an accessibility audit of the remaining legacy
 * surface. Unknown legacy elements must not be downgraded into a passing
 * result just to make a project-wide command green.
 */
import { describe, expect, it } from 'vitest';
import {
  registeredAtoms,
  registeredClasses,
  registeredVars,
} from '@craft-ts/style';
import { styleDump } from '@craft-ts/style/vite';
import {
  analyzeTextContrast,
  mergeStyleDump,
  type DependencyGraph,
  type TextContrastResult,
} from '@craft-ts/dev-tools';
import './review-app.style.ts';

const graph: DependencyGraph = {
  version: 1,
  rootDir: '/repo',
  tsConfigFilePath: '/repo/tsconfig.app.json',
  nodes: [
    { id: 'c:ReviewApp', kind: 'component', label: 'ReviewApp' },
    {
      id: 'theme',
      kind: 'styled-element',
      label: 'div.app-shell',
      details: {
        component: 'ReviewApp',
        componentId: 'c:ReviewApp',
        classKeys: ['reviewTheme-root'],
        mayContainText: false,
        textKind: 'none',
        branch: '',
      },
    },
    {
      id: 'primary',
      kind: 'styled-element',
      label: 'button.AcceptReviewCard',
      details: {
        component: 'ReviewApp',
        componentId: 'c:ReviewApp',
        classKeys: ['reviewDecision-primary'],
        mayContainText: true,
        textKind: 'static',
        branch: '',
      },
    },
    {
      id: 'key',
      kind: 'styled-element',
      label: 'span.key',
      details: {
        component: 'ReviewApp',
        componentId: 'c:ReviewApp',
        classKeys: ['reviewDecision-key'],
        mayContainText: true,
        textKind: 'static',
        branch: '',
      },
    },
  ],
  edges: [
    { from: 'c:ReviewApp', to: 'theme', kind: 'contains', evidence: 'ast' },
    { from: 'theme', to: 'primary', kind: 'contains', evidence: 'ast' },
    { from: 'primary', to: 'key', kind: 'contains', evidence: 'ast' },
  ],
};

const result = (): readonly TextContrastResult[] => {
  const dump = styleDump(
    registeredClasses(),
    registeredAtoms(),
    registeredVars(),
  );
  return analyzeTextContrast(mergeStyleDump(graph, dump), dump);
};

describe('review decision controls', () => {
  it('proves the label and shortcut in every declared colour scheme', () => {
    const results = result();
    expect(results).toHaveLength(4);
    expect(results.every((entry) => entry.kind === 'resolved')).toBe(true);

    for (const entry of results) {
      if (entry.kind !== 'resolved') continue;
      expect(entry.verdict, `${entry.element} in ${entry.scenario.id}`).toBe(
        'pass',
      );
      expect(entry.ratio, `${entry.element} in ${entry.scenario.id}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});
