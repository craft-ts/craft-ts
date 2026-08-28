---
name: craft-ts-i18n
description: Build and review type-safe internationalisation in a CraftTS project with @craft-ts/i18n — closed key unions, locale parity, typed message parameters, per-locale plural categories, semantic tokens, the reactive translator, and the @craft-ts/i18n-effect adapter. Use when adding a translation, a locale, a token, or when a translation typecheck or i18n:check fails.
---

# CraftTS type-safe i18n

`@craft-ts/i18n` integrates with CraftTS for DI-aware translation tokens. The
catalogue remains declarative, and non-DI messages still work with `runtime.t`.
Use the CraftTS-bound translator whenever a token yields a service. Do not reach
for Effect to translate a string; use `@craft-ts/i18n-effect` only inside an
Effect program.

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

### DI-aware tokens

Any token factory accepts a **generator function** in place of the adapter. The
yielded services are carried into the translation reader's component dependency
contract:

```ts
const amount = money('amount', function* () {
  const currency = yield* ClientCurrency();
  return { currency: currency.code, minimumFractionDigits: 2 };
});

const catalog = defineCatalog({
  order: msg`Order total ${amount}.`,
});
```

Render it with the translator returned by `runtime.bind(...)`, and **pass the
reader** — as a child or as an attribute value:

```ts
p(translate('order', { amount: 1234.5 }));
p({ title: translate('order', { amount: 1234.5 }) }, 'Order');
```

Both carry the dependency, so the component and route DI checks fail
compilation if `ClientCurrency` is not provided. Do not drive the reader
yourself (`yield* translate(...)()`): it renders the same string but the
dependency disappears from the check.

`runtime.t` accepts `StaticTranslationKey` only — the keys that resolve no
service — so a DI message on that path is a compile error, not a runtime one.
An arrow function that returns a generator is refused: the options factory must
be a `function*`.

### No visible literal in a template

A project generated with i18n ships `craft-ts/require-i18n-text` in its ESLint
configuration: a static string in `heading`/`p`/`label`/`button`/`a`/`option`/…
or in a `placeholder`, `aria-label` or `title` attribute is an error. Put the
copy in `src/i18n/catalog.ts` (and in every locale) and read it with
`i18n.t(...)`.

Wrapping the literal does not hide it — concatenation, template text, ternary
branches, `||` fallbacks and children arrays are all inspected:

```ts
p('Total: ' + i18n.t('cart.total', { amount }));   // reported: 'Total: '
p(i18n.t('cart.totalLine', { amount }));           // the whole sentence is a key
```

Only text carrying letters counts, so `first + ' ' + last` is fine. The key and
parameters of `i18n.t(...)`, generator children, catalogue files, server files
and tests are all exempt. A project generated without i18n does not get the
rule.

A project token does the same through `defineToken`, and declares no `format`
when the formatter only exists at render time:

```ts
const weight = defineToken({
  name: 'weight',
  kind: 'weight',
  resolveFormatter: function* () {
    const units = yield* Units();
    const unit = (yield* units.system()) === 'imperial' ? 'pound' : 'kilogram';
    return (value: number, context) =>
      new Intl.NumberFormat(context.locale, { style: 'unit', unit }).format(value);
  },
});
```

### Schema-declared parameters

The adapter position also takes a Standard Schema (Zod, Valibot, ArkType — the
same contract as `state`, `query` and forms). The parameter type becomes the
schema's input and the formatter receives its output, so the schema parses
once, in the catalogue:

```ts
const placedAt = dateLong('placedAt', z.coerce.date());
translate('order', { placedAt: '2026-08-25T14:30:00Z' });
```

`defineToken` takes the same `schema` field and may combine it with
`resolveFormatter`.

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
