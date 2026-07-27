# reactiveWritableSignal

Creates a writable signal that reacts to changes in other signals (sources).

## Import

```typescript
import { reactiveWritableSignal } from '@craft-ng/core';
```

## Overview

`reactiveWritableSignal` is built on top of Angular's `linkedSignal`. It compares source references to determine if a reaction callback should be called. When a source's reference changes (`!==`), the associated callback is executed with the new value and the current state.

## Basic Usage

```typescript
const selectedRows = reactiveWritableSignal([] as string[], (sync) => ({
  reactionName: sync(
    sourceSignal, // The signal to watch
    ({ params, current }) => {
      // params: the new value of the source
      // current: the current state of the writable signal
      return newState;
    },
  ),
}));
```

## Reaction Execution Order

**Important:** During the same reactive cycle, multiple callbacks can be triggered. The order of reactions in the object matters - callbacks are executed in declaration order.

Place reactions that should run first at the top of the object.

## Options

The `sync` function accepts an optional third parameter for controlling execution timing:

### `onInitOnly`

When `true`, the callback is executed **only during initialization** and will be ignored on subsequent source changes.

```typescript
sync(source, callback, { onInitOnly: true });
```

### `onInitToo`

When `true`, the callback is executed **during initialization AND on subsequent source changes**. By default (without options), callbacks only run when the source changes after initialization.

```typescript
sync(source, callback, { onInitToo: true });
```

## Complete Example

```typescript
protected readonly selectedRows = craftUse(
  state(
    'selectedRows',
    reactiveWritableSignal([] as string[], (sync) => ({
      resetWhenCurrentPageIsResolved: sync(
        this.usersQuery.currentPageStatus, // Signal<ResourceStatus>
        ({ params, current }) => (params === 'resolved' ? [] : current),
      ),
      resetWhenBulkDeleteIsResolved: sync(
        this.bulkDelete.status, // Signal<ResourceStatus>
        ({ params, current }) => (params === 'resolved' ? [] : current),
      ),
      removeDeletedItemsWhenDeleteUserIsResolved: sync(
        this.delayUserDeletion.changes.resolved, // Signal<string[]>
        ({ params: resolvedIds, current }) =>
          resolvedIds.length > 0
            ? removeMany({
                entities: current,
                ids: resolvedIds,
              })
            : current,
      ),
    })),
    ({ update, set, state: selectedRows }) => {
      const isAllSelected = computed(
        () =>
          this.usersQuery.currentPageData()?.length &&
          this.usersQuery
            .currentPageData()
            ?.every((user) => selectedRows().includes(user.id)),
      );
      return {
        toggleSelection: (id: string) =>
          update((current) =>
            current.includes(id)
              ? current.filter((item) => item !== id)
              : [...current, id],
          ),
        isSelected: (id: string) => {
          return selectedRows().includes(id);
        },
        isAllSelected,
        isSomeSelected: computed(
          () =>
            this.usersQuery
              .currentPageData()
              ?.some((user) => selectedRows().includes(user.id)) &&
            !isAllSelected(),
        ),
        toggleAllSelection: () => {
          if (isAllSelected()) {
            set([]);
          } else {
            const allIds =
              this.usersQuery.currentPageData()?.map((user) => user.id) || [];
            set(allIds);
          }
        },
      };
    },
  ),
).selectedRows;
```

## How It Works

1. `reactiveWritableSignal` tracks all source signals defined in the reaction builder
2. On each read, it creates a snapshot of all source values
3. It compares the current snapshot with the previous one **by reference** (`!==`)
4. Only callbacks whose source reference has changed are executed
5. Callbacks are executed in the order they are declared in the object

## When to Use

Use `reactiveWritableSignal` when you need a writable signal that:

- Reacts to external signal changes
- Can be manually updated with `set()` or `update()`
- Needs to synchronize with multiple sources
- Requires fine-grained control over when reactions execute
