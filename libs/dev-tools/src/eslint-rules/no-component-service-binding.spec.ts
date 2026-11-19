import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const rule = require('./no-component-service-binding.cjs');
const plugin = require('./index.cjs');
const MESSAGE =
  'Do not bind a yielded service value in the craftComponent factory. Read it inside the template binding that uses it.';

describe('no-component-service-binding', () => {
  it('reports service results, destructured values, and aliases in the factory', async () => {
    const messages = await lintText(`
      import { craftComponent } from '@craft-ts/component';
      import { ReplayResumesViewModel } from './replay-resumes-view-model.service';
      import { ReplaySession } from './replay-session';
      import { SessionArchive } from './session-archive';

      craftComponent('ReplayResumes', {}, function* () {
        const replaySession = yield* ReplaySession();
        const archive = yield* SessionArchive();
        const { checkpoints, noticeHere } = yield* ReplayResumesViewModel();
        const noticeValue = noticeHere;
        const promptReader = (yield* ReplayResumesViewModel()).noticeHere;
        const dismissNotice = archive.resumeNotice.dismiss;
        return div({ hidden: function* () { return yield* noticeValue(); } });
      });
    `);

    expect(messages).toEqual([
      MESSAGE,
      MESSAGE,
      MESSAGE,
      MESSAGE,
      MESSAGE,
      MESSAGE,
    ]);
  });

  it('allows service reads inside the template binding that consumes them', async () => {
    const messages = await lintText(`
      import { craftComponent } from '@craft-ts/component';
      import { ReplayResumesViewModel } from './replay-resumes-view-model.service';

      craftComponent('ReplayResumes', {}, function* () {
        return div({
          hidden: function* () {
            const { nothingYet } = yield* ReplayResumesViewModel();
            return yield* nothingYet();
          },
        });
      });
    `);

    expect(messages).toEqual([]);
  });

  it('allows query values to be bound in the component factory', async () => {
    const messages = await lintText(`
      import { craftComponent } from '@craft-ts/component';
      import { query } from '@craft-ts/core';

      craftComponent('Home', {}, function* () {
        const welcomeQuery = yield* query('welcome', {
          params: () => true,
          loader: loadWelcome,
        });
        return p(function* () { return yield* welcomeQuery.value(); });
      });
    `);

    expect(messages).toEqual([]);
  });

  it('ignores ordinary aliases and nested component factories', async () => {
    const messages = await lintText(`
      import { craftComponent } from '@craft-ts/component';
      import { Service } from './service';

      craftComponent('Outer', {}, function* () {
        const label = 'Replay';
        const labelAlias = label;
        return craftComponent('Inner', {}, function* () {
          const service = yield* Service();
          return div(service);
        });
      });
    `);

    expect(messages).toEqual([MESSAGE]);
  });

  it('recognizes namespace imports and is enabled in the presets', async () => {
    const messages = await lintText(`
      import * as component from '@craft-ts/component';
      import { Service } from './service';

      component.craftComponent('Demo', {}, function* () {
        const service = yield* Service();
        return div(service);
      });
    `);

    expect(messages).toEqual([MESSAGE]);
    expect(plugin.rules['no-component-service-binding']).toBe(rule);
    expect(
      plugin.configs.recommended.rules[
        'craft-ts/no-component-service-binding'
      ],
    ).toBe('error');
    expect(
      plugin.configs.effect.rules['craft-ts/no-component-service-binding'],
    ).toBe('error');
  });
});

async function lintText(source: string): Promise<string[]> {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser as unknown as Linter.Parser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { local: { rules: { rule: rule as never } } },
        rules: { 'local/rule': 'error' },
      },
    ],
  });

  const [result] = await eslint.lintText(source, { filePath: 'fixture.ts' });
  return result.messages.map((message) => message.message);
}
