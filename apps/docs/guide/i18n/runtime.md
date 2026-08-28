# The runtime

`createI18nRuntime` turns a set of locales into the object the application
translates through. It holds one active locale, and it is deliberately small:
`locale`, `setLocale`, `translate` (aliased `t`), `bind`, `loadLocale`.

<<< @/tests/snippets/guide/i18n/runtime/runtime.spec.ts#create

`strict` defaults to **on**. At construction, every catalogue is validated and
every locale is checked for parity against the first one — so a catalogue built
in a way the types could not see still fails at startup rather than at the
moment a user opens the page that needs it. Pass `strict: false` only when you
have a reason you can write down.

`timeZone` belongs on the runtime, once. Putting it on each call site is how two
dates in the same view end up in two zones.

## Translating

<<< @/tests/snippets/guide/i18n/runtime/runtime.spec.ts#translate

`t` **is** `translate` — the same function under two names, so a call site can
read as `t('order.total', …)` without a local alias. The params argument is
optional exactly when the message has no parameters, and required, with its
exact shape, when it does.

`setLocale(id)` throws `I18nRuntimeError` with the code `LOCALE_NOT_LOADED` for
a locale the runtime does not hold. So does `t`, if the active locale was
somehow never loaded. The error is not a formatting failure to be swallowed: it
means the app is about to render the wrong language.

The other codes it raises, all for the same reason — rendering something wrong
is worse than not rendering:

| code                       | when                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| `MISSING_PARAM`            | a token's parameter is absent from the params object               |
| `INVALID_PARAM`            | a guard rejected the value, or a schema's issues, quoted verbatim  |
| `ASYNC_SCHEMA`             | a parameter's schema returned a promise; a message renders in sync |
| `CRAFT_INJECTION_REQUIRED` | `t` met a token that resolves a service (see below)                |
| `INVALID_PLURAL_COUNT`     | a plural selector that is not a finite number                      |
| `UNKNOWN_KEY`              | a key that no longer exists in the loaded catalogue                |

## Reactive translation

A string that does not change when the locale changes is not a translation.
`runtime.bind(dependency)` returns a translator whose result re-reads whenever
the dependency does — the dependency being an ordinary Craft reader, typically
the `state` that holds the active locale:

<<< @/tests/snippets/guide/i18n/runtime/runtime.spec.ts#reactive

`translate('order.items', { count })` then returns a generator the template
yields like any other Craft reader. One service owns the locale for the whole
app; components consume it rather than each building a local binding, which is
what keeps two components from disagreeing about which language is on screen.

### DI inside a translation

Dependencies belong to the token that needs them, not to the whole i18n
runtime:

```ts
const orderAmount = money('amount', function* () {
  const currency = yield* ClientCurrency();
  return { currency: currency.code, minimumFractionDigits: 2 };
});

const catalog = defineCatalog({
  order: msg`Order total ${orderAmount}.`,
});
```

In a template, the translator's result is used exactly like any other child or
attribute value — pass it, do not drive it:

```ts
p(translate('order', { amount: 1234.5 }));
p({ title: translate('order', { amount: 1234.5 }) }, 'Order');
```

Both forms carry `ClientCurrency` into the component dependency contract, so
the route check reports a missing provider at compile time, just as it does for
a service yielded by the component factory.

The reader is a function, so `yield* translate(...)` does not type-check; and
driving it yourself inside a template generator (`yield* translate(...)()`)
hides the dependency from that check, exactly as a service yielded straight
from a template does. Pass the reader.

`t` refuses such a message at compile time: its key type is
`StaticTranslationKey`, the keys whose formatting resolves nothing. A resolver
that yields no request is still a `t` key — the type and the runtime draw the
same line.

## Loading catalogues

<<< @/tests/snippets/guide/i18n/runtime/runtime.spec.ts#loader

`createI18nLoader` caches by id and — the part that matters — **evicts a failed
load**, so a catalogue whose chunk died on a flaky network can be retried
instead of staying permanently poisoned. `loadLocale(id)` resolves once the
catalogue is in; only then does `setLocale` accept it.

::: warning A locale must be listed to be named
`setLocale` and `loadLocale` are keyed on the ids in `locales`, so today a
locale that is **not** in that array cannot be named without a cast — while a
locale that _is_ in it counts as already loaded and never reaches the loader.
In practice that means the fully lazy catalogue is not expressible in the types
yet. List every locale, and treat `loader` as the retry-safe cache in front of
whatever your own loading code does.
:::

A lazily obtained locale is not present at construction, so it is **not**
covered by the startup parity check. Keep it covered by `npm run i18n:check`,
which reads the files rather than the runtime.

## Next

- [With Effect](./effect.md) — the same keys, as an `Effect`.
