# Lexical Map

## Read This First

Use this file to translate product wording into concrete public APIs.
Prefer the documented APIs first. Use the advanced exports only when the request is explicitly about plumbing, source wiring, or custom infrastructure.

## Primary Primitives

### `query`

Match: `afficher`, `liste`, `tableau`, `detail`, `charger`, `recuperer`, `fetch`, `read`, `dashboard`, `feed`, `resultats`, `historique`, `stats`, `donnees serveur`, `recharger`, `rafraichir`.
Pair with: `queryParam`, `insertReactOnMutation`, `insertPaginationPlaceholderData`, `insertLocalStoragePersister`, `craftQuery`.
Default: Use `params` for reactive inputs, `method` for explicit trigger flows, `identifier` for pagination or parallel instances, and `preservePreviousValue` or placeholder strategies when flicker matters.

### `mutation`

Match: `creer`, `ajouter`, `enregistrer`, `modifier`, `mettre a jour`, `editer`, `patcher`, `supprimer`, `archiver`, `activer`, `desactiver`, `publier`, `bulk action`, `submit`, `confirmer`.
Pair with: `insertReactOnMutation`, `insertFormSubmit`, `craftMutations`, `query`.
Default: Create one mutation per server intent. Add `identifier` when row-level actions need independent loading states or cancellation semantics.

### `asyncProcess`

Match: `debounce`, `temporiser`, `retarder`, `valider en asynchrone`, `autosave`, `partager`, `clipboard`, `native API`, `background task`, `processus asynchrone`, `polling`.
Pair with: `source$`, `afterRecomputation`, `craftAsyncProcesses`.
Default: Choose this when the flow is asynchronous but is not the canonical server read cache and is not a write that should drive query synchronization.

### `state`

Match: `etat local`, `selection`, `toggle`, `ouvert`, `ferme`, `modal`, `onglet actif`, `draft`, `brouillon`, `checkbox`, `expanded`, `wizard step`, `current tab`, `UI state`.
Pair with: `insertSelect`, `insertEntities`, `insertForm`, `reactiveWritableSignal`, `craftState`.
Default: Keep the state granular. Use it for client-only state and view state that should not live in the URL.

### `queryParam`

Match: `URL`, `query string`, `search params`, `filtre URL`, `pagination URL`, `tri dans l'URL`, `onglet partageable`, `deep link`, `etat partageable`, `back-forward`.
Pair with: `query`, `craftQueryParam`, `craftQueryParams`, `craftSetAllQueriesParamsStandalone`.
Default: Split URL concerns by group when useful. Put `page`, `pageSize`, `sort`, `search`, `filters`, `tab`, and similar shareable state here.

### `source$`

Match: `trigger`, `refresh`, `reset`, `bus evenementiel`, `broadcast`, `declencher`, `signal d'action`, `event stream`, `cross feature trigger`.
Pair with: `on$`, `afterRecomputation`, `craftSources`.
Default: Choose this when the spec describes an event, not a persistent state.

### `on$`

Match: `quand X arrive alors`, `react to`, `reset on`, `sync on`, `internal reaction`, `hidden binding`, `do not expose this method`.
Pair with: `source$`, `state`, `mutation`, `asyncProcess`, `injectService`.
Default: Use this for hidden reactive wiring that should run from a source but should not become part of the public API.

### `reactiveWritableSignal`

Match: `selection qui se reset`, `synchroniser un etat writable avec plusieurs signaux`, `reset on page change`, `reset on mutation resolved`, `derived writable state`.
Pair with: `state`, `query`, `mutation`, `removeMany`.
Default: Use this when a writable local state must react automatically to external signal changes but still support `set` and `update`.

### `injectService`

Match: `facade`, `wrapper de service`, `exposer une petite API`, `renommer des methodes`, `derive from service signals`, `hide imperative router/service API`.
Pair with: `on$`, `computed`, `craftInject`.
Default: Choose this outside store composition when the user wants a smaller typed service-facing API.

## Store Composition

### `craft`

