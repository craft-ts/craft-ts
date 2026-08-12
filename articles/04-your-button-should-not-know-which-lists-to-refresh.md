---
title: 'Your button should not know which lists to refresh'
published: false
description: 'After a write succeeds, something has to update the reads. Most Angular apps answer that at the call site or with an event bus. Here is what it looks like when the read declares what makes it stale.'
tags: angular, typescript, webdev, signals
series: 'Building craft-ng'
canonical_url: ''
cover_image: ''
---

Fetching data is the part everyone writes about. The part that actually decays over the life of a project is the other one:

**A write just succeeded. Which reads are now wrong, and whose job is it to fix them?**

Every app answers this, and most answer it in the same place — the click handler:

```typescript
async onCreate(title: string) {
  await this.tasks.create({ title });
  await this.tasks.reload();
}
```

That works on the day you write it. Then the same task appears in a sidebar counter, and the handler grows a second reload. Then a colleague adds a create button on another screen and forgets the reload entirely, so the list is stale in one place and fresh in another. Then someone introduces an event bus to stop the bleeding, and now the coupling still exists but nothing in the type system can see it.

The problem is not the reload. It is that **the button knows about the list.** A click handler's job is to express intent — "create this task" — and it has been handed a second job: knowing every consequence of that intent, everywhere in the app, forever.

## The write primitive

`mutation` is `query`'s counterpart. Same shape, triggered explicitly instead of reactively:

```typescript
const createTask = yield* mutation('createTask', {
  method: (payload: { title: string }) => payload,
  loader: function* ({ params }) {
    return yield* CraftHttpClient.post(({ response }) => ({
      url: '/api/tasks',
      body: params,
      success: response<Task>(),
    }));
  },
});

yield* createTask.mutate({ title: 'Write article 4' });
```

`method` is the entry point: it takes what the caller passes and returns what the loader receives. Which makes it the natural place to refuse work — return a `craftException` and the request never leaves the browser:

```typescript
const createTask = yield* mutation('createTask', {
  method: (payload: { title: string }) =>
    payload.title.trim().length === 0
      ? craftException({ code: 'TITLE_REQUIRED' }, { received: payload.title })
      : payload,
  loader: /* … */,
});
```

The failures then come back split by **origin**, which turns out to matter more than I expected:

```typescript
createTask.exceptions().params?.TITLE_REQUIRED; // your method rejected it
createTask.exceptions().loader?.TITLE_ALREADY_EXISTS; // the server did
```

`params` means nothing left the browser. `loader` means the server was involved. Same failure code, very different thing to tell the user — and different thing to retry.

## The inversion: the read declares what makes it stale

Here is the actual idea, and it is one line of design rather than a feature list.

The link between a write and a read is declared **on the read**:

```typescript
const tasksQuery = yield* query(
  'tasksQuery',
  {
    params: () => ({ done: false }),
    loader: function* () {
      return yield* TaskApi.list();
    },
  },
  insertReactOnMutation(createTask, {
    reload: { onMutationSuccess: true },
  }),
);
```

Read that as a sentence: *this query knows that `createTask` invalidates it.*

Nothing in the click handler changed — it still just calls `createTask.mutate(...)`. No subscription, no event bus, no `refetch()` at the call site. Add a second screen with a create button and it works there too, because the knowledge lives with the data, not with the button that happened to be first.

That inversion is the whole point. **Staleness is a property of the read.** The list is the only thing that knows what would make it wrong; the button never had that information in the first place, and asking it to carry that responsibility is what makes these bugs recur.

## Optimistic, and what happens when you are wrong

Reloading costs a round trip, and the user watches it. So the reaction can apply the change immediately:

```typescript
insertReactOnMutation(renameTask, {
  optimisticPatch: {
    title: ({ mutationParams }) => mutationParams.title,
  },
  reload: { onMutationException: true },
});
```

While `renameTask` is in flight, `tasksQuery.value()` already shows the new title. If the mutation fails, the query reloads and the truth comes back.

