import { ESLint } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import craftRules from './index.cjs';

const MESSAGES = {
  fixture: 'Importez `test` depuis la fixture craft-session, sinon la session n’est pas rattachée au test.',
  annotation: "Ajoutez `annotation: craftSession({ id: '<slug>' })` aux détails du test.",
  describe: 'L’annotation craftSession se pose sur chaque test, pas sur le groupe : un id hérité par plusieurs tests serait dupliqué.',
  options: 'craftSession doit recevoir un objet littéral avec un id chaîne littérale valide (80 caractères maximum).',
  keep: 'keep doit être un entier de 1 à 10 ; au-delà de 1, ajoutez une reason non vide.',
  keepLiteral: 'keep doit être un entier littéral : le contrat se lit sans exécuter le fichier.',
  reasonLiteral: 'reason doit être une chaîne littérale : le contrat se lit sans exécuter le fichier.',
  context: 'Utilisez craftSessions.newContext() afin de rattacher ce contexte au test.',
};
const HEADER = "import { test, craftSession } from './fixtures';\n";

describe('craft-ts/e2e-session-contract', () => {
  it('requires the local fixture and an annotation, while accepting the contract', async () => {
    expect(await lint("import { test } from '@playwright/test'; test('one', async () => {});"))
      .toEqual(expect.arrayContaining([MESSAGES.fixture, MESSAGES.annotation]));
    expect(await lint(`${HEADER}test('one', { annotation: craftSession({ id: 'cart.checkout' }) }, async () => {});`)).toEqual([]);
  });

  it('validates ids, keep/reason, duplicate ids, and manual contexts', async () => {
    const messages = await lint(`${HEADER}
      test('one', { annotation: craftSession({ id: 'Bad', keep: 3 }) }, async () => {});
      test('two', { annotation: craftSession({ id: 'same' }) }, async () => {});
      test('three', { annotation: craftSession({ id: 'same' }) }, async () => {});
      browser.newContext();
    `);
    expect(messages).toEqual(expect.arrayContaining([
      MESSAGES.options, MESSAGES.keep, 'L’id craftSession "same" est déclaré plusieurs fois dans ce fichier.', MESSAGES.context,
    ]));
  });

  describe('calls that do not declare a test', () => {
    it.each([
      'test.skip();',
      'test.fixme();',
      'test.slow();',
      "test.skip(process.env.CI !== undefined, 'lent en CI');",
      'test.skip(({ browserName }) => browserName === "webkit");',
      "test.describe('panier', () => {});",
      "test.describe.skip('panier', () => {});",
      "test.describe.only('panier', () => {});",
      "test.describe.serial('panier', () => {});",
      "test.describe.configure({ mode: 'serial' });",
      'test.beforeEach(async () => {});',
      "test.use({ locale: 'fr-FR' });",
    ])('accepts %s', async (code) => {
      expect(await lint(`${HEADER}${code}`)).toEqual([]);
    });

    it.each([
      "test.skip('panier', async () => {});",
      "test.only('panier', async () => {});",
      "test.fixme('panier', async () => {});",
      "test.fail('panier', async () => {});",
    ])('still requires an annotation on %s', async (code) => {
      expect(await lint(`${HEADER}${code}`)).toEqual([MESSAGES.annotation]);
    });
  });

  it('refuses an annotation on a describe group', async () => {
    expect(await lint(`${HEADER}test.describe('panier', { annotation: craftSession({ id: 'cart' }) }, () => {});`)).toEqual([MESSAGES.describe]);
  });

  it('refuses non-literal keep and reason', async () => {
    expect(await lint(`${HEADER}const KEEP = 3; test('a', { annotation: craftSession({ id: 'a', keep: KEEP, reason: 'flaky' }) }, async () => {});`)).toEqual([MESSAGES.keepLiteral]);
    expect(await lint(`${HEADER}const REASON = 'x'; test('a', { annotation: craftSession({ id: 'a', keep: 2, reason: REASON }) }, async () => {});`)).toEqual([MESSAGES.reasonLiteral]);
    expect(await lint(`${HEADER}test('a', { annotation: craftSession({ id: 'a', keep: 2, reason: \`deux parcours\` }) }, async () => {});`)).toEqual([]);
  });

  it('accepts loop-generated ids, plain or in a template', async () => {
    expect(await lint(`${HEADER}
      for (const id of ['orders.list', 'orders.detail']) test(id, { annotation: craftSession({ id }) }, async () => {});
      for (const name of ['list', 'detail']) test(name, { annotation: craftSession({ id: \`orders.\${name}\` }) }, async () => {});
    `)).toEqual([]);
    expect(await lint(`${HEADER}const name = 'x'; test(name, { annotation: craftSession({ id: \`orders.\${name}\` }) }, async () => {});`)).toEqual([MESSAGES.options]);
  });

  it('suggests an annotation built from the title', async () => {
    const eslint = engine({});
    const [result] = await eslint.lintText(`${HEADER}test('Passer la Commande', async () => {});`, { filePath: 'e2e/test.spec.ts' });
    expect(result?.messages[0]?.suggestions?.[0]).toMatchObject({ desc: "Ajouter `annotation: craftSession({ id: 'passer-la-commande' })`." });
    expect(result?.messages[0]?.fix).toBeUndefined();
  });

  describe('fixtureFiles', () => {
    const root = mkdtempSync(join(tmpdir(), 'craft-e2e-rule-'));
    mkdirSync(join(root, 'app/e2e/nested'), { recursive: true });
    writeFileSync(join(root, 'app/e2e/fixtures.ts'), '');
    afterAll(() => rmSync(root, { recursive: true, force: true }));
    const options = { fixtureFiles: ['app/e2e/fixtures.ts'] };

    it.each([
      ['app/e2e/a.spec.ts', './fixtures'],
      ['app/e2e/a.spec.ts', './fixtures.ts'],
      ['app/e2e/a.spec.ts', './fixtures.js'],
      ['app/e2e/nested/a.spec.ts', '../fixtures'],
    ])('resolves the import of %s from %s', async (file, source) => {
      expect(await lint(`import { test, craftSession } from '${source}'; test('a', { annotation: craftSession({ id: 'a' }) }, async () => {});`, options, join(root, file), root)).toEqual([]);
    });

    it('refuses another module with the same specifier', async () => {
      expect(await lint("import { test, craftSession } from './fixtures'; test('a', { annotation: craftSession({ id: 'a' }) }, async () => {});", options, join(root, 'other/a.spec.ts'), root)).toEqual([MESSAGES.fixture]);
    });
  });
});

function engine(options: Record<string, unknown>, cwd?: string): ESLint {
  return new ESLint({
    ...(cwd ? { cwd } : {}),
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.spec.ts'],
      plugins: { 'craft-ts': craftRules },
      rules: { 'craft-ts/e2e-session-contract': ['error', { fixtureModules: ['./fixtures'], ...options }] },
    }],
  });
}

async function lint(code: string, options: Record<string, unknown> = {}, filePath = 'test.spec.ts', cwd?: string): Promise<string[]> {
  const rule = 'fixtureFiles' in options ? { fixtureFiles: options['fixtureFiles'] } : options;
  const eslint = 'fixtureFiles' in options
    ? new ESLint({ cwd, overrideConfigFile: true, overrideConfig: [{ files: ['**/*.spec.ts'], plugins: { 'craft-ts': craftRules }, rules: { 'craft-ts/e2e-session-contract': ['error', rule] } }] })
    : engine(options);
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.map((message) => message.message) ?? [];
}