Match: `feature store`, `page store`, `global store`, `store reutilisable`, `compose store`, `DI`, `providedIn`, `scope`, `reusable state module`.
Pair with: `craftState`, `craftQuery`, `craftMutations`, `craftSources`, `craftInputs`, `craftQueryParam`, `craftQueryParams`, `craftInject`, `craftComputedStates`, `craftAsyncProcesses`.
Default: Use `providedIn: 'feature'` for page or route scoped logic and `providedIn: 'root'` for global shared logic.

### `craftState`

Match: `etat local dans le store`, `selection store`, `modal store`, `draft store`, `store-owned UI state`.
Pair with: `state`, `on$`, `reactiveWritableSignal`.
Default: Use when the state belongs inside a `craft` store and should be exposed as store entries and prefixed methods.

### `craftQuery`

Match: `requete dans le store`, `server state in store`, `cached resource in feature store`, `page query`.
Pair with: `query`, `craftInputs`, `craftInject`, `craftQueryParam`, `insertReactOnMutation`.
Default: Use when a `query` belongs inside a composed store boundary.

### `craftMutations`

Match: `actions serveur du store`, `store mutations`, `CRUD actions grouped in store`, `row actions in store`.
Pair with: `mutation`, `craftQuery`, `insertReactOnMutation`.
Default: Group server write actions here so the store gets prefixed trigger methods and typed state access.

### `craftAsyncProcesses`

Match: `async workflow in store`, `debounced action in store`, `delayed delete`, `background task in store`.
Pair with: `asyncProcess`, `craftSources`.
Default: Use when async client tasks belong to a `craft` store but are not the primary server-read/write state.

### `craftSources`

Match: `reset event`, `refresh event`, `select event`, `open modal event`, `trigger inside store`.
Pair with: `source$`, `on$`, `afterRecomputation`.
Default: Use this to define event channels inside a store and to auto-generate `emit*`, `set*`, or `next*` methods.

### `craftInputs`

Match: `parent provides id`, `route provides id`, `component input`, `external signal`, `context value`, `page receives userId`.
Pair with: `craftQuery`, `craftState`, `craftMutations`.
Default: Use this instead of `queryParam` when the value does not belong in the URL.

### `craftQueryParam`

Match: `one query param group in store`, `pagination in store`, `filters in store`, `search params in store`.
Pair with: `queryParam`, `craftQuery`, `craftSetAllQueriesParamsStandalone`.
Default: Use when one named query-param group should live inside a `craft` store.

### `craftQueryParams`

Match: `several URL state groups`, `pagination + filters + active tab`, `multiple query param groups`.
Pair with: `queryParam`, `craftSetAllQueriesParamsStandalone`.
Default: Use when the store needs several named query-param groups.

### `craftComputedStates`

Match: `derived store data`, `isAllSelected`, `count`, `filtered count`, `UI flags`, `aggregation`, `composed loading state`.
Pair with: `computed`, `craftState`, `craftQuery`.
Default: Use for derived store-level signals instead of duplicating state.

### `craftInject`

Match: `inject ApiService`, `inject Router`, `inject HttpClient`, `inject token`, `service dependency in store`.
Pair with: `craft`, `craftQuery`, `craftMutations`.
Default: Use inside `craft` when store factories need Angular services or tokens.

### `craftSetAllQueriesParamsStandalone`

Match: `generate URL`, `router navigate queryParams`, `shareable link`, `build full query string outside injection context`.
Pair with: `craftQueryParam`, `craftQueryParams`.
Default: Use when the spec mentions programmatic navigation or link generation from the current query-param model.

## Insertions

### `insertReactOnMutation`

Match: `optimistic update`, `keep list in sync`, `instant UI update`, `cache invalidation`, `reload on failure`, `patch visible data after mutation`, `remove row immediately`, `sync query with mutation`.
Pair with: `query`, `mutation`, `removeOne`, `removeMany`, `updateOne`, `setOne`.
Default: Put this on the `query`, not on the mutation. Use `optimisticPatch` for shallow fields, `optimisticUpdate` for arrays and structural changes, and `reload.onMutationError: true` by default when optimistic behavior is enabled.

