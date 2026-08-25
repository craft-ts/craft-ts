# 1. Your first state

**Goal:** get a reactive value on screen, and meet the two building blocks you
will use in every step — `craftComponent` and a primitive.

## Install

```shell
npm i @craft-ts/core@beta @craft-ts/component@beta
npm i -D @craft-ts/dev-tools@beta
```

The packages are currently published on the `beta` channel. The component
package contains the functional renderer, while `core` contains the reactive
primitives used by the component factory.

## A component with state

A Craft component is a **function**, not a class. It takes a name, meta, a logic
factory, and a template:

<<< @/tests/snippets/learn/01-first-state/tasks-component.spec.ts#tasks-component

Four arguments, and each has one job:

| Argument     | What it is                                                  |
| ------------ | ----------------------------------------------------------- |
| `'Tasks'`    | the component's name — used by the tooling and by host tags |
| `{}`         | meta: providers, styles, host properties (empty for now)    |
| `function*`  | the **logic factory** — builds and returns the context      |
| `({ … }) =>` | the **template** — receives that context, returns nodes     |

There is no class, no decorator, no separate HTML file, and no host element
wrapped around your markup.

## Inputs and outputs

A component's inputs and outputs are just **parameters of the logic factory**,
typed with `Input<T>` and `Output<Handler>`:

<<< @/tests/snippets/learn/01-first-state/user-card.spec.ts#user-card

An `Input<T>` **is a yieldable reader** — `yield* user()` reads the current
value. Project nested fields with `deepYieldable` so `user.name` stays a
reader. An `Output<H>` is a yieldable callback; delegate to it with `yield*`.

At the call site you pass the reader itself, not a getter:

```typescript
UserCard({
  user: currentUser,
  onRemove: removeUser,
});
```

| Contract | Craft |
| --- | --- |
| Input | an `Input<T>` factory parameter |
| Output | an `Output<H>` parameter, called directly |
| Component call | `UserCard({ user: u, onRemove: fn })` |
| Missing required input | **compile error** |

Because it's a function call, there is no template-binding layer between caller
and component: a wrong input name or type is a plain TypeScript error.

## Styling the component

Styles go in the meta, and `:scope` is the component's own root:

```typescript
craftComponent(
  'Tasks',
  {
    styles: `
      :scope { display: grid; gap: .5rem }
      .done { text-decoration: line-through }
    `,
  },
  /* … */
);
```

`:scope` refers to **the root of this component**. Component styles are scoped
with CSS `@scope`, so the rule cannot leak into unrelated components — and Craft
adds no host element or wrapper around your markup to achieve it. See
[Encapsulated styles](/guide/components/styles).

## Mounting the root

The app's root is a Craft component too. `provideCraftRootComponent(App)`
designates it, and the Craft host bootstraps the application:

```typescript
// app.config.ts
export const appConfig = craftAppConfig({
  providers: [provideCraftRootComponent(App)],
});
```

```typescript
// main.ts
import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';

bootstrapCraft({ config: appConfig });
```

`bootstrapCraft` builds the root injector, runs the app-start hooks, then
mounts the root component into `<craft-root>`.

## The two rules of a primitive

**1. A primitive is named.** `state('tasks', …)` — the first argument is always
the name. It is not decoration: it tags the primitive's injector (`state:tasks`)
and is what identifies this piece of state in logs, snapshots and observability.

**2. It resolves to the state reference itself**:

```typescript
const tasks = yield * state('tasks', []);
```

`tasks` is a yieldable reader: `yield* tasks()` in a generator, `craftUse(tasks())`
at a synchronous boundary, or pass `tasks` directly to a template binding.

## What is `yield*` doing there?

The factory is a generator, and `yield*` is how **this** factory drives
everything it does not own — primitives and services alike. The same rule
applies later to every computed and method: each entity yields its own
dependencies so they show up on **its** graph.

For now, treat it as "the way to use a primitive inside a factory".
[Step 4](/learn/04-compose) explains what it buys you.

## The template

The template is a plain function returning nodes built with hyperscript helpers
— `div`, `ul`, `li`, `button`, and one `h(tag, …)` escape hatch for anything
without a helper:

```typescript
({ tasks }) => [
  h1('Tasks'),
  ul(
    forNode(tasks, { track: (task) => task.id }, (task) => li(task.title)),
  ),
];
```

Pass the reader (`tasks`) to the binding that consumes it. The renderer drives
the read; wrapping `() => tasks()` is a synchronous call the yield rules reject.
Use `forNode(...)` when the collection controls a node per item. No `*ngFor`, no
change detection to think about.

## Writing to it

Right now the state is read-only from the outside. Give it a writer:

```typescript
const tasks = yield* state('tasks', [] as Task[], ({ set }) => ({ set }));

yield* tasks.set([{ id: '1', title: 'Write step 2', done: false }]);
```

That third argument is an **insertion** — the mechanism you'll use in every step
from here on. Step 2 is entirely about it.

## What you gained

A component and a reactive value, both declared as functions, both named, both
visible to the tooling — with no class, no constructor and no subscription.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← Overview](/learn/)

[2. Derive instead of duplicate →](/learn/02-derive)

</div>
