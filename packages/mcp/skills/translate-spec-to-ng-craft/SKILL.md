---
name: translate-spec-to-ng-craft
description: Translate functional specifications, user stories, page requirements, CRUD flows, list/detail screens, filters, pagination, bulk actions, optimistic updates, forms, and Angular feature-store architecture into @craft-ng/core primitives, insertions, store utilities, and source helpers. Use when a request asks which ng-craft utility to choose, or when wording such as "afficher", "liste", "detail", "supprimer", "selection multiple", "pagination", "filtre URL", "formulaire", "recharger en cas d'erreur", or "feature store" must be mapped to `query`, `mutation`, `state`, `queryParams`, `craft*`, form helpers, or entity helpers.
---

# Translate Spec To Ng Craft

## Objective

Translate business wording into concrete `@craft-ng/core` APIs and default compositions.
Prioritize documented public APIs from the installed `@craft-ng/core` package and
the published docs (MCP `search_documentation`, or https://ng-angular-stack.github.io/craft/llms.txt).

## Workflow

1. Decompose the spec into:
   - remote reads
   - remote writes
   - local UI state
   - URL state
   - events and triggers
   - forms and validation
   - store boundaries and dependency injection
2. Read [references/lexical-map.md](references/lexical-map.md) first.
3. Read [references/pattern-recipes.md](references/pattern-recipes.md) when the spec combines several concerns or asks for defaults.
4. Read [references/project-index.md](references/project-index.md) when examples or exact local paths are needed.
5. Return a concrete mapping, not a generic architecture overview.

## Decision Rules

- Match server reads to `query`.
- Match server writes to `mutation`.
- Match generic asynchronous client tasks to `asyncProcess`.
- Match local UI-only state to `state`.
- Match URL-backed state to `queryParams`.
- Match reusable, page-level, or global store requirements to `craft` plus `craft*` helpers.
- Match event buses, resets, refreshes, and hidden triggers to `source$` and `on$`.
- Match list collection semantics to `insertEntities` and the entity helpers when the spec explicitly talks about add, remove, update, upsert, replace, or clear.
- Match nested sub-state behavior to `insertSelect`.
- Match forms to `insertForm`, `insertSelectFormTree`, `insertFormAttributes`, and `insertFormSubmit`.
- Treat `computedSource`, `toSource`, `signalSource`, `linkedSource`, `resourceById`, `toInject`, and other infra helpers as advanced choices. Do not choose them first unless the spec is about plumbing.

## Default Heuristics

- A primitive accepts ONE insertion. When composing 2+ insertions on the same primitive, use the universal `craftPipe` with an explicit context: `primitive(config, (context) => craftPipe(context, insertion1, insertion2))`. Never generate the removed variadic form `primitive(config, insertion1, insertion2)`. The same form applies to the nested insertions of `insertSelect`: `insertSelect('grid', (gridContext) => craftPipe(gridContext, ...))`. Exception: the form-tree helpers stay variadic.
- When a mutation affects data already visible in a `query`, add `insertReactOnMutation` on the `query`.
- When the optimistic path is obvious, prefer `optimisticPatch` for shallow field edits and `optimisticUpdate` for array or structural changes.
- When using optimistic update, enable `reload: { onMutationError: true }` by default unless the spec forbids a refetch.
- When optimistic deletion can empty the current page, consider a second `insertReactOnMutation(..., { reload: { onMutationResolved: true } })`.
- When the spec mentions pagination or page transitions, consider `identifier` on the `query` and `insertPaginationPlaceholderData`.
- When the spec mentions remembered filters, remembered results, refresh survival, or lightweight cache, consider `insertLocalStoragePersister`.
- When the spec mentions parent-provided values or route or context values that are not URL query params, consider `craftInputs`.
- When the spec mentions Angular services or a facade over a service, consider `craftInject` or `injectService`.

## Output Contract

Always structure the answer as:

1. `Spec fragment -> utility`
2. `Recommended composition`
3. `Default behaviors`
4. `Baseline helper already covering this` — the existing architecture-suite helper (`assertMutationHasReactOn`, `assertHttpEndpointUnique`, `assertCraftUnique`, `assertPersistedPrimitiveHasUnique`, `assertInsertSelectUnique`, `assertInteractiveElementNamed`, `assertRouteDiProofs`, …). This is not a new `it()`. Do not add an architecture rule for the feature.
5. `Open questions or assumptions`

Propose a **new** custom architecture rule only when the spec states a product invariant the baseline helpers do not cover (this feature must not depend on that one). Then load `ng-craft-architecture-tests`.

Name the concrete public APIs exactly as exported by the library.
When the spec implies a helper method, name it too: `removeOne`, `removeMany`, `updateOne`, `upsertMany`, `cRequired`, `cMinLength`, and similar helpers.

## Example Mappings

Spec: `Creer une page qui affiche une liste d'utilisateurs.`
Mapping: `query` for remote list loading. Add `queryParams` only if pagination, filters, sort, or shareable URL state are part of the spec.

Spec: `Creer une page qui affiche une liste d'utilisateurs. On peut supprimer un utilisateur via un bouton, ou en selectionner plusieurs pour en supprimer plusieurs.`
Mapping: `query` for the list, one `mutation` for single delete, one `mutation` for bulk delete, one selection `state` or `craftState` for selected ids, and `insertReactOnMutation` on the `query` with optimistic removal plus `reload.onMutationError = true`. Use `removeOne` and `removeMany` for the optimistic transforms.
Baseline helper already covering this: `assertMutationHasReactOn` (and `assertHttpEndpointUnique` if the list HTTP is owned once). Do not add an architecture rule for the feature.

Spec: `Creer une page de recherche avec filtres dans l'URL et pagination sans flicker.`
Mapping: `queryParams` for filter and pagination state, `query` for results, `insertPaginationPlaceholderData` to keep previous page data visible during transitions, `craftSetAllQueriesParamsStandalone` if the page must generate URLs outside injection context.

## References

- Read [references/lexical-map.md](references/lexical-map.md) for the lexical mapping.
- Read [references/pattern-recipes.md](references/pattern-recipes.md) for default compositions.
- Read [references/project-index.md](references/project-index.md) for the local source material to consult.
