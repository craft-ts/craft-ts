# Project Index

## Public API Entry Point

- `libs/core/src/index.ts`

Use this file to confirm the exact exported symbol names before recommending an API.

## High-Value Documentation

- `apps/docs/introduction.md`
- `apps/docs/primitives/state.md`
- `apps/docs/primitives/query.md`
- `apps/docs/primitives/mutation.md`
- `apps/docs/primitives/async-process.md`
- `apps/docs/primitives/query-params.md`
- `apps/docs/insertions/craft-pipe.md`
- `apps/docs/insertions/insert-react-on-mutation.md`
- `apps/docs/insertions/insert-pagination-placeholder-data.md`
- `apps/docs/insertions/insert-entities.md`
- `apps/docs/insertions/insert-local-storage.md`
- `apps/docs/insertions/insert-select.md`
- `apps/docs/store/craft-service.md`
- `apps/docs/store/to-craft-service.md`
- `apps/docs/store/setup-craft-service-testing-by-register.md`
- `apps/docs/utils/on$.md`
- `apps/docs/utils/source$.md`
- `apps/docs/utils/reactive-writable-signal.md`
- `apps/docs/utils/inject-service.md`
- `apps/docs/utils/after-recomputation.md`
- `apps/docs/utils/source-from-event.md`
- `apps/docs/utils/from-event-to-source$.md`
- `apps/docs/forms/index.md`

## Best Local Examples

### Pagination

- `apps/demo/src/app/examples/primitives/list-with-pagination/list-with-pagination.ts`

Use this example for:

- `queryParams` pagination state
- paged `query`
- `insertPaginationPlaceholderData`
- `insertLocalStoragePersister`

### Full User Management With Craft Store

- `apps/demo/src/app/examples/craft/full-demo/full-demo.ts`

Use this example for:

- `craft`
- `craftQueryParams`
- `craftQuery`
- `craftMutations`
- `craftAsyncProcesses`
- `craftState`
- `craftPipe` composition
- `insertReactOnMutation`
- `removeOne`
- `removeMany`
- `reactiveWritableSignal`
- selection reset after query or mutation changes

### Full User Management With Primitives

- `apps/demo/src/app/examples/primitives/full-demo/full-demo.ts`

Use this example for:

- primitives-only composition
- inline form editing
- delayed delete flows
- selection state
- form submit integration

## Notes

- Favor the symbol names from `libs/core/src/index.ts` over older or shorter doc page titles.
- The public insertion name is `insertLocalStoragePersister`.
- The public store computed utility name is `craftComputedStates`.
- The public async store utility name is `craftAsyncProcesses`.
- Reach for advanced exports such as `toSource`, `computedSource`, `signalSource`, `linkedSource`, `resourceById`, and `toInject` only when the request is explicitly about infrastructure or source plumbing.
