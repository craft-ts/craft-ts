# 1. Your first state

**Goal:** get a reactive value on screen, and meet the two building blocks you
will use in every step — `craftComponent` and a primitive.

## Install

```shell
npm i @craft-ng/core@beta @craft-ng/component@beta
npm i -D @craft-ng/dev-tools@beta
```

The packages are currently published on the `beta` channel. The component
package contains the functional renderer, while `core` contains the reactive
primitives used by the component factory.

## A component with state

A Craft component is a **function**, not a class. It takes a name, meta, a logic
factory, and a template:

```typescript
import { craftComponent, div, h1, li, ul } from '@craft-ng/component';
import { state } from '@craft-ng/core';

type Task = { id: string; title: string; done: boolean };

export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* state('tasks', [
      { id: '1', title: 'Read step 1', done: false },
    ] as Task[]);

    return { tasks };
  },
  ({ tasks }) => [h1('Tasks'), ul(tasks().map((task) => li(task.title)))],
);
```

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

```typescript
import {
  Input,
  Output,
  button,
  craftComponent,
  div,
  span,
} from '@craft-ng/component';

const UserCard = craftComponent(
  'UserCard',
  {},
  (user: Input<User>, onRemove: Output<(user: User) => void>) => ({
    user,
    onRemove,
  }),
  ({ user, onRemove }) =>
    div([
      span(user().name),
      button({ click: () => onRemove(user()) }, 'Remove'),
    ]),
);
```

An `Input<T>` **is callable** — `user()` reads the current value — so there is
no `input()` signal to unwrap and no `@Input()` decorator. An `Output<H>` is the
handler itself; calling it is emitting.

At the call site you pass an object, with inputs as getters:

```typescript
UserCard({
  user: () => currentUser,
  onRemove: removeUser,
});
```

| Angular                                     | Craft                                       |
| ------------------------------------------- | ------------------------------------------- |
| `@Input()` / `input()` / `input.required()` | a `Input<T>` factory parameter              |
| `@Output()` / `output()` + `.emit(...)`     | an `Output<H>` parameter, called directly   |
| `[user]="u"` / `(remove)="fn($event)"`      | `UserCard({ user: () => u, onRemove: fn })` |
| Missing required input → runtime            | missing parameter → **compile error**       |

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
designates it, and Angular bootstraps a thin host:

```typescript
// app.config.ts
export const appConfig = craftAppConfig({
  providers: [provideCraftRootComponent(App)],
});
```

```typescript
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { CraftRootComponentHost } from '@craft-ng/component';
import { toApplicationConfig } from '@craft-ng/core';
import { appConfig } from './app/app.config';

bootstrapApplication(CraftRootComponentHost, toApplicationConfig(appConfig));
```

`toApplicationConfig` turns the craft config into the `ApplicationConfig`
Angular expects, so the rest of your Angular setup is unchanged.

## The two rules of a primitive

**1. A primitive is named.** `state('tasks', …)` — the first argument is always
the name. It is not decoration: it tags the primitive's injector (`state:tasks`)
and is what identifies this piece of state in logs, snapshots and observability.

**2. It resolves to the state reference itself**:

```typescript
const tasks = yield* state('tasks', []);
```

`tasks` is a signal: call it to read, `tasks()`.

## What is `yield*` doing there?

The factory is a generator, and `yield*` is how it drives everything it needs —
primitives and services alike. It also **records the dependency in the type**,
which is what makes the compile-time DI checks possible later.

For now, treat it as "the way to use a primitive inside a factory".
[Step 4](/learn/04-compose) explains what it buys you.

::: tip Coming from Angular classes?
In an Angular `@Component` class there is no generator to yield from, so you
drive a primitive with `craftUse(state('tasks', []))` instead. Same primitive,
same result — see [Anatomy of a primitive](/guide/concepts/primitive-anatomy).
:::

## The template

The template is a plain function returning nodes built with hyperscript helpers
— `div`, `ul`, `li`, `button`, and one `h(tag, …)` escape hatch for anything
without a helper:

```typescript
({ tasks }) => [h1('Tasks'), ul(tasks().map((task) => li(task.title)))];
```

Reading `tasks()` inside the template is what makes that part reactive. No
`*ngFor`, no change detection to think about.

## Writing to it

Right now the state is read-only from the outside. Give it a writer:

```typescript
const { tasks } = yield * state('tasks', [] as Task[], ({ set }) => ({ set }));

tasks.set([{ id: '1', title: 'Write step 2', done: false }]);
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
