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
| a plural carries **every category the locale requires**     | Polish needs `one`/`few`/`many`/`other`; French needs `one`/`many`/`other` |
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
a children array are reported too. It also follows local helpers and label
tables when their results feed presentation fields such as `label`, `kind`,
`text`, `meta` or `hint`; this catches copy prepared in a view model before the
component renders it. Only what carries letters counts: `first + ' ' + last`
is glue between values, not copy. Dynamic business values, `i18n.t(...)`, its
key and parameters, a generator child and catalogue files are accepted. Server files and tests are excluded so
technical messages and assertions can remain literal. The rule stays separate
from the recommended preset, because it only makes sense once the catalogue is
the application's source of truth — which is exactly the condition `craft
create` checks when it decides to enable it.

### Technical values: declare them with `craftLiteral`

The rule also checks the strings a `craftComputed` returns. A computed that
maps state to a token — a `data-state` value, a `matchNode` key — returns a
technical value, not copy, and translating it would break the code that reads
it. A bare string cannot say which one it is, so the rule reports it:

```ts
// Before: both literals are reported.
const drawerState = yield* craftComputed('drawerState', function* () {
  return (yield* open()) ? 'open' : 'closed';
});
```

> This literal is treated as user-visible text. If this is text shown to a
> user, use i18n.t(...). If it is a technical state or discriminant, declare it
> with craftLiteral(...) and reuse that value.

Declare each technical value once with `craftLiteral(...)` from
`@craft-ts/core` and reuse it. The computed is inferred as `'open' | 'closed'`:

```ts
// After: marked values are technical, nothing is reported.
import { craftLiteral } from '@craft-ts/core';

const drawerOpen = craftLiteral('open');
const drawerClosed = craftLiteral('closed');

const drawerState = yield* craftComputed('drawerState', function* () {
  return (yield* open()) ? drawerOpen : drawerClosed;
});
```

A marked value is still a technical value, never copy: if it reaches visible
text — a text child, a `placeholder`, `aria-label` or `title`, or a
`label`/`text`/`hint` view-model field — the rule asks for `i18n.t(...)`
instead. There is no autofix: only you know whether a string is shown to a
user or read by code.

## Translation parameters

The complete visible sentence belongs to the catalogue. Do not translate one
piece and append another piece in the template: word order, punctuation and
grammar can change between locales. `craft-ts/no-i18n-composition` reports this
pattern in visible text and attributes, including generator children.

### Before: a translated fragment followed by a value

```ts
span(function* () {
  return `${i18n.t('ui.space.expires')} ${formatDate(yield* item.expiresAt())}`;
});
```

This forces every locale to keep the same sentence shape and makes the date a
second, untranslated fragment. With the i18n preset, ESLint reports:

> Do not compose translated text with other text or values. Put the complete
> message in the i18n catalogue and pass dynamic values as translation
> parameters.

### After: one message with a typed parameter

Declare the value as a semantic token in the catalogue:

```ts
import { dateLong, defineCatalog, msg } from '@craft-ts/i18n';

const expiresAt = dateLong('expiresAt');

export const catalog = defineCatalog({
  ui: {
    space: {
      expires: msg`Space expires ${expiresAt}`,
    },
  },
});
```

Then pass the value to the translation in the template:

```ts
span(function* () {
  return i18n.t('ui.space.expires', {
    expiresAt: yield* item.expiresAt(),
  });
});
```

Each locale can now choose its own word order, punctuation and date placement,
while the parameter remains typed and formatted through `Intl`. For a custom
format, define a project token rather than rebuilding a translated sentence in
the template; see [Tokens](./tokens.md).

### Children arrays: text pieces, not neighbouring nodes

In an array of children, the rule only counts pieces that render as text next
to a translation: string and template literals, numbers, concatenations, a
second translation, and — with typed lint — a value whose type is a `string`
or a `number`. This is reported, because the message is incomplete:

```ts
// Before: "Saving " and the translation form one sentence.
button({ type: 'button', disabled: true }, ['Saving ', i18n.t('progress')]);
p([i18n.t('cart.items'), count]); // count: number (typed lint)
```

Put the whole sentence in the catalogue and pass the value as a parameter:

```ts
// After: one complete message per position.
button({ type: 'button', disabled: true }, [i18n.t('saving')]);
p([i18n.t('cart.items', { count })]);
```

An element or component beside one complete translation is a separate node,
not part of the message, so a decorative spinner or an icon is accepted:

```ts
button({ type: 'button', disabled: true }, [
  span({ 'aria-hidden': 'true' }),
  i18n.t('saving'),
]);
p([Icon({ name: 'check' }), i18n.t('saved')]);
```

Hyperscript helpers, component calls and node helpers such as `ifNode(...)` or
`forNode(...)` are never counted as text. An identifier, member read or other
call counts as text only when typed lint proves its type is a string or a
number; without type information the rule does not guess, because such a value
is as likely to hold a node (`const spinner = span(...)`). Enable typed lint
(`parserOptions.projectService`) to catch `[i18n.t('label'), value]`. There is
no autofix: only you can write the complete catalogue message.
