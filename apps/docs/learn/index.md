# Learn @craft-ng

This is the guided path. You build **one app**, from an empty component to a
routed, tested feature — adding exactly one idea per step.

If you are looking for a specific answer instead, go to the
[Guide](/guide/) (organised by task) or search.

## What you will build

A task list. It starts as three lines in a component and ends up with server
data, optimistic updates, URL state, a validated form, a typed route and tests.

| Step                                                    | What you add                                |
| ------------------------------------------------------- | ------------------------------------------- |
| [1. Your first state](/learn/01-first-state)            | `craftComponent`, `state`                   |
| [2. Derive instead of duplicate](/learn/02-derive)      | computed + methods                          |
| [3. Move logic out of the component](/learn/03-service) | `craftService`                              |
| [4. Compose services](/learn/04-compose)                | generators, `yield*`                        |
| [5. Load server data](/learn/05-load-data)              | `query`                                     |
| [6. Write server data](/learn/06-mutate-data)           | `mutation`, optimistic updates              |
| [7. Put state in the URL](/learn/07-url-state)          | `queryParams`                               |
| [8. Build a form](/learn/08-forms)                      | `insertForm`, validators                    |
| [9. Wire up routing](/learn/09-routing)                 | `craftRoute`, compile-time DI check         |
| [10. Test what you wrote](/learn/10-testing)            | testing by register, architecture rules     |

Then: [Where to go next](/learn/next).

::: tip Wondering what this buys you over plain Angular?
[What craft adds to Angular](/guide/concepts/vs-angular) is the inventory —
including what it costs.
:::

## Before you start

You need an Angular 21 application and Node.js 20.19+ (or 22.12+). No prior
knowledge of generators, RxJS or signals internals is required — each is
introduced when it first earns its place.

::: tip Read in order
Every step builds on the previous one's code. Skipping ahead works, but step 4
is where the mental model clicks — don't skip that one.
:::

::: warning Experimental
`@craft-ng` and this documentation are both experimental. APIs can still move
between minor versions.
:::

<div style="text-align: right; margin-top: 2rem">

[Start → Your first state](/learn/01-first-state)

</div>
