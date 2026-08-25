---
name: craft-ts-i18n
description: Build and review type-safe internationalisation in a CraftTS project with @craft-ts/i18n — closed key unions, locale parity, typed message parameters, per-locale plural categories, semantic tokens, the reactive translator, and the @craft-ts/i18n-effect adapter. Use when adding a translation, a locale, a token, or when a translation typecheck or i18n:check fails.
---

# CraftTS type-safe i18n

`@craft-ts/i18n` has **no CraftTS, Angular or Effect import**. The catalogue is
a plain TypeScript value and the runtime works in a browser, a server, a worker
or a test without a framework. Do not reach for Effect to translate a string.

The contract it enforces, all at typecheck time:

1. the set of keys is a **closed union** — an unknown key does not compile;
2. every locale has the **same keys with the same parameters**;
3. message parameters are **typed by their token**, so a date cannot be passed
   where a currency amount belongs;
4. a plural message must carry **every category the locale requires** — Polish
   needs `one`, `few`, `many`, `other`; French needs `one` and `other`.

## Writing a catalogue

```ts
import { defineCatalog, defineLocale, defineLocaleLike, money, msg, number, plural } from '@craft-ts/i18n';

const amount = money('amount', undefined, { currency: 'EUR' });
const count = number('count');

const en = defineLocale('en-US', defineCatalog({
  order: {
    total: msg`Order total ${amount}.`,
    items: plural(count, {
      one: msg`${count} item is in the order.`,
      other: msg`${count} items are in the order.`,
    }),
  },
}));

const fr = defineLocaleLike(en, 'fr-FR', { order: { /* same shape */ } });
```

`msg` is a **tagged template**: the interpolations are tokens, and the params
type of the message is derived from them. `defineLocale` is for the reference
locale; every other locale uses `defineLocaleLike(reference, id, catalog)`,
which is what turns a missing or renamed key into a compile error instead of a
runtime fallback. Keys nest freely; a key is the dotted path.

## Tokens

Shipped, semantic, and locale-aware through `Intl`: `number`, `integer`,
`percent`, `compactNumber`, `money`, `dateShort`, `dateLong`, `dateTime`,
`relativeTime`. Each is a factory — `factory(name, adapter?, options?)` — where
`name` becomes the parameter name.

For a business value, `defineToken({ name, kind, tokenId, validate, format })`;
for a family of them, `defineTokenFactory({ kind, format })`. Keep business
vocabulary in the project, in `src/i18n/project-tokens.ts`, not in the shared
library.

## The runtime

```ts
const i18n = createI18nRuntime({ locales, defaultLocale: 'en-US' });
i18n.t('order.total', { amount: 1234.5 });
```

- `t` is `translate`; both take the key and, when the message has parameters, a
  typed params object.
- `strict` defaults to **on**: every catalogue is validated and every locale is
  checked for parity against the first one at construction.
- `setLocale(id)` throws `I18nRuntimeError('LOCALE_NOT_LOADED')` for a locale
  that was never loaded. Note the current limit: `setLocale` and `loadLocale`
  are keyed on the ids in `locales`, and a locale listed there already counts as
  loaded — so list every locale, and treat `createI18nLoader` as the retry-safe
  cache (it evicts failed loads) rather than as a fully lazy catalogue.
- `timeZone` belongs on the runtime, not on each call site.

### Reactive translation

`runtime.bind(dependency)` returns a translator whose result re-reads when the
dependency changes. The dependency is a Craft reader — typically the `state`
holding the current locale — so a component consumes one service rather than
building a local binding:

```ts
return { language, setLocale: language.setLocale, translate: runtime.bind(language) };
```

`bind(...)('key', params)` returns a generator the template yields, like any
other Craft reader.

## With Effect

`@craft-ts/i18n-effect` is the adapter, and only the adapter:

- `provideI18nRuntime(runtime)` → `Layer.Layer<I18nEffectService>`;
- `translateEffect(key, params)` →
  `Effect.Effect<string, never, I18nEffectService>`.

Same keys, same params, same result as `runtime.t`. Use it inside an Effect
program; in plain component code, call `t` directly.

**`translateEffect` cannot infer the locales.** It has no value parameter
carrying them, so called bare its key parameter resolves to `never` and even a
valid key is rejected. Either pass the type arguments —
`translateEffect<typeof locales, 'order.total'>(…)` — or bind them once in a
project-local wrapper, which is the pattern in `/guide/i18n/effect`.

## Checks

- `npm run i18n:check` — catalogue validity and locale parity, outside the
  typechecker.
- `npm run i18n:test` — the runtime behaviour.

Run both after touching `src/i18n/`. A failing parity check names the key and
the locale; add the key rather than loosening the catalogue type.

Full guide: `/guide/i18n/`, `/guide/i18n/catalog`, `/guide/i18n/tokens`,
`/guide/i18n/runtime`, `/guide/i18n/effect`.
