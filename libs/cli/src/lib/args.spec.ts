import { describe, expect, it } from 'vitest';
import { parseArguments } from './args.js';

const SPEC = { values: ['config', 'root'], flags: ['json'] } as const;

describe('parseArguments', () => {
  it('reads the first positional as the command', () => {
    expect(parseArguments(['check', '--json'], SPEC).command).toBe('check');
  });

  it('reads values and flags', () => {
    const parsed = parseArguments(
      ['--config', 'craft.deploy.json', '--json'],
      SPEC,
    );

    expect(parsed.values['config']).toBe('craft.deploy.json');
    expect(parsed.flags.has('json')).toBe(true);
  });

  it('collects unknown options instead of ignoring them', () => {
    expect(parseArguments(['--provider', 'alchemy'], SPEC).unknown).toEqual([
      '--provider',
    ]);
  });

  it('reports a value option used without a value', () => {
    expect(parseArguments(['--config', '--json'], SPEC).unknown).toEqual([
      '--config (missing value)',
    ]);
  });
});