### `insertPaginationPlaceholderData`

Match: `pagination without flicker`, `keep previous page visible`, `placeholder data`, `smooth page transition`.
Pair with: `query`, `queryParam`.
Default: Prefer this when pagination is user-visible and loading empty states would degrade the UX.

### `insertLocalStoragePersister`

Match: `remember filters`, `remember last data`, `persist cache`, `survive refresh`, `restore session`, `client cache`.
Pair with: `query`, `state`, `mutation`, `asyncProcess`.
Default: This is the public insertion name even if some docs page titles still say `insertLocalStorage`.

### `insertEntities`

Match: `entity collection`, `array of entities`, `manage list items by id`, `adapter-like methods`, `bulk array operations`, `collection helper methods`.
Pair with: `state`, `query`, `queryParam`, entity helpers such as `removeOne`, `updateMany`, and `upsertOne`.
Default: Use this when the spec repeatedly talks about item-level collection operations and the collection should expose reusable typed methods.

### `insertSelect`

Match: `nested state`, `row-level behavior`, `cell`, `grid`, `sub-tree`, `select nested object`, `per-item nested methods`.
Pair with: `state`, `insertNoopTypingAnchor`.
Default: Use this for object or array sub-state behavior. Keep `insertNoopTypingAnchor` nearby if TypeScript loses contextual typing.

### `insertNoopTypingAnchor`

Match: `TypeScript inference breaks`, `nested insertSelect typing issue`, `form tree typing issue`.
Pair with: `insertSelect`, `insertSelectFormTree`.
Default: Use only as a typing anchor. It is not a product-level match by itself.

## Entity Helpers

| Helper | Match |
| --- | --- |
| `addOne` | `add one`, `append`, `insert item`, `push row`, `create local row` |
| `addMany` | `add several`, `append many`, `bulk insert local items` |
| `setOne` | `replace one by id`, `sync one entity`, `override row` |
| `setMany` | `replace several by id`, `merge incoming entities` |
| `setAll` | `replace whole list`, `reset collection from server` |
| `updateOne` | `partial update one`, `patch one row`, `edit one entity` |
| `updateMany` | `partial update several`, `bulk patch` |
| `upsertOne` | `create or update one`, `insert if missing` |
| `upsertMany` | `create or update several`, `merge or append` |
| `removeOne` | `delete one`, `remove one`, `remove row`, `optimistic single delete` |
| `removeMany` | `delete several`, `bulk delete`, `remove selected`, `optimistic bulk delete` |
| `removeAll` | `clear list`, `empty collection`, `reset all` |
| `map` | `transform all`, `recompute whole list`, `toggle all`, `mark all` |
| `mapOne` | `transform one by id`, `toggle one`, `edit one with custom mapper` |
| `computedTotal` | `count`, `total`, `number of items` |
| `computedIds` | `all ids`, `selected ids`, `row ids` |

## Forms

### `insertForm`

Match: `form`, `inline edit`, `edition`, `create form`, `submit form`, `field state`.
Pair with: `insertSelectFormTree`, `insertFormAttributes`, `insertFormSubmit`.
Default: Use this when the spec explicitly talks about a form experience. The form API is currently early-stage, so keep implementations close to the documented examples.

### `insertSelectFormTree`

Match: `field`, `field subtree`, `name input`, `email input`, `nested form field`.
Pair with: `insertForm`, `insertNoopTypingAnchor`, `insertFormAttributes`.
Default: Use this to target form fields or nested form paths.

### `insertFormAttributes`

Match: `validation rules`, `disabled field`, `hidden field`, `field attributes`, `visible exceptions`.
Pair with: `insertSelectFormTree`, validators such as `cRequired` and `cEmail`.
Default: Put synchronous validators and field presentation rules here.

### `insertFormSubmit`

Match: `submit form`, `save form`, `form -> mutation`, `validated submit`, `submitting state`.
Pair with: `mutation`, `insertForm`.
Default: Connect form submission to the mutation that owns the server write intent.

