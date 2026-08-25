# Learn CraftTS with Effect

This is the guided path for teams that already use [Effect](https://effect.website/)
and want CraftTS to own the UI, reactivity and application graph.

If you are evaluating CraftTS from an existing Effect codebase, start with
[Effect users: start here](/learn-effect/00-start-here). It explains what stays
in Effect, what moves to Craft's UI model, and how to try the integration in
fifteen minutes.

You start with a Craft component, then move the domain work into Effect programs:
`Layer` provides services, `Effect<A, E, R>` carries success, typed failures and
requirements, and Craft adapters expose those programs as reactive resources.

## What you will build

| Step | What you add |
| --- | --- |
| [0. Effect users: start here](/learn-effect/00-start-here) | boundary, quickstart and adapter choice |
| [1. Start with a Craft component](/learn-effect/01-first-component) | `craftComponent`, templates, native Craft state |
| [2. Derive UI state](/learn-effect/02-derive) | `craftComputed`, `yield*`, precise dependencies |
| [3. Put the domain in Effect](/learn-effect/03-effect-domain) | `Effect`, tagged errors, `Context.Service`, `Layer`, `SyncOp` |
| [4. Load data with Effect](/learn-effect/04-load-data) | `queryEffect`, typed errors and defects |
| [5. Write data with Effect](/learn-effect/05-write-data) | `mutationEffect`, `asyncProcessEffect`, reactive updates |
| [6. Provide Layers and route the app](/learn-effect/06-layers-routing) | app/route Layers, DI proofs, type-safe routes |
| [7. Build forms and validate boundaries](/learn-effect/07-forms-validation) | Effect Schema, forms, typed submit errors |
| [8. Test the graph](/learn-effect/08-testing) | Effect service mocks, Craft registers, architecture tests |
| [9. Call server functions — POC](/learn-effect/09-server-functions) | client/server boundary, `serverFunction`, `executeEffect` |

## Before you start

You need a TypeScript application, Node.js 20.19+ (or 22.12+), and basic
knowledge of generators. The guide uses Effect 4 RC and the beta CraftTS
packages:

```shell
npm i @craft-ts/core@beta @craft-ts/component@beta @craft-ts/effect@beta
npm i effect@rc
npm i -D @craft-ts/dev-tools@beta
```

Keep `@craft-ts/core`, `@craft-ts/component` and `@craft-ts/effect` on the same
CraftTS version. `@craft-ts/effect` has `effect` as a peer dependency.

::: warning Experimental APIs

CraftTS and this Effect integration are still experimental. The Effect bridge,
the server-function API and their types can change between beta releases. The
server-function chapter is deliberately labelled **proof of concept**: use it
to explore the model, not as a final production contract.

:::

::: tip The central rule

Craft owns the reactive boundary. Effect owns domain programs and their
dependencies. Do not create a `stateEffect`: use native Craft `state` for UI
state, and use `queryEffect`, `mutationEffect` or `asyncProcessEffect` when an
Effect program crosses into a Craft resource.

:::

<div style="text-align: right; margin-top: 2rem">

[Start → Craft component](/learn-effect/01-first-component)

</div>
