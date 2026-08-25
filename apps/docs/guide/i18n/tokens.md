# Tokens

A token is the unit that makes a message parameter typed. It carries a **name**
(the parameter key), a **kind**, an optional **guard**, and a **formatter** that
receives the active locale.

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

`percent` takes a ratio, not a percentage: `0.125`, not `12.5`. That is `Intl`'s
convention and the token does not second-guess it.

## Your own token

Business vocabulary does not belong in a shared library. `defineToken` builds
one, and it looks exactly like a shipped token at the call site:

<<< @/tests/snippets/guide/i18n/tokens/tokens.spec.ts#custom-token

The `validate` guard is what keeps an arbitrary string out of the params type: a
message that interpolates this token accepts `'paid' | 'pending' | 'refunded'`
and nothing else. Without it, the parameter widens and the token stops earning
its place.

`format` receives the value and a context carrying `locale` and, when the
runtime was given one, `timeZone`. Keep the branching on `context.locale`
coarse — a language prefix, not a full locale match — unless you genuinely have
per-region wording.

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
