# Tokens

A token is the unit that makes a message parameter typed. It carries a **name**
(the parameter key), a **kind**, a way to check the value — a guard or a
**schema** — and a way to render it: a **formatter**, or a **resolver** that
builds one from the injector. Both see the active locale.

## The shipped tokens

They are semantic, not stylistic, and every one of them formats through `Intl`,
so the output follows the locale rather than a hand-written rule:

<<< @/tests/snippets/guide/i18n/tokens/tokens.spec.ts#shipped

| factory                              | parameter type   | formats as                    |
| ------------------------------------ | ---------------- | ----------------------------- |
| `number`, `integer`, `compactNumber` | `number`         | decimal, no fraction, compact |
| `percent`                            | `number`         | `0.125` → `12.5 %`            |
| `money`                              | `number`         | currency, `EUR` by default    |
| `dateShort`, `dateLong`, `dateTime`  | `Date \| number` | date and date-time styles     |
| `relativeTime`                       | `number`         | `-2` → `2 days ago`           |

Each is a factory: `factory(name, adapter?, options?)`. The **name** is what the
params object will be keyed by, so the same factory serves any number of
parameters — `money('amount')` and `money('refund')` are two different tokens.
The **adapter** position takes any of three things: a type guard, a
[Standard Schema](#validating-and-parsing-with-a-schema), or a
[generator](#options-that-come-from-a-service) that resolves the options from a
service.

### Options that come from a service

Every factory — not only `money` — accepts a CraftTS generator in place of the
adapter when its options depend on a service:

```ts
const orderAmount = money('amount', function* () {
  const currency = yield* ClientCurrency();
  return { currency: currency.code, minimumFractionDigits: 2 };
});
```

The yielded service is part of the token's type. It is therefore propagated to
the translation reader and then to the component/route DI check. A provider
missing from the reachable `craftComponent`/route scope fails compilation.
The generator runs when the message is rendered, not when the catalogue module
is imported.

It must be a **generator function**. An arrow that returns a generator satisfies
the signature but is not one, so it is rejected rather than silently installed
as the value guard.

## Validating and parsing with a schema

The second argument also accepts a **Standard Schema**: the same contract
`state`, `query` and forms already take, so a Zod, Valibot or ArkType schema
written for the rest of the application drops in unchanged.

```ts
const placedAt = dateLong('placedAt', z.coerce.date());

msg`Placed on ${placedAt}.`;
// the call site passes a string, the formatter receives a Date
translate('order', { placedAt: '2026-08-25T14:30:00Z' });
```

A schema is not only a guard: the parameter type is the schema's **input** and
the formatter receives its **output**. Parsing therefore happens once, in the
catalogue, instead of at every call site. An invalid value raises
`I18nRuntimeError` with the schema's own issue messages, and an asynchronous
schema is refused — a translation renders synchronously.

A project token declared with `defineToken` takes the same `schema` field, and
may combine it with `resolveFormatter`: the parameter is parsed, the formatter
is resolved from the injector.

## Your own token

Business vocabulary does not belong in a shared library. `defineToken` builds
one, and it looks exactly like a shipped token at the call site:

<<< @/tests/snippets/guide/i18n/tokens/tokens.spec.ts#custom-token

The `validate` guard is what keeps an arbitrary string out of the params type: a
message that interpolates this token accepts `'paid' | 'pending' | 'refunded'`
and nothing else. Without it, the parameter widens and the token stops earning
its place. A `schema` field does the same job and can parse on the way in;
`defineToken` accepts either, and may combine a schema with a `resolveFormatter`
so the parameter is parsed and the formatter comes from the injector.

A token can also resolve its formatter from the injector rather than carry one.
Here the unit system is a Craft service, so the same catalogue renders
kilogrammes for one user and pounds for another:

<<< @/tests/snippets/guide/i18n/tokens/di-token.spec.ts#di-token

The yielded service travels with the message: pass the reader to the template
and a missing provider is a compile error, exactly as for a service yielded by
the component factory. See
[DI inside a translation](./runtime.md#di-inside-a-translation).

`format` receives the value and a context carrying `locale` and, when the
runtime was given one, `timeZone`. Keep the branching on `context.locale`
coarse — a language prefix, not a full locale match — unless you genuinely have
per-region wording.

## `format` or `resolveFormatter`, never both

A token formats through exactly one of the two, and both renderers take
`resolveFormatter` first whenever it is there:

| declared           | when the formatter is known                                   |
| ------------------ | -------------------------------------------------------------- |
| `format`           | when the catalogue is written — `formatters.money('EUR')`      |
| `resolveFormatter` | at render time, from the injector — the client's currency      |

So a token with a resolver declares no `format`. `t` still renders it if the
resolver yields nothing; the moment it yields a service request, the message
belongs to a bound translator and its key leaves `StaticTranslationKey`.

`percent` takes a ratio, not a percentage: `0.125`, not `12.5`. That is `Intl`'s
convention and the token does not second-guess it.

## A family of tokens

When the same formatting rule serves several parameter names and options,
`defineTokenFactory` builds the factory instead of the token:

<<< @/tests/snippets/guide/i18n/tokens/tokens.spec.ts#custom-factory

That is exactly how `number`, `money` and the rest are built; there is no
privileged path for the shipped ones.

Conventionally these live in `src/i18n/project-tokens.ts`, which is where
`craft create` puts them and what the generated agent skill points at.

## Next

- [The runtime](./runtime.md) — spending a catalogue built from these.
