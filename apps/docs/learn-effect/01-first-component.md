# 1. Start with a Craft component

**Goal:** render a reactive task list before introducing Effect.

Effect users do not need to replace their domain model or Effect programs. They
do need to adopt Craft's UI model: a component is a function with a generator
logic factory and a typed template:

```typescript
import { craftComponent, div, h1, li, ul, forNode } from '@craft-ts/component';
import { state } from '@craft-ts/core';

type Task = { readonly id: string; readonly title: string; readonly done: boolean };

export const Tasks = craftComponent(
  'Tasks', // name: stable component name used by tooling and the graph
  {}, // meta: providers, styles and host configuration
  function* () { // logic factory: creates the component context
    const tasks = yield* state('tasks', [ // name: state identifier
      { id: '1', title: 'Learn Craft components', done: true },
      { id: '2', title: 'Add the first Effect program', done: false },
    ] satisfies Task[]); // initial value: the seeded task list

    return { tasks };
  },
  ({ tasks }) => [ // template: turns the context into rendered nodes
    h1('Tasks'),
    ul(
      forNode(
        tasks, // source: the reactive collection to render
        { track: (task) => task.id }, // options: stable identity for each item
        (task) => li(task.title), // render: creates one node per task
      ),
    ),
  ],
);
```

There is no class, decorator, selector or separate HTML file. The template is
typed hyperscript. A component has four responsibilities:

| Argument | Responsibility |
| --- | --- |
| `'Tasks'` | stable name used by tooling and the graph |
| `{}` | providers, styles and host configuration |
| `function*` | create the component context and yield dependencies |
| template | turn that context into nodes |

`tasks` is a Craft reader. Yield it when a generator reads it; pass it directly
to a template binding. The renderer tracks the exact binding that reads it.

## Bootstrap once

The root component is provided in the app config and mounted by
`bootstrapCraft`:

```typescript
// app.config.ts
import { provideCraftRootComponent } from '@craft-ts/component';
import { craftAppConfig } from '@craft-ts/core';
import { App } from './app';

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

## Where Effect fits

Craft owns reactive UI state and rendering. Effect owns domain operations — work
that may fail with typed errors or depend on services. In the next step, we will
connect an Effect program to Craft so the component can render its result
without managing subscriptions or fibers.

## What you gained

A selectorless, typed component with fine-grained rendering. The next step adds
derived UI state without duplicating data.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← Overview](/learn-effect/)

[2. Derive UI state →](/learn-effect/02-derive)

</div>
