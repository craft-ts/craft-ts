# 3. Move logic out of the component

**Goal:** move component-owned task state behind a named service that the
component and its children can consume.

## From the component to `craftService`

The factory body moves out almost unchanged — it was already a generator:

<<< @/tests/snippets/learn/03-service/task-list.spec.ts#task-list

A service is the same shape as a component, minus the nodes: a generator that
yields what it needs. The differences: a **name**, a **scope** — and no
`return`. A service exposes every named primitive it yields, under its name, so
`TaskList` exposes `tasks` and has a `toProvide` scope because the component
owns this mutable state.

## Using it

The component mounts one service instance in its provider scope, then resolves
it without passing inputs each time:

```typescript
export const Tasks = craftComponent(
  'Tasks',
  { providers: [provideTaskList()] },
  function* () {
    const { tasks } = yield* TaskList();

    return [
      /* unchanged */
    ];
  },
);
```

`craftService` returns a helper named after the service — here `TaskList`. There
is no `injectTaskList` and no class to import.

## Picking a scope

Choose a scope from the lifetime and owner of the service:

| Scope       | Instance                   | Use it when                                                |
| ----------- | -------------------------- | ---------------------------------------------------------- |
| `toProvide` | one per provider scope     | a component, feature, or route owns state or context        |
| `function`  | fresh on every `X(...)`    | reusable per-call logic is composed by other services      |
| `global`    | one for the whole app      | genuinely app-wide state                                    |
| `abstract`  | none — a contract          | the implementation is decided elsewhere                     |

Use `toProvide` even when only the owning component uses the service. A
provider keeps that component's state in one instance and lets child
components resolve the same instance. `provideX()` registers the provider; the
service factory runs only when `X()` is first resolved. `appStart: true` is the
eager exception.

For a reusable operation called by other services, use `function`. Every
`X(inputs)` helper call creates a fresh service context and receives its own
inputs. It is not a cached state store for a component.

The service in this lesson has no configurable inputs, so a regular component
provider is enough:

```typescript
export const Tasks = craftComponent(
  'Tasks',
  { providers: [provideTaskList()] },
  function* () {
    const { tasks } = yield* TaskList();

    return [
      /* … */
    ];
  },
);
```

::: warning `toProvide` needs an explicit provider
The route DI check verifies that the provider is present, and
[architecture tests](/guide/testing/architecture#assertroutediproofs) keep the
proof in place.
:::

The two remaining scopes (`manuallyProvidedAtRoot`, and the details of
`abstract`) are covered in [Service scopes](/guide/app/service-scopes).

## Passing configuration

A reusable `function` service can take **call-site inputs**. Changing values are
yieldable readers (`CraftServiceInput<T>`) — yield them so the input-to-service
edge stays in the graph:

```typescript
import { craftExpose, craftService, type CraftServiceInput } from '@craft-ts/core';

export const { TaskDetails } = craftService(
  { name: 'TaskDetails', providedIn: 'function' },
  function* (inputs: { taskId: CraftServiceInput<string> }) {
    yield* craftExpose('taskId', yield* inputs.taskId());
  },
);
```

```typescript
const { taskId } = yield* TaskDetails({ taskId: 'task-42' });
```

Use this shape when each service call needs its own parameters. When values
configure state owned by a component or route, put them under `$provided` on a
`toProvide` service and register them once. For component inputs, use
`withComponentProviders`; [Service inputs](/guide/app/craft-service#service-inputs)
shows the complete example.

## Giving the service its own providers

The service config also takes `providers`, for dependencies that should be
scoped to this service rather than to whoever mounts it:

```typescript
export const { TaskList } = craftService(
  {
    name: 'TaskList',
    providedIn: 'function',
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

A service's API is what it yields; wrap what should stay internal in
`craftPrivate(...)`. If a consumer only needs one exposed property, it can say
so:

```typescript
const tasks = yield* TaskList.tasks();
```

The dependency graph then records that only `tasks` was used — which makes
tests smaller, and is why [step 10](/learn/10-testing) is short.

## What you gained

Component-owned state now lives in a named, injectable and testable service —
no `@Injectable`, no constructor. Reusable per-call logic can use the `function`
scope and compose other services without owning a shared instance.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 2. Derive instead of duplicate](/learn/02-derive)

[4. Compose services →](/learn/04-compose)

</div>
