# insertLocalStorage

The `insertLocalStorage` insertion automatically synchronizes state with browser localStorage, persisting data across sessions.

## Import

```typescript
import { insertLocalStorage } from '@craft-ng/core';
```

## Basic Usage

```typescript
const myState = state(
  0,
  insertLocalStoragePersister({
    storeName: 'myTestStore',
    key: 'myState',
  }),
);
const myQuery = query(
  {
    params: () => 'test',
    loader: async () => {
      return { data: 'testData' };
    },
  },
  insertLocalStoragePersister({
    storeName: 'myTestStore',
    key: 'myTestQuery',
  }),
);
const myMutation = mutation(
  {
    method: () => 'test',
    loader: async () => {
      return { data: 'testData' };
    },
  },
  insertLocalStoragePersister({
    storeName: 'myTestStore',
    key: 'myMutation',
  }),
);
const myAsyncProcess = asyncProcess(
  {
    method: () => 'test',
    loader: async () => {
      return { data: 'testData' };
    },
  },
  insertLocalStoragePersister({
    storeName: 'myTestStore',
    key: 'myAsyncProcess',
  }),
);
```

## See Also

- [state](/primitives/state) - Base primitive for state
- [insertReactOnMutation](/insertions/insert-react-on-mutation) - React to mutations
- [Store](/store/craft) - Compose insertions in stores
