# The catalogue

A catalogue is a plain nested object. Nothing is parsed, nothing is loaded from
JSON at build time, and every guarantee on this page comes from the type of the
value itself.

<<< @/tests/snippets/guide/i18n/catalog/order-catalog.ts#imports

## Tokens name the parameters

<<< @/tests/snippets/guide/i18n/catalog/order-catalog.ts#tokens

A token carries a **name** and a **formatter**. The name becomes the parameter
key; the formatter decides how the value is rendered in the active locale. That
is why `msg` can derive the params type of a message from the tokens it
interpolates — see [Tokens](./tokens.md) for the full list.

## `defineCatalog`, `msg`, `plural`

<<< @/tests/snippets/guide/i18n/catalog/order-catalog.ts#catalog

`msg` is a **tagged template**: the literal parts are text, the interpolations
are tokens. `` msg`Order total ${amount}.` `` has params `{ amount: number }`,
and nothing else.

`plural(count, branches)` takes the counting token and one message per category.
Which categories are _required_ is decided by the locale id, not by you:
`defineLocale('pl-PL', …)` will not accept a plural missing `few` or `many`.
That check is a type error, before any Polish speaker sees the wrong branch.

Keys nest as deeply as you like; the key used at the call site is the dotted
path.

## Every other locale is `defineLocaleLike`

<<< @/tests/snippets/guide/i18n/catalog/order-catalog.ts#locale-like

`defineLocale` is for the **reference** locale — the one that decides what the
key set is. Every other locale goes through `defineLocaleLike(reference, id,
catalog)`, which checks three things against the reference at compile time:

- the same keys, no more and no fewer;
- the same parameters on every message;
- the plural categories that _this_ locale requires, which may differ from the
  reference's.

A renamed key in the reference therefore breaks every translation file that
still has the old name, which is the entire point. It also runs
`assertLocaleParity` at construction, so a mismatch that slips past the types —
a catalogue built dynamically, say — still fails loudly rather than rendering a
key name.

## Checking outside the typechecker

```bash
npm run i18n:check
```

Runs catalogue validation and locale parity as an ordinary command, so CI and a
pre-commit hook can see what `tsc` sees. Under the hood it is
`validateCatalog` / `assertValidCatalog` (also exported from
`@craft-ts/i18n/testing`) and `validateLocaleParity` / `assertLocaleParity`.

When it fails, it names the key and the locale. Add the key; do not loosen the
catalogue's type to make the message go away.

## Next

- [Tokens](./tokens.md) — what `amount` and `count` above actually are.
- [The runtime](./runtime.md) — turning these locales into a `t`.
