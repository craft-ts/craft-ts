# Type-safe i18n

`@craft-ts/i18n` is the CraftTS i18n integration. The catalogue remains a plain
declarative TypeScript value, while DI-aware tokens use the existing CraftTS
service contracts. A catalogue that does not use DI can still be formatted by
`runtime.t`; a catalogue with DI is rendered through the reactive CraftTS
translator so its dependencies are checked like component dependencies.

## The contract

Six things are guaranteed, and all six are checked before the app runs.

| guarantee                                                   | what it costs you to break                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| the key set is a **closed union**                           | an unknown key does not compile — no silent `order.totl`            |
| every locale has the **same keys with the same parameters** | a translation you forgot is a compile error, not a fallback         |
| parameters are **typed by their token**                     | a date cannot be passed where a currency amount belongs             |
| a plural carries **every category the locale requires**     | Polish needs `one`/`few`/`many`/`other`; French needs `one`/`other` |
| a DI-aware token declares its **CraftTS services**           | a missing provider is a compile error at the component/route boundary |
| a token declared with a **schema** types its own input       | the call site passes what the schema parses, not what the formatter wants |

The usual failure mode of a translation layer is that all of these are
runtime concerns: a missing key renders its own name, a wrong parameter renders
`[object Object]`, and a missing plural category renders the wrong branch to the
users of one locale only. None of that is observable from the code that calls
`t`.

## The shape of it

```
src/i18n/
  catalog.ts          the reference locale — defineCatalog + msg + plural
  locales/fr-FR.ts    every other locale — defineLocaleLike
  project-tokens.ts   business tokens: defineToken / defineTokenFactory
  runtime.ts          createI18nRuntime, and the reactive binding
```

A key is its dotted path: `order.total` reaches
`{ order: { total: msg`…` } }`.

## Where to go next

- [The catalogue](./catalog.md) — `defineCatalog`, `msg`, `plural`,
  `defineLocale`, `defineLocaleLike`.
- [Tokens](./tokens.md) — the shipped semantic tokens, and how to add your own.
- [The runtime](./runtime.md) — `createI18nRuntime`, `t`, `bind`, lazy locales.
- [With Effect](./effect.md) — `@craft-ts/i18n-effect`.

Two checks belong in CI, and `craft create` wires both:

```bash
npm run i18n:check
npm run i18n:test
```

A working example lives in the demo, at `apps/demo/src/app/examples/i18n/`.

## Guard visible text in Craft templates

`craft create` enables this preset for every project generated **with** i18n —
its own pages already take their copy from the catalogue. A project generated
without i18n never sees the rule. To add it by hand to an existing application:

```js
import craftRules from '@craft-ts/dev-tools/eslint-rules';

export default [
  {
    plugins: { 'craft-ts': craftRules },
    rules: { ...craftRules.configs.i18n.rules },
  },
];
```

`craft-ts/require-i18n-text` reports static text in visible headings,
paragraphs, labels, buttons, links and options, plus visible `placeholder`,
`aria-label` and `title` attributes — and it looks *inside* the visible
position, so `p('Total: ' + t('cart.total'))`, `` span(`Total: ${amount}`) ``,
`label(isNew ? 'New' : 'Returning')`, `p(name || 'Anonymous')` and a literal in
a children array are reported too. Only what carries letters counts: `first + ' ' + last`
is glue between values, not copy. Dynamic business values, `i18n.t(...)`, its
key and parameters, a generator child and catalogue files are accepted. Server files and tests are excluded so
technical messages and assertions can remain literal. The rule stays separate
from the recommended preset, because it only makes sense once the catalogue is
the application's source of truth — which is exactly the condition `craft
create` checks when it decides to enable it.
