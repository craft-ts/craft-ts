import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import craftRules from './index.cjs';

describe('craft-ts/e2e-session-contract', () => {
  it('requires the local fixture and an annotation, while accepting the contract', async () => {
    expect(await lint("import { test } from '@playwright/test'; test('one', async () => {});"))
      .toEqual(expect.arrayContaining([
        'Importez `test` depuis la fixture craft-session, sinon la session n’est pas rattachée au test.',
        "Ajoutez `annotation: craftSession({ id: '<slug>' })` aux détails du test.",
      ]));
    expect(await lint("import { test, craftSession } from './fixtures'; test('one', { annotation: craftSession({ id: 'cart.checkout' }) }, async () => {});"))
      .toEqual([]);
  });

  it('validates ids, keep/reason, duplicate ids, and manual contexts', async () => {
    const messages = await lint(`
      import { test, craftSession } from './fixtures';
      test('one', { annotation: craftSession({ id: 'Bad', keep: 3 }) }, async () => {});
      test('two', { annotation: craftSession({ id: 'same' }) }, async () => {});
      test('three', { annotation: craftSession({ id: 'same' }) }, async () => {});
      browser.newContext();
    `);
    expect(messages).toEqual(expect.arrayContaining([
      'craftSession doit recevoir un objet littéral avec un id chaîne littérale valide (80 caractères maximum).',
      'keep doit être un entier de 1 à 10 ; au-delà de 1, ajoutez une reason non vide.',
      'L’id craftSession "same" est déclaré plusieurs fois dans ce fichier.',
      'Utilisez craftSessions.newContext() afin de rattacher ce contexte au test.',
    ]));
  });

  it('allows a loop variable id because the architecture check sees generated tests', async () => {
    expect(await lint(`
      import { test, craftSession } from './fixtures';
      for (const id of ['orders.list', 'orders.detail']) {
        test(id, { annotation: craftSession({ id }) }, async () => {});
      }
    `)).toEqual([]);
  });
});

async function lint(code: string): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.spec.ts'],
      plugins: { 'craft-ts': craftRules },
      rules: { 'craft-ts/e2e-session-contract': ['error', { fixtureModules: ['./fixtures'] }] },
    }],
  });
  const [result] = await eslint.lintText(code, { filePath: 'test.spec.ts' });
  return result?.messages.map((message) => message.message) ?? [];
}
