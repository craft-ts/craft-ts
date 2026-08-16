import { describe, expect, it } from 'vitest';
import { toViteCliArgs } from './vite-serve-args.mjs';

describe('toViteCliArgs', () => {
  it('maps --configuration production to --mode production', () => {
    expect(toViteCliArgs(['--configuration', 'production'])).toEqual([
      '--mode',
      'production',
    ]);
  });

  it('maps --configuration=development to --mode development', () => {
    expect(toViteCliArgs(['--configuration=development'])).toEqual([
      '--mode',
      'development',
    ]);
  });

  it('forwards unrelated Vite args beside the mapped mode', () => {
    expect(
      toViteCliArgs(['--host', '0.0.0.0', '--configuration', 'production']),
    ).toEqual(['--host', '0.0.0.0', '--mode', 'production']);
  });
});
