# 6. Write server data

**Goal:** create a task on the server, and make the list update before the
request even comes back.

## The mutation primitive

`mutation` is `query`'s counterpart for writes. Same shape, triggered explicitly.

<<< @/tests/snippets/learn/06-mutate-data/create-task.spec.ts#create-task

`method` is the entry point: it takes what the caller passes and returns what
the loader receives as `params`. It is also where you can reject input before any
request happens (see below).

## Making the list react

The interesting part is not the mutation, it's wiring it to the query. That's an
insertion — `insertReactOnMutation`:

<<< @/tests/snippets/learn/06-mutate-data/react-on-mutation.spec.ts#react-on-mutation

The query now reloads itself whenever `createTask` succeeds. No subscription, no
event bus, no manual `refetch()` call at the call site.

## Optimistic updates

Reloading costs a round-trip. `optimisticPatch` applies the change immediately
and reverts it if the mutation fails:

```typescript
insertReactOnMutation(renameTask, {
  optimisticPatch: {
    title: ({ mutationParams }) => mutationParams.title,
  },
  reload: { onMutationException: true },
});
```

While `renameTask` is in flight, `tasksQuery.value()` already shows the new
title. If it throws, the query reloads to get the truth back.

## Rejecting bad input

You rarely want to send a request you know will fail. Return a `craftException`
from `method` and the loader never runs:

```typescript
import { craftException } from '@craft-ng/core';

const createTask = yield* mutation('createTask', {
  method: (payload: { title: string }) =>
    payload.title.trim().length === 0
      ? craftException({ code: 'TITLE_REQUIRED' }, { received: payload.title })
      : payload,
  loader: /* … */,
});

yield* createTask.mutate({ title: '  ' });
createTask.hasException(); // true
createTask.exceptions().params?.TITLE_REQUIRED;
```

Note the shape: `exceptions()` is split by **origin** — `params` for what your
`method` rejected, `loader` for what the request produced. Both are typed from
the codes you declared, so the compiler knows `TITLE_REQUIRED` exists and that
`TITLE_TOO_LONG` doesn't.

### Or let a schema do it

Hand-written guards get long as soon as there are several fields. Declare a
schema instead and the primitive validates the argument for you:

```typescript
import { z } from 'zod';

const CreateTaskSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

const createTask = yield* mutation('createTask', {
  methodSchema: CreateTaskSchema,
  method: (payload) => payload, // already validated and typed by the schema
  loader: /* … */,
});
```

`methodSchema` validates what `mutate(...)` receives, and `method` then gets the
schema's **output** value — so a coercion or a `.trim()` in the schema is
reflected in the type.

Any library implementing `StandardSchemaV1` works — Zod, Valibot, Effect, or a
hand-written `{ '~standard': … }` object. None of them becomes a dependency of
`@craft-ng`. Queries have the same hooks for their reactive params
(`paramsSchema`) and their result (`loaderSchema`).

**Use a schema** when the shape itself is the rule, **a `craftException` from
`method`** when the rule is business logic — "this title already exists in the
current project" is not something a schema can know. See
[Schema validation](/guide/state/schema-validation).

::: tip Exceptions as values
A craft _exception_ is a value you declared and expect to handle. An _error_ is
the unexpected kind. Keeping the two apart is what makes the exhaustiveness
checks later possible — see [Exceptions](/guide/concepts/exceptions).
:::

## What you gained

A write path that owns its loading and failure state, and a declarative link
between writes and reads.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 5. Load server data](/learn/05-load-data)

[7. Put state in the URL →](/learn/07-url-state)

</div>
