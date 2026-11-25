/**
 * `no-raw-class` and the `/style` entry of a package outside `@craft-ts`
 * (issue #51).
 *
 * Such a class is still refused: `craftStyle({ include })` gives it CSS, but
 * not a place in the project's token and axis model. What changes is the
 * diagnostic, which names that reason and the local adapter to write instead.
 */
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const rule = require('./no-raw-class.cjs');

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  },
});

const external = (source: string) => ({
  messageId: 'externalStyleClass',
  data: { source },
});

ruleTester.run('no-raw-class (external /style entries)', rule, {
  valid: [
    // The `/style` entry of a framework package keeps being accepted.
    `import { buttonUi } from '@craft-ts/ui/style';
     button({ class: buttonUi.root }, 'Save');`,
    `import { buttonUi } from '@craft-ts/ui/style';
     const root = buttonUi.root;
     button({ class: [root, buttonUi.label] }, 'Save');`,
    // The local adapter the diagnostic asks for.
    `import { kitButton } from './kit.style';
     button({ class: kitButton.root }, 'Save');`,
  ],
  invalid: [
    {
      // The reproduction from the issue.
      code: `
        import { button, craftComponent } from '@craft-ts/component';
        import { kit } from '@acme/kit/style';

        export const Save = craftComponent('Save', {}, () =>
          button({ class: kit.button }, 'Save'),
        );
      `,
      errors: [external('@acme/kit/style')],
    },
    {
      // The "before" of the documented adapter: one report per binding.
      code: `
        import { button, craftComponent } from '@craft-ts/component';
        import { kit } from '@acme/kit/style';

        export const Save = craftComponent('Save', {}, () =>
          button(
            'save',
            { type: 'button', class: [kit.button, kit.danger] },
            'Save',
          ),
        );
      `,
      errors: [external('@acme/kit/style')],
    },
    {
      // Unscoped package, named import, through a const and in an array.
      code: `
        import { kitButton } from 'acme-kit/style';
        import { card } from './card.style';
        const primary = kitButton;
        div({ class: kitButton }, []);
        div({ class: primary }, []);
        div({ class: [card.body, kitButton] }, []);
        div({ class: () => kitButton }, []);
      `,
      errors: [
        external('acme-kit/style'),
        external('acme-kit/style'),
        external('acme-kit/style'),
        external('acme-kit/style'),
      ],
    },
    {
      // A member read through a const keeps the external diagnostic too.
      code: `
        import * as kit from '@acme/kit/style';
        const sheet = kit.sheet;
        div({ class: sheet.root }, []);
      `,
      errors: [external('@acme/kit/style')],
    },
    {
      // Neither a relative `./style` module nor a `@craft-ts` component entry
      // is an external package's style entry: they keep the generic message.
      code: `
        import { theme } from './style';
        import { buttonUi } from '@craft-ts/ui';
        import { kit } from '@acme/kit';
        div({ class: theme.root }, []);
        button({ class: buttonUi.root }, 'Save');
        button({ class: kit.button }, 'Save');
      `,
      errors: [
        { messageId: 'untracedClass' },
        { messageId: 'untracedClass' },
        { messageId: 'untracedClass' },
      ],
    },
    {
      // The other raw classes keep their existing messages.
      code: `
        div({ class: 'card' }, []);
        div({ class: isActive() ? 'a' : 'b' }, []);
      `,
      errors: [{ messageId: 'rawClass' }, { messageId: 'computedClass' }],
    },
  ],
});

describe('no-raw-class external /style diagnostic', () => {
  it('explains why the class is refused and names the local adapter', async () => {
    const { Linter } = await import('eslint');
    const linter = new Linter({ configType: 'flat' });
    const [message] = linter.verify(
      `import { kit } from '@acme/kit/style';\nbutton({ class: kit.button }, 'Save');`,
      [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tsParser as never,
            parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
          },
          plugins: { local: { rules: { rule } } },
          rules: { 'local/rule': 'error' },
        },
      ],
      'save.ts',
    );

    expect(message?.message).toContain("'@acme/kit/style'");
    expect(message?.message).toContain('token and axis model');
    expect(message?.message).toContain('local CraftTS adapter');
    expect(message?.message).toContain('craftStyles');
    expect(message?.message).toContain('*.style.ts');
  });
});
