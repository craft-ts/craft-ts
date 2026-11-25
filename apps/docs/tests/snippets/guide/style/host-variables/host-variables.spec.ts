import { describe, expect, it } from 'vitest';
import {
  registeredAtoms,
  registeredClasses,
  registeredGlobalRules,
  registeredVars,
} from '@craft-ts/style';
import { renderCss, styleDump } from '@craft-ts/style/vite';
import { mergeStyleDump, noDanglingCssVarsFindings } from '@craft-ts/dev-tools';
import { banner } from './banner.style';
import { panel } from './panel.style';

const emptyGraph = {
  version: 1,
  rootDir: '/repo',
  tsConfigFilePath: '/repo/does-not-exist/tsconfig.json',
  nodes: [],
  edges: [],
} as const;

const css = () =>
  renderCss(registeredAtoms(), registeredVars(), {
    globals: registeredGlobalRules(),
  });

describe('guide/style/tokens.md #host-variables', () => {
  it('reads the host contract and the adapter contract, both declared', () => {
    expect(typeof banner.root).toBe('string');
    expect(typeof panel.root).toBe('string');
    const graph = mergeStyleDump(
      { ...emptyGraph, nodes: [], edges: [] },
      styleDump(registeredClasses(), registeredAtoms(), registeredVars()),
    );
    expect(noDanglingCssVarsFindings(graph)).toEqual([]);
  });

  it('registers the contract, never the host page variables', () => {
    const emitted = css();
    expect(emitted).toContain('@property --hostTheme-accent');
    expect(emitted).toContain('@property --shell-accent');
    expect(emitted).not.toContain('@property --host-accent');
    expect(emitted).not.toContain('@property --host-surface-1');
  });

  it('fills the contract from the host variables on :root', () => {
    const emitted = css();
    expect(emitted).toContain('--hostTheme-accent:var(--host-accent)');
    expect(emitted).toContain('--hostTheme-surface:var(--host-surface-1)');
  });
});
