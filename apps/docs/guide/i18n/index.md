# Type-safe i18n

`@craft-ts/i18n` has **no CraftTS, Angular or Effect import**. The catalogue is
a plain TypeScript value and the runtime works in a browser, a server, a worker
or a test without a framework. That is not a packaging detail — it is what lets
the same catalogue be checked by `tsc`, exercised by a Node test, and rendered
during SSR without a second implementation.

## The contract

Four things are guaranteed, and all four are checked before the app runs.

| guarantee                                                   | what it costs you to break                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------- |
| the key set is a **closed union**                           | an unknown key does not compile — no silent `order.totl`            |
| every locale has the **same keys with the same parameters** | a translation you forgot is a compile error, not a fallback         |
| parameters are **typed by their token**                     | a date cannot be passed where a currency amount belongs             |
| a plural carries **every category the locale requires**     | Polish needs `one`/`few`/`many`/`other`; French needs `one`/`other` |

The usual failure mode of a translation layer is that all four of these are
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

The dev-tools plugin exposes an opt-in `i18n` ESLint preset for applications
that have finished moving their user-facing copy into a catalogue:

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
`aria-label` and `title` attributes. Dynamic business values, `i18n.t(...)`
and catalogue files are accepted. Server files and tests are excluded so
technical messages and assertions can remain literal. The rule is deliberately
separate from the recommended preset: enable it when the catalogue is the
application's source of truth, then run `npm run lint` in CI.
