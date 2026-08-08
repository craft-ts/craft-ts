# Inject at the point of use

This page introduces the first **recommended approach** for structuring a
Craft application. It is not a catalogue of "bad" Angular code: Angular and
Craft make different trade-offs. The useful rule is simple:

> **Get what you need where you need it.**

Declare a dependency in the smallest factory that actually uses it. If a query
needs an API method, the query yields that method. If a route guard needs the
current user, the guard yields the user service. There is no need to add an
intermediary method to a component just to forward the call.

## The usual Angular shape

In a conventional Angular component, the API dependency is often injected into
the class and then exposed through a method that performs the request:

```typescript
export class TasksComponent {
  constructor(private readonly api: TaskApi) {}

  readonly tasks = signal<Task[]>([]);

  loadTasks() {
    this.api.list().subscribe((tasks) => this.tasks.set(tasks));
  }
}
```

This is perfectly valid Angular. But the component now owns several different
responsibilities: it resolves the API, starts the request, stores the result,
and usually has to reproduce loading and error handling as well.

The actual dependency is also hidden from the outside. Looking at the public
type of `TasksComponent` does not tell the compiler, a route, or a test that
`TaskApi` is required.

## Craft puts the dependency next to the work

With Craft, the component declares the query directly, and the query yields
exactly the API operation it needs. In this example, `TaskApi` is a crafted
service (or an existing Angular service adapted with
[`toCraftService`](/guide/app/integrate-existing)):

```typescript
import { craftComponent, each, ifBlock, li, p, ul } from '@craft-ng/component';
import { query } from '@craft-ng/core';

export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* query('tasks', {
      params: () => true,
      loader: function* () {
        return yield* TaskApi.list();
      },
    });

    return { tasks };
  },
  ({ tasks }) =>
    ifBlock(
      tasks.isLoading,
      () => p('Loading…'),
      () =>
        ul(
          each(
            () => tasks.value() ?? [],
            { track: (task) => task.id },
            (task) => li(task.title),
          ),
        ),
    ),
);
```

`TaskApi` is used directly from the `query` loader. The query owns the server
state, while the template owns only the rendering of that state. There is no
`loadTasks()` method, and no extra service whose only job is to forward this
request.

## Why this is useful

### The dependency graph is explicit

`yield* TaskApi.list()` is part of the factory's dependency type. Craft can use
the same information for route DI checks, test registers, and dependency
snapshots. A missing provider or mock is found at the boundary where it matters.

### Dependencies stay granular

When a consumer needs one operation, yield that operation instead of the whole
service:

```typescript
const list = yield * TaskApi.list();
```

The graph records the property that was used. Tests only need to provide
`list`, and future changes to unrelated API methods do not expand this
consumer's contract.

### Async behaviour has one owner

`query` derives the loading, value, and exception state. The component does not
need a second signal, subscription, or manual error flag that could drift away
from the request.

## The rule of thumb

- If a query or mutation needs an API operation, yield it in that query or
  mutation.
- If a service needs another service, yield the dependency in that service's
  factory.
- If a component needs a dependency directly, yield it in the component's
  factory.
- Create a dedicated service when it owns reusable behaviour or a meaningful
  boundary — not merely to forward one method call.

Direct does not mean unstructured. The dependency is still named, tracked,
scoped, mockable, and exposed through a deliberate public API. It simply lives
close to the code that uses it.

## See also

- [The mental model](/guide/concepts/mental-model) — declare, yield, derive
- [`craftService`](/guide/app/craft-service) — define and compose services
- [Shaping a service's public API](/guide/app/expose-api) — expose only what a
  consumer needs
- [Testing services](/guide/testing/services) — test the same dependency graph
