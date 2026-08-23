import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const plugin = require('./index.cjs');

async function lint(
  code: string,
  rule: string,
  filePath = 'fixture.ts',
): Promise<readonly string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: { parser: tsParser },
        plugins: { 'craft-ts': plugin },
        rules: { [`craft-ts/${rule}`]: 'error' },
      },
    ],
  });
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.message);
}

describe('craft-ts security rules', () => {
  it('ships inside the recommended and effect presets', () => {
    const securityRules = Object.keys(plugin.configs.security.rules);
    expect(securityRules).toHaveLength(8);
    for (const rule of securityRules) {
      // Ces garde-fous portent sur des vecteurs d'attaque : ils ne sont pas
      // laissés à l'adhésion de chaque projet.
      expect(plugin.configs.recommended.rules[rule]).toBe('error');
      expect(plugin.configs.effect.rules[rule]).toBe('error');
    }
  });

  describe('no-raw-user-url', () => {
    it('reports a dynamic URL', async () => {
      const messages = await lint(
        `a('book', { href: userProvided }, 'title');`,
        'no-raw-user-url',
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('safeUrl');
    });

    it('reports a template generator that returns an unchecked URL', async () => {
      expect(
        await lint(
          `a('book', { href: function* () { return (yield* book()).url; } }, 'x');`,
          'no-raw-user-url',
        ),
      ).toHaveLength(1);
    });

    it('ignores plain accessors and business fields named like attributes', async () => {
      expect(
        await lint(
          `const boundary = { href: () => location.href };
           export const BrowserLocation = { href: callBrowserLocation('href') };
           const route = { data: settled.value, ping: interval };`,
          'no-raw-user-url',
        ),
      ).toEqual([]);
    });

    it('accepts a sanitized URL and a literal', async () => {
      expect(
        await lint(
          `a('x', { href: safeUrl(value) }, 'x');
           img('x', { src: safeResourceUrl(value) });
           img('y', { srcset: safeUrlList(value, true) });
           a('z', { href: '/static' }, 'z');
           a('w', { href: condition ? safeUrl(x) : '/fallback' }, 'w');
           a('v', { href: function* () { return safeUrl((yield* book()).url); } }, 'v');`,
          'no-raw-user-url',
        ),
      ).toEqual([]);
    });
  });

  describe('no-unsafe-html', () => {
    it('reports raw sinks and dynamic evaluation', async () => {
      expect(
        await lint(`element.innerHTML = value;`, 'no-unsafe-html'),
      ).toHaveLength(1);
      expect(
        await lint(`element.insertAdjacentHTML('beforeend', value);`, 'no-unsafe-html'),
      ).toHaveLength(1);
      expect(await lint(`eval(value);`, 'no-unsafe-html')).toHaveLength(1);
      expect(await lint(`document.write(value);`, 'no-unsafe-html')).toHaveLength(1);
    });

    it('requires a recorded exception next to unsafeHtml', async () => {
      expect(await lint(`const html = unsafeHtml(value);`, 'no-unsafe-html')).toHaveLength(1);
      expect(
        await lint(
          `const exception = allowUnsafe('raw-html', {
             owner: 'frontend',
             reason: 'Backend-sanitized newsletter',
             risk: 'low',
             expires: '2027-01-01',
           });
           const html = unsafeHtml(value);`,
          'no-unsafe-html',
        ),
      ).toEqual([]);
    });
  });

  describe('no-trust-forwarded-headers', () => {
    it('reports a forwarded header outside the proxy boundary', async () => {
      expect(
        await lint(`const ip = headers.get('x-forwarded-for');`, 'no-trust-forwarded-headers'),
      ).toHaveLength(1);
    });

    it('allows the module that validates them', async () => {
      expect(
        await lint(
          `const ip = headers.get('x-forwarded-for');`,
          'no-trust-forwarded-headers',
          'proxy-boundary.ts',
        ),
      ).toEqual([]);
    });
  });

  describe('require-server-function-timeout', () => {
    it('reports a registry without limits', async () => {
      expect(
        await lint(`createServer({ functions: [fn] });`, 'require-server-function-timeout'),
      ).toHaveLength(1);
    });

    it('ignores node:http createServer', async () => {
      expect(
        await lint(`createServer({ keepAlive: true });`, 'require-server-function-timeout'),
      ).toEqual([]);
    });

    it('accepts declared limits', async () => {
      expect(
        await lint(
          `createServer({
             functions: [fn],
             runtimeOptions: { timeoutMs: 15000, maxBodyBytes: 1048576 },
           });`,
          'require-server-function-timeout',
        ),
      ).toEqual([]);
    });
  });

  describe('require-public-error-mapping', () => {
    it('reports a missing or empty catalogue', async () => {
      expect(
        await lint(`createServer({ functions: [fn] });`, 'require-public-error-mapping'),
      ).toHaveLength(1);
      expect(
        await lint(
          `createServer({ functions: [fn], publicErrors: {} });`,
          'require-public-error-mapping',
        ),
      ).toHaveLength(1);
    });

    it('accepts a described catalogue', async () => {
      expect(
        await lint(
          `createServer({
             functions: [fn],
             publicErrors: { UsersNotFound: { code: 'USERS_NOT_FOUND', status: 404 } },
           });`,
          'require-public-error-mapping',
        ),
      ).toEqual([]);
    });
  });

  describe('no-unsafe-transfer-state', () => {
    it('reports an implicit transfer policy', async () => {
      expect(
        await lint(`captureCraftTransferSnapshot(registry);`, 'no-unsafe-transfer-state'),
      ).toHaveLength(1);
      expect(
        await lint(`renderCraft({ config, url });`, 'no-unsafe-transfer-state'),
      ).toHaveLength(1);
    });

    it('accepts an explicit policy, including through a spread', async () => {
      expect(
        await lint(
          `captureCraftTransferSnapshot(registry, { policy });
           renderCraft({ config, url, securityPolicy });
           renderCraft({ config, url, ...(nonce ? { securityPolicy } : {}) });`,
          'no-unsafe-transfer-state',
        ),
      ).toEqual([]);
    });
  });

  describe('require-route-security-policy', () => {
    it('reports the route left behind in a server-rendered file', async () => {
      const messages = await lint(
        `craftRoutes('app', [
           { path: 'home', loadComponent: load, ssr: { mode: 'block' } },
           { path: 'orders', loadComponent: load },
         ]);`,
        'require-route-security-policy',
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('"orders"');
    });

    it('sees routes declared with the loadCraftComponent spread', async () => {
      const messages = await lint(
        `craftRoutes('app', [
           { path: 'home', ...loadCraftComponent(load), ssr: { mode: 'block' } },
           { path: 'orders', ...loadCraftComponent(load) },
         ]);`,
        'require-route-security-policy',
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('"orders"');
    });

    it('stays silent on an application that does not render on the server', async () => {
      expect(
        await lint(
          `craftRoutes('app', [
             { path: 'orders', ...loadCraftComponent(load) },
             { path: 'old', redirectTo: 'orders' },
           ]);`,
          'require-route-security-policy',
        ),
      ).toEqual([]);
    });

    it('accepts a fully declared file and ignores redirect-only routes', async () => {
      expect(
        await lint(
          `craftRoutes('app', [
             { path: 'orders', loadComponent: load, ssr: { mode: 'block' } },
             { path: 'old', redirectTo: 'orders' },
           ]);`,
          'require-route-security-policy',
        ),
      ).toEqual([]);
    });
  });

  describe('no-auth-token-in-local-storage', () => {
    it('reports persisted authentication material', async () => {
      expect(
        await lint(
          `localStorage.setItem('access_token', token);`,
          'no-auth-token-in-local-storage',
        ),
      ).toHaveLength(1);
    });

    it('accepts unrelated storage', async () => {
      expect(
        await lint(
          `localStorage.setItem('theme', 'dark');`,
          'no-auth-token-in-local-storage',
        ),
      ).toEqual([]);
    });
  });
});
