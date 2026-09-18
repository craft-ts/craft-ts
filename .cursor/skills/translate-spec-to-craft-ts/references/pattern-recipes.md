# Pattern Recipes

> Composition rule: a primitive takes ONE insertion. When a recipe below lists
> several insertions for the same primitive, compose them with `craftPipe`,
> passing the context explicitly, e.g.
> `query(name, cfg, (context) => craftPipe(context, insertLocalStoragePersister(...), insertReactOnMutation(...), insertReactOnMutation(...)))`.
> The same form works for the nested insertions of `insertSelect`:
> `insertSelect('grid', (gridContext) => craftPipe(gridContext, ...))`.
> Exception: the form-tree helpers stay variadic.

## Read-Only List Page

Use:
- `query` for the remote collection.
- `queryParams` when pagination, sort, search, filters, or tabs live in the URL.
- `insertPaginationPlaceholderData` when page transitions should keep old data visible.
- `insertLocalStoragePersister` when results or params should survive a refresh.

Default policy:
- Put `page`, `pageSize`, `search`, `sort`, and filters in `queryParams`.
- Use `identifier` on the `query` when page or filter combinations should keep independent cached instances.
- Prefer `currentPageData()` and `currentPageStatus()` when using pagination placeholders.

## Detail Page

Use:
- `query` for the entity detail.
- `mutation` for update or delete intents.
- `insertReactOnMutation` on the detail `query` when edits should be reflected immediately.
- `CraftServiceInput` when the entity id comes from component or route context but does not belong in query params.

Default policy:
- Keep one detail `query` per detail intent.
- Use `optimisticPatch` when a shallow field like `name`, `status`, or `email` changes.

## List Page With Single Delete And Bulk Delete

Use:
- one `query` for the list.
- one `mutation` for single delete.
- one `mutation` for bulk delete.
- one selection `state` holding selected ids.
- `insertReactOnMutation` on the list `query` for each mutation.

Default policy:
- For single delete, prefer `optimisticUpdate` with `removeOne`.
- For bulk delete, prefer `optimisticUpdate` with `removeMany`.
- Enable `reload: { onMutationError: true }` on both optimistic reactions by default.
- Add a second `insertReactOnMutation(..., { reload: { onMutationResolved: true } })` when optimistic delete can empty the current page and the next page should be reloaded; compose all the reactions on the list `query` with `(context) => craftPipe(context, ...)`.
- Add `mutation.identifier` when row-level loading or cancel buttons matter.

## Inline Edit Or Create Form

Use:
- `state` plus `insertForm`.
- `insertSelectFormTree` to target the edited fields.
- `insertFormAttributes` for validators, disable rules, visibility, or field metadata.
- `mutation` for submit.
- `insertFormSubmit(mutationRef)` to connect the form to the mutation.
- `insertReactOnMutation` on visible queries when the updated entity is already displayed elsewhere.

Default policy:
- Put synchronous business validation in form validators first.
- Use `cRequired`, `cEmail`, `cMinLength`, and the other validator helpers before writing custom validators.
- Keep one mutation per submit intent, not one mutation per field.

## Search Page With URL Filters

Use:
- `queryParams` for the filters.
- `query` for the result list.
- the router service when links or navigation must be generated outside a component template.

Default policy:
- Reset `page` to `1` when a search term or filter changes.
- Keep URL parsing and serialization explicit for each field.
- Use separate named `queryParams` primitives when the page has several query-params groups.

## Feature Or Page Service

Use:
- `craftService` as the boundary.
- generated service dependencies for services and tokens.
- `CraftServiceInput` for non-URL external values.
- `queryParams` for URL-backed state.
- `source$` and `on$` for reset, refresh, and cross-entry triggers.
- `query`, `mutation`, `state`, and `craftComputed` for the actual feature logic.

Default policy:
- Choose a scoped `craftService` for page or route scoped logic.
- Choose `providedIn: 'root'` for globally shared services.
- Keep remote state in `query` and `mutation`, not in ad-hoc service fields.

## Smaller Facade Over An Angular Service

Use:
- `craftService` when the facade needs to own primitives or dependencies.
- a plain adapter when no reactive service boundary is needed.

Default policy:
- Expose only the service surface the feature actually needs.
- Hide reactive bindings with `on$` when they should not become part of the public API.

## Event-Driven Execution

Use:
- `source$` or `signalSource` for the trigger.
- `afterRecomputation` when the trigger payload needs adaptation.
- source-based `query`, `mutation`, or `asyncProcess` when the resource should run automatically on emission.

Default policy:
- Prefer `source$` for ordinary product flows.
- Escalate to `toSource`, `computedSource`, or `linkedSource` only when the inputs are already signals or the request is explicitly about source pipelines.

## Persistence And Cache Reset

Use:
- `insertLocalStoragePersister` when a specific state or query should survive refreshes.
- `GlobalPersisterHandlerService` when the requirement says logout, account switch, or privacy reset must clear persisted cache.

Default policy:
- Persist only the state that improves UX.
- Clear all persisted cache on user boundary changes when the stored data becomes invalid or sensitive.
