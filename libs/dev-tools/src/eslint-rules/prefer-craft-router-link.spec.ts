import { createRequire } from 'node:module';
import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'craft-ts': plugin },
        rules: { 'craft-ts/prefer-craft-router-link': 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath: 'fixture.ts' });
  return result.messages;
}

describe('prefer-craft-router-link', () => {
  it('is enabled by the recommended and effect presets', () => {
    expect(
      plugin.configs.recommended.rules['craft-ts/prefer-craft-router-link'],
    ).toBe('error');
    expect(
      plugin.configs.effect.rules['craft-ts/prefer-craft-router-link'],
    ).toBe('error');
  });

  it('reports absolute and relative internal URLs', async () => {
    const messages = await lint(`
      a({ href: '/animals' }, 'Animals');
      a({ href: 'animals' }, 'Animals');
      a({ href: './animals' }, 'Animals');
      a({ href: '../animals' }, 'Animals');
    `);

    expect(messages).toHaveLength(4);
    expect(messages.map(({ messageId }) => messageId)).toEqual([
      'internal',
      'internal',
      'internal',
      'internal',
    ]);
  });

  it('allows fragment and external native URLs', async () => {
    const messages = await lint(`
      a({ href: '#section' }, 'Section');
      a({ href: 'https://example.com' }, 'External');
      a({ href: 'mailto:hello@example.com' }, 'Email');
      a({ href: 'tel:+33123456789' }, 'Call');
    `);

    expect(messages).toEqual([]);
  });

  it('allows CraftRouterLink and intentional native navigation', async () => {
    const messages = await lint(`
      a({}, 'Animals').pipe(CraftRouterLink({ to: 'animals' }));
      a({ href: '/animals' }, 'Animals').pipe(CraftRouterLink({ to: 'animals' }));
      a({ href: '/animals', target: '_blank' }, 'Animals');
      a({ href: '/animals', download: true }, 'Download');
      a({ href: externalUrl, 'data-navigation': 'external' }, 'External');
    `);

    expect(messages).toEqual([]);
  });

  it('reports dynamic URLs without an explicit native-navigation annotation', async () => {
    const messages = await lint(`a({ href: destination }, 'Go');`);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe('dynamic');
  });

  it('recognizes h() anchors as well as named anchors', async () => {
    const messages = await lint(`h('a', { href: '/animals' }, 'Animals');`);

    expect(messages).toHaveLength(1);
  });
});
