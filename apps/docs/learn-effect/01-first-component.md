# 1. Start with a Craft component

**Goal:** render a reactive task list before introducing Effect.

Effect users do not need to replace their UI model. A Craft component is a
function with a generator logic factory and a typed template:

```typescript
import { craftComponent, div, h1, li, ul, each } from '@craft-ts/component';
import { state } from '@craft-ts/core';

type Task = { readonly id: string; readonly title: string; readonly done: boolean };

export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* state('tasks', [
      { id: '1', title: 'Learn Craft components', done: true },
      { id: '2', title: 'Add the first Effect program', done: false },
    ] satisfies Task[]);

    return { tasks };
  },
  ({ tasks }) => [
    h1('Tasks'),
    ul(
      each(tasks, { track: (task) => task.id }, (task) =>
        li(task.title),
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

## When Effect enters

Keep short-lived UI state in Craft. When a value is a domain computation with
typed failures or services, return an Effect from a domain module and connect it
in the next step. This separation keeps templates synchronous and makes the
boundary explicit.

## What you gained

A selectorless, typed component with fine-grained rendering. The next step adds
derived UI state without duplicating data.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← Overview](/learn-effect/)

[2. Derive UI state →](/learn-effect/02-derive)

</div>
