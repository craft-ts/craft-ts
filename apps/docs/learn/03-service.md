# 3. Move logic out of the component

**Goal:** turn your task state into a service other components can use.

## From component factory to `craftService`

The factory body moves out almost unchanged — it was already a generator:

```typescript
import { craftService, state } from '@craft-ng/core';

export const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* () {
    const { tasks } = yield* state('tasks', [] as Task[], ({ state, update }) => ({
      add: (title: string) => update((current) => [...current, newTask(title)]),
      toggle: (id: string) =>
        update((current) =>
          current.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        ),
      remaining: computed(() => state().filter((t) => !t.done).length),
    }));

    return tasks;
  },
);
```

A service is the same shape as a component's logic factory: a generator that
yields what it needs and returns a context. The only additions are a **name** and
a **scope**.

## Using it

The component now yields the service instead of declaring the state:

```typescript
export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* TaskList();
    return { tasks };
  },
  ({ tasks }) => [
    /* unchanged */
  ],
);
```

`craftService` returns a helper named after the service — here `TaskList`. There
is no `injectTaskList` and no class to import.

## Picking a scope

`scope` is the one decision to make. Four you will actually use:

| Scope       | Instance                   | Use it when                                                |
| ----------- | -------------------------- | ---------------------------------------------------------- |
| `function`  | fresh on every injection   | the service belongs to a single component (**start here**)  |
| `toProvide` | one per `provideX()` mount | a parent, or a route, shares it with children               |
| `global`    | one for the whole app      | genuinely app-wide state                                    |
| `abstract`  | none — a contract          | the implementation is decided elsewhere                     |

Default to `function`. It needs no provider and it says out loud "this instance
is not shared". Move to `toProvide` the day a child component needs the *same*
instance, and provide it at the component or the route:

```typescript
export const Tasks = craftComponent(
  'Tasks',
  { providers: [provideTaskList()] },
  function* () {
    const tasks = yield* TaskList();
    return { tasks };
  },
  ({ tasks }) => [
    /* … */
  ],
);
```

::: warning `toProvide` fails at runtime, not compile time
Angular does not error when a provider is missing. That is exactly the hole the
[route DI check](/learn/09-routing) closes.
:::

The two remaining scopes (`manuallyProvidedAtRoot`, and the details of
`abstract`) are covered in [Service scopes](/guide/app/service-scopes).

## Parameterising an instance

A service can take **inputs**: the factory's first parameter is an object the
call site supplies. Keep them callable (signals or getters) so the service stays
reactive to them:

```typescript
export const { TaskList } = craftService(
  { name: 'TaskList', scope: 'function' },
  function* (inputs: { projectId: () => string }) {
    const { tasks } = yield* state('tasks', [] as Task[] /* … */);
    // inputs.projectId() is reactive — read it wherever you need it
    return tasks;
  },
);
```

```typescript
const tasks = yield* TaskList({ projectId: () => currentProjectId() });
```

Inputs are how you get several configured instances out of one `function`-scoped
service, instead of duplicating it.

## Giving the service its own providers

The service config also takes `providers`, for dependencies that should be
scoped to this service rather than to whoever mounts it:

```typescript
export const { TaskList } = craftService(
  {
    name: 'TaskList',
    scope: 'function',
    providers: [provideTaskApi()],
  },
  function* () {
    const api = yield* TaskApi();
    // …
  },
);
```

Note this is a different thing from `provideTaskList()`, which is the helper
*other* code uses to mount a `toProvide` service.

::: tip There is more to both
Inputs interact with the property shortcuts (`X.property()` is deliberately
blocked when a service has inputs, so a missing dependency can't hide behind a
default — `X.OmitInputs.property()` opts out). Providers can also be declared
per primitive, and abstract services turn "who provides this" into a decision of
the mounting site.

All of it is on [craftService](/guide/app/craft-service) and [Shaping the public
API](/guide/app/expose-api) — come back once the tutorial is done.
:::

## Exposing less than everything

A service returns whatever it wants to be public. Here `TaskList` returns the
whole `tasks` ref. If a consumer only needs one property, it can say so:

```typescript
const remaining = yield* TaskList.remaining();
```

The dependency graph then records that only `remaining` was used — which makes
tests smaller, and is why [step 10](/learn/10-testing) is short.

## What you gained

Logic that is reusable, injectable and testable, declared as a function with a
name and a scope — no `@Injectable`, no constructor.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 2. Derive instead of duplicate](/learn/02-derive)

[4. Compose services →](/learn/04-compose)

</div>