That pairing — optimistic change plus reload on exception — is the one I reach for most, because it encodes the honest version of optimism: *show the likely result now, and have a plan for being wrong.* Most hand-rolled optimistic updates implement the first half and improvise the second, usually as a `catch` block that tries to reverse the patch by hand and gets it subtly wrong.

There are four levers, combinable:

| Option | Effect |
|---|---|
| `patch` | apply a field-by-field change once the mutation resolves |
| `optimisticPatch` | apply it immediately, before the server answers |
| `optimisticUpdate` | same, but you compute the whole new value |
| `reload` | re-run the loader — on success, on exception, or on resolved |
| `filter` | only react when this predicate passes |

## When several instances of the same query are alive

With `identifier`, a query has parallel instances — one per user, one per page of a list. A reaction then has to say *which* instance it concerns, or you invalidate all of them:

```typescript
insertReactOnMutation(updateUser, {
  filter: ({ queryIdentifier, mutationParams }) =>
    mutationParams.id === queryIdentifier,
  patch: {
    name: ({ mutationParams: { name } }) => name,
  },
});
```

`filter` is also where the interesting logic ends up in real apps. Reload the current page only when the deletion emptied it. React to a bulk delete only if this page holds any of the deleted ids. Those are the rules that normally live as comments in a store, and here they are predicates the compiler type-checks against both the mutation's params and the query's value.

Since a query takes a single insertion, several reactions compose through `insertQueryPipe`:

```typescript
insertQueryPipe(
  insertStoragePersister({ storeName: 'app', key: 'users' }),
  insertReactOnMutation(deleteUser, {
    filter: ({ mutationIdentifier, queryResource }) =>
      !!queryResource.value()?.some((u) => u.id === mutationIdentifier),
    optimisticUpdate: ({ queryResource, mutationIdentifier }) =>
      removeOne({ entities: queryResource.value(), id: mutationIdentifier }),
    reload: { onMutationException: true },
  }),
  insertReactOnMutation(deleteUser, {
    filter: ({ queryResource }) => queryResource.value()?.length === 0,
    reload: { onMutationResolved: true },
  }),
);
```

Two reactions to the same mutation, with different jobs: patch the list optimistically, and separately reload when the page has become empty. Written as two rules rather than one branching handler, which is the difference between something you can add to and something you rewrite.

## What this costs

**The read now imports the write.** This is the honest tension in the design, and I would rather name it than let you find it. The dependency arrow points from the query to the mutation, which is the opposite of the direction most people expect, and it means your query module knows about your mutation module. In a feature where both live together, that is fine. Across features it needs a deliberate placement decision, and it can back you into a circular import if you are careless about where each primitive is declared.

**A reaction that fires on everything is coupling with extra steps.** The library's own advice is the right one: do not wire a reaction between things that are not genuinely related. `insertReactOnMutation` makes the link explicit and type-checked — it does not make a bad link good, it just makes it easier to write a lot of them.

**Optimism has a semantic cost you still own.** `optimisticUpdate` asks you to compute the new value, and it is your logic that decides what the list looks like before the server agrees. Reverting is handled; being wrong in an interesting way is not something any library can take from you.

**Composition arrives quickly.** A single insertion per query means the second reaction already needs `insertQueryPipe`. It is a small ceremony, but it shows up early enough that you will meet it on your first real list.

## The question

The design bet here is that **staleness belongs to the read**. I think it is right, and I know it is not the only defensible answer — a global event log where writes emit and reads subscribe is the other one, and it is what NgRx-style architectures give you.

**Where do you currently put that knowledge?** In the call site, in an effect, in a store's reducer, in a manual `refetch()` chain? And more usefully: **has that placement survived contact with your app's growth**, or is it the thing you keep going back to fix?

Next in this series: **insertions** — the composition model behind `insertReactOnMutation`, `insertEntities`, persistence and pagination, and why they are one argument rather than a plugin system.

---

*This article was co-written with Claude. The library, the design decisions and the opinions are mine.*
