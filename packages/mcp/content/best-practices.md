# CraftTS best practices for coding agents

This guide is the contract for generating `@craft-ts/core` code in an application that already imported the library. Prefer it over Angular class/signal habits.

Public docs: https://craft-ts.github.io/craft
LLM index: https://craft-ts.github.io/craft/llms.txt
Full dump: https://craft-ts.github.io/craft/llms-full.txt

When MCP tools are available, call `get_best_practices` once, then `search_documentation` / `get_skill` instead of inventing APIs.

## Mental model

- Declare with a name, `yield*` what you do not own, derive the rest.
- One API shape for every kind of state: `state`, `query`, `mutation`, `queryParams`, `asyncProcess`.
- Insertions compose behaviour (`insertForm`, `insertReactOnMutation`, `insertEntities`, persistence). A primitive takes **one** insertion. Compose with `craftPipe(context, a, b)`.
- Services are factories (`craftService`), not classes.
- Components are selectorless functions (`craftComponent`) with typed hyperscript, not `@Component` + HTML templates.

## Which primitive

| Need | Primitive |
| --- | --- |
| Local UI state you own | `state` |
| Server read, refetch from reactive params | `query` |
| Server write, triggered explicitly | `mutation` |
| Shareable URL query-string state | `queryParams` |
| One-off async job with lifecycle | `asyncProcess` |

Decision page: `/guide/concepts/choose-primitive`.

## Rules you must not break

1. **`yield*` every Craft reader.** Primitive roots, insertions, `query.value()`, `query.status()`, service helpers. Do not call a reader as a function to unwrap it. In tests and other synchronous boundaries use `craftUse(reader())`.
2. **Do not author `signal()`, `computed()`, `linkedSignal()`, or Angular `inject()`** in Craft code. `signal()` is only for Angular-class interop.
3. **Do not use `async` / `await` / `for await`.** Generators, `craftSleep`, and `CraftHttpClient` replace them.
4. **HTTP:** `query` for reads, `mutation` for writes, both backed by `CraftHttpClient`. No raw `fetch` / `HttpClient`.
5. **Forms** derive from `state` + `insertForm`. Validators are `cRequired`, `cEmail`, `cMinLength`, … Submit through `insertFormSubmit` + a `mutation`. Failures are `craftException` values.
6. **Services:** `craftService({ name, scope }, function* () { ... })`. Adapt Angular/third-party tokens once with `toCraftService`. Consume the generated `X()` helper, typically `yield* X(...)`.
7. **Routes:** `craftRoutes(name, [...])`, every component route has `componentDeps: {} as import('./x').GenDeps_X`, and **every file** has its own `ValidateCascadeRoutesFile` / `CanRun` check. Parent checks do not cover `loadChildren`. On `TS2589`, split with `loadChildren` — never delete the check.
8. **Templates:** `ifBlock` / `matchBlock` / `each` / `defer`, not `@if` / `@for`. Interactive helpers take a unique literal local name: `button('save', { type: 'button', ... }, 'Save')`. The name is `data-craft-name` and must be unique in the app (`assertInteractiveElementNamed`).
9. **Let ESLint keep generated aliases.** After DI or route edits, run `eslint --fix`. Do not hand-edit `GenDeps_*` or `_Check*` / `_CanRun*` blocks.

Install `@craft-ts/dev-tools` and enable the `craft-ts/*` ESLint rules. They are the compiler's partner: a missing route check or a raw `inject()` should fail CI, not production.

The `architecture/` suite is the graph contract: unique HTTP, unique identities, armed route DI proofs, folder lanes. Scaffold it at app start (`craft-ts-architecture-tests`, `craft-migrate-architecture`). During a feature, run it. Do not add an architecture rule for the feature. Add a new `it()` only to freeze a spotted smell so it cannot recur.

## Default compositions

- Mutation that changes a visible list: `insertReactOnMutation` on the `query`. Prefer `optimisticPatch` for shallow fields, `optimisticUpdate` for arrays. Enable `reload: { onMutationError: true }` unless the spec forbids refetch.
- Pagination / no-flicker page changes: `queryParams` + `query` + `insertPaginationPlaceholderData`.
- Collections (add/remove/update/upsert): `insertEntities` and `removeOne` / `removeMany` / `updateOne` / `upsertMany`.
- Remembered filters or results: `insertStoragePersister` / `insertLocalStoragePersister`.
- Nested sub-state: `insertSelect`. Nested forms: `insertSelectFormTree` + `insertSubFormField`.

## Agent workflow

1. If this is app setup or `craft-migrate`, and `architecture/` is missing, load `craft-ts-architecture-tests` and scaffold the baseline. Mid-feature, offer the scaffold; do not impose it.
2. Map the request to primitives (`translate-spec-to-craft-ts` skill). Name the baseline helper that already covers the mapping; do not invent a rule per feature.
3. Search docs for the exact export (`search_documentation`, then `get_documentation_page`).
4. For routes, follow `craft-ts-routes`. For existing Angular services, `craft-ts-service-migration`. For a whole app, `migrate-to-craft-ts` then `craft-migrate`. Load `craft-ts-architecture-tests` when a graph smell must not recur.
5. Run the app's lint, typecheck, existing architecture tests, and tests. Do not claim success from filtered output.

Confirm symbol names against the installed `@craft-ts/core` (and `@craft-ts/component`) in `node_modules`. If they disagree with this guide, the installed package wins.

In local development, drive the already-open `ng serve` tab with the function-registry MCP tool `page` (see `/guide/ai/dev-page`). `@craft-ts/mcp` does not expose `page`; it is docs and skills for writing Craft.
