# Snippets pour captures - article dev.to @craft-ng

## 01 - Structure commune des primitives

```ts
import { computed } from '@angular/core';

const counter = state(
  0,
  ({ set, update }) => ({
    increment: () => update((current) => current + 1),
    reset: () => set(0),
  }),
  ({ state }) => ({
    isOdd: computed(() => state() % 2 === 1),
  }),
);

counter.increment();
counter.isOdd();
```

## 02 - state + insertSelect + insertEntities

```ts
import {
  addMany,
  insertEntities,
  insertSelect,
  state,
  updateOne,
} from '@craft-ng/core';

type User = { id: string; name: string; selected: boolean };

const usersState = state(
  {
    filters: { search: '' },
    users: [] as User[],
  },
  insertEntities({
    path: 'users',
    methods: [addMany, updateOne],
  }),
  insertSelect('filters', ({ set }) => ({
    setSearch: (search: string) => set({ search }),
  })),
);

usersState.usersAddMany({
  newEntities: [{ id: '1', name: 'Romain', selected: false }],
});
usersState.selectFilters().setSearch('@craft-ng');
```

## 03 - query + pagination + reactOnMutation

```ts
import {
  insertPaginationPlaceholderData,
  insertReactOnMutation,
  mutation,
  query,
} from '@craft-ng/core';

const updateUser = mutation({
  method: (payload: { id: string; name: string }) => payload,
  loader: async ({ params }) => params,
});

const page = signal(1);
const usersQuery = query(
  {
    params: page,
    identifier: (p) => `page-${p}`,
    loader: async ({ params: currentPage }) =>
      fetch(`/api/users?page=${currentPage}`).then((r) => r.json()),
  },
  insertPaginationPlaceholderData,
  insertReactOnMutation(updateUser, {
    patch: {
      name: ({ mutationParams }) => mutationParams.name,
    },
  }),
);
```

## 04 - mutation + source$

```ts
import { mutation, on$, source$ } from '@craft-ng/core';

const submitProfile$ = source$<{ id: string; email: string }>();

const saveProfile = mutation({
  method: on$(submitProfile$, (payload) => payload),
  loader: async ({ params }) => {
    const response = await fetch(`/api/users/${params.id}`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
    return response.json();
  },
});

submitProfile$.emit({ id: '42', email: 'new@mail.dev' });
saveProfile.isLoading();
```

## 05 - asyncProcess

```ts
import { asyncProcess } from '@craft-ng/core';

const delaySearch = asyncProcess({
  method: (term: string) => term,
  loader: async ({ params: term }) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return term;
  },
});

delaySearch.value(); // undefined
delaySearch.status(); // 'idle'
delaySearch.method('@craft-ng');
delaySearch.status(); // 'loading' -> after 250ms -> 'resolved'
delaySearch.value(); // '@craft-ng'
```

## 06 - queryParam

```ts
import { queryParam } from '@craft-ng/core';

const tableParams = queryParam(
  {
    state: {
      page: {
        fallbackValue: 1,
        codec: {
          decode: (v) => parseInt(v, 10),
          encode: (v) => String(v),
        },
      },
      search: {
        fallbackValue: '',
        codec: { decode: (v) => v, encode: (v) => v },
      },
    },
  },
  ({ patch, reset }) => ({ patch, reset }),
);

tableParams.patch({ page: 2 });
```

## 07 - source$ pour orchestrer plusieurs states

```ts
import { on$, source$, state } from '@craft-ng/core';

const resetFilters$ = source$<void>();

const search = state('', ({ set }) => ({
  set,
  reset: on$(resetFilters$, () => set('')),
}));

const page = state(1, ({ set }) => ({
  set,
  reset: on$(resetFilters$, () => set(1)),
}));

resetFilters$.emit();
```

## 08 - toSource + afterRecomputation

```ts
import {
  afterRecomputation,
  source$,
  toSource,
} from '@craft-ng/core';

const userAction$ = source$<{ type: 'add' | 'remove'; id: string }>();
const userActionSignal = signal<{ type: 'add' | 'remove'; id: string } | null>(
  null,
);

const actionSource = toSource(userActionSignal, {
  computed: (value) => value,
});

const saveSelection = mutation({
  method: afterRecomputation(userAction$, (event) => event.id),
  loader: async ({ params }) => params,
});
```

## 09 - injectService façade

```ts
import { computed } from '@angular/core';
import { injectService } from '@craft-ng/core';

const checkout = injectService(
  CheckoutService,
  ({ cart, total, submitOrder }) => ({
    total,
    itemCount: computed(() => cart().length),
    submit: submitOrder,
  }),
  ({ insertions }) => ({
    canSubmit: computed(() => insertions.itemCount() > 0),
  }),
);

checkout.canSubmit();
```