### Validators

| Validator | Match |
| --- | --- |
| `cRequired` | `required`, `mandatory`, `must not be empty` |
| `cEmail` | `email`, `must be a valid email` |
| `cMin` | `minimum numeric value`, `at least N`, `lower bound` |
| `cMax` | `maximum numeric value`, `at most N`, `upper bound` |
| `cMinLength` | `minimum length`, `at least N characters` |
| `cMaxLength` | `maximum length`, `no more than N characters` |
| `cPattern` | `regex`, `format`, `must match pattern` |
| `cValidate` | `custom validator`, `domain rule`, `business validation` |
| `cAsyncValidate` | `async validator`, `server-side validation`, `check availability` |

## Event And Source Bridges

### `afterRecomputation`

Match: `auto-trigger from source`, `map source payload before query`, `hidden transformed trigger`, `source-based execution`.
Pair with: `source$`, `signalSource`, `query`, `mutation`, `asyncProcess`.
Default: Use this when the spec is about event-driven execution and the payload needs a transformation before reaching the resource.

### `fromEventToSource$`

Match: `DOM event to source`, `click stream`, `input stream`, `scroll source`, `window resize source`.
Pair with: `on$`, `state`, `asyncProcess`.
Default: Prefer this when the event must become a readonly source with signal access to the last emitted value.

### `sourceFromEvent`

Match: `DOM event to state reducer`, `event mapper`, `legacy event bridge`.
Pair with: `state`.
Default: Choose this only if the reducer-style event mapping fits better than `fromEventToSource$`.

### `toSource`

Match: `signal to source`, `route signal to event pipeline`, `form signal to auto query`, `debounced signal bridge`.
Pair with: `afterRecomputation`, `query`, `mutation`, `asyncProcess`.
Default: Use only when the starting point is already a signal and the next stage expects a source.

### `computedSource`

Match: `source to source transformation`, `extract field from source`, `format source payload`, `compose source pipeline`.
Pair with: `afterRecomputation`, `signalSource`.
Default: Use when the spec is explicit about source transformation pipelines.

### `signalSource`

Match: `source with signal shape`, `event source with set`, `lazy event signal`, `source semantics with preserveLastValue`.
Pair with: `craftSources`, `afterRecomputation`, `linkedSource`.
Default: Choose this only when the implementation specifically wants signal-like source behavior rather than `source$`.

### `linkedSource`

Match: `derived signalSource`, `preserve last computed source value`, `source derivation with writable source semantics`.
Pair with: `signalSource`.
Default: Keep this for advanced source composition.

### `stackedSource`

Match: `collect several source payloads`, `stack events in same cycle`, `aggregate source emissions`.
Pair with: advanced source composition only.
Default: Treat this as infrastructure-level. Do not infer it from ordinary product wording.

## Persistence And Infra

### `GlobalPersisterHandlerService`

Match: `logout clears cache`, `switch account`, `privacy wipe`, `force full cache reset`, `clear persisted data`.
Pair with: `insertLocalStoragePersister`.
Default: Use this when the requirement explicitly asks to clear all ng-craft persisted cache.

### `localStoragePersister`

Match: `custom persister factory`, `storage backend`, `manual persistence infrastructure`.
Pair with: `insertLocalStoragePersister`.
Default: Prefer the insertion for product specs. Use this lower-level factory only for custom persistence infrastructure.

### `resourceById`

Match: `low-level resource registry`, `resources keyed by identifier`, `manual per-id cache infrastructure`, `bind one resource-by-id to another`.
Pair with: `query.identifier`, `mutation.identifier`.
Default: Prefer ordinary `query` and `mutation` with `identifier` until the request explicitly asks for custom resource infrastructure.

### `toInject`

Match: `bind external signals into service entries`, `service ...Entry wiring`, `service adapter for signals`.
Pair with: Angular services exposing writable `...Entry` signals.
Default: Use only when the service API already follows the `...Entry` convention and the request is about service binding infrastructure.
