# Project Index

## Public API Entry Point

- `libs/core/src/index.ts`

Use this file to confirm the exact exported symbol names before recommending an API.

## High-Value Documentation

- `apps/docs/guide/concepts/mental-model.md`
- `apps/docs/guide/state/local-state.md`
- `apps/docs/guide/state/server-state.md`
- `apps/docs/guide/state/mutations.md`
- `apps/docs/guide/state/async-process.md`
- `apps/docs/guide/state/url-state.md`
- `apps/docs/guide/concepts/insertions.md`
- `apps/docs/guide/state/react-on-mutation.md`
- `apps/docs/guide/state/pagination-placeholder.md`
- `apps/docs/guide/state/collections.md`
- `apps/docs/guide/state/persistence.md`
- `apps/docs/guide/state/select.md`
- `apps/docs/guide/app/craft-service.md`
- `apps/docs/guide/app/integrate-existing.md`
- `apps/docs/guide/testing/services.md`
- `apps/docs/guide/reactivity/on.md`
- `apps/docs/guide/reactivity/source.md`
- `apps/docs/utils/inject-service.md`
- `apps/docs/guide/reactivity/after-recomputation.md`
- `apps/docs/guide/reactivity/source-from-event.md`
- `apps/docs/guide/reactivity/from-event-to-source.md`
- `apps/docs/guide/forms/index.md`

## Best Local Examples

### Pagination

- `apps/demo/src/app/examples/primitives/list-with-pagination/list-with-pagination.ts`

Use this example for:

- `queryParams` pagination state
- paged `query`
- `insertPaginationPlaceholderData`
- `insertLocalStoragePersister`

### Full User Management With Services And Primitives

- `apps/demo/src/app/examples/craft/full-demo/full-demo.ts`

Use this example for:

- `craftService`
- `queryParams`
- `query`
- `mutation`
- `asyncProcess`
- `state`
- `craftPipe` composition
- `insertReactOnMutation`
- `removeOne`
- `removeMany`
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
- Reach for advanced exports such as `toSource`, `computedSource`, `signalSource`, `linkedSource`, and `resourceById` only when the request is explicitly about infrastructure or source plumbing.
