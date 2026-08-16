import { describe, expect, it } from 'vitest';
import {
  craftTextLoaderPlugin,
  rewriteTextLoaderImports,
} from './vite-text-loader-plugin.mjs';

describe('rewriteTextLoaderImports', () => {
  it('rewrites CSS text-loader import attributes to Vite ?raw', () => {
    const source = `import styles from './mutation.css' with { loader: 'text' };`;

    expect(rewriteTextLoaderImports(source)).toBe(
      `import styles from './mutation.css?raw';`,
    );
  });

  it('keeps double-quoted specifiers and leaves other imports alone', () => {
    const source = [
      `import styles from "./query.css" with { loader: "text" };`,
      `import { query } from '@craft-ng/core';`,
    ].join('\n');

    expect(rewriteTextLoaderImports(source)).toBe(
      [
        `import styles from "./query.css?raw";`,
        `import { query } from '@craft-ng/core';`,
      ].join('\n'),
    );
  });
});

describe('craftTextLoaderPlugin', () => {
  it('runs before esbuild so import attributes are stripped first', () => {
    const plugin = craftTextLoaderPlugin();

    expect(plugin.enforce).toBe('pre');
    expect(
      plugin.transform(
        `import styles from './mutation.css' with { loader: 'text' };`,
        '/app/mutation.ts',
      ),
    ).toEqual({
      code: `import styles from './mutation.css?raw';`,
      map: null,
    });
  });
});
