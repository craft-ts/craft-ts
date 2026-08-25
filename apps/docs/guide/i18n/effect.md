# i18n with Effect

`@craft-ts/i18n-effect` is an **adapter, and only an adapter**. It exposes three
things — a service tag, a `Layer`, and one function — over a runtime you built
the ordinary way. `@craft-ts/i18n` itself never imports Effect, and plain
component code should keep calling `t` directly.

## The Layer

<<< @/tests/snippets/guide/i18n/effect/effect.spec.ts#layer

`provideI18nRuntime(runtime)` returns `Layer.Layer<I18nEffectService>`. It wraps
the runtime you already have, so there is exactly one active locale in the
process — the Effect side does not get its own.

## Bind the locales once

`translateEffect` has no value parameter carrying the locales, so TypeScript has
nothing to infer them from. Called bare, its key parameter resolves to `never`
and **even a valid key is rejected**. Bind them once, in the same file as the
Layer:

<<< @/tests/snippets/guide/i18n/effect/effect.spec.ts#bind

From there, `t` has the closed key union and the typed params back. Passing the
type arguments at every call site —
`translateEffect<typeof locales, 'order.total'>(…)` — works too, and is what
this wrapper spares you.

## `translateEffect`

<<< @/tests/snippets/guide/i18n/effect/effect.spec.ts#translate

The signature is `translateEffect(key, params) =>
Effect.Effect<string, never, I18nEffectService>`. Same closed key union, same
typed params, same string as `runtime.t` — the snippet above is checked against
`runtime.t` in the docs test suite rather than trusted.

The error channel is `never` on purpose: a translation that reaches this point
cannot fail on a bad key or a bad parameter, because neither compiles. What
_can_ fail is the locale not being loaded, and that is a defect in the app's
startup, which is why it throws `I18nRuntimeError` rather than becoming a typed
failure every call site would have to handle.

## When to reach for it

Use `translateEffect` **inside an Effect program** — a domain service building a
message, a server handler rendering an email. In a component, `t` is the shorter
and framework-independent path, and reaching for Effect just to format a string
adds a requirement to the program for nothing.

See also the [Effect adapters](../advanced/effect.md) page for the rest of the
`@craft-ts/*-effect` family.
