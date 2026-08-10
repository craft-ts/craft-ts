# Components

A Craft component is a **function**, not a class. No decorator, no separate
template file, no host element wrapped around your markup.

**Use it for** anything you would have written as an Angular component.
**Keep Angular components** where you have them — the two coexist, and
[`loadCraftComponent`](/guide/routing/setup) mounts a Craft one on a route.

## Install

The component renderer is published as a separate package and is currently on
the `beta` channel:

```shell
npm i @craft-ng/core@beta @craft-ng/component@beta
```

See [`@craft-ng/component` on npm](https://www.npmjs.com/package/@craft-ng/component).

## The shape

```typescript
craftComponent(name, meta, factory, template);
```

| Argument   | What it is                                                        |
| ---------- | ----------------------------------------------------------------- |
| `name`     | the component's name — used for host tags, snapshots, diagnostics |
| `meta`     | `providers`, `styles`, `host`, `contentStyles`                    |
| `factory`  | the **logic**: builds and returns the context                     |
| `template` | receives that context, returns nodes                              |

```typescript
import { craftComponent, div, h1, li, ul } from '@craft-ng/component';
import { state } from '@craft-ng/core';

export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* state('tasks', [] as Task[]);
    return { tasks };
  },
  ({ tasks }) => [h1('Tasks'), ul(tasks().map((task) => li(task.title)))],
);
```

The split matters: the factory produces a context **without touching the DOM**,
and the template renders a context **without running the factory**. That is what
makes the two [testable independently](/guide/testing/components).

## The logic factory

A `function*` when it needs dependencies — every `yield*` is tracked and folds
into the component's dependency type:

```typescript
function* () {
  const tasks = yield* TaskList();
  return { tasks };
}
```

A plain arrow when it needs none:

```typescript
() => ({});
```

Whatever it returns is the context the template receives. Nothing else is
exposed.

## Inputs and outputs

They are **parameters of the factory**, typed with `Input<T>` and
`Output<Handler>`:

```typescript
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

An `Input<T>` **is callable** — `user()` reads the current value. An `Output<H>`
is the handler itself; calling it is emitting.

Rendering a child is a function call, so there is no binding layer to get wrong:

```typescript
UserCard({ user: () => currentUser, onRemove: removeUser });
```

| Angular                                     | Craft                                       |
| ------------------------------------------- | ------------------------------------------- |
| `@Input()` / `input()` / `input.required()` | an `Input<T>` factory parameter             |
| `@Output()` / `output()` + `.emit(...)`     | an `Output<H>` parameter, called directly   |
| `[user]="u"` / `(remove)="fn($event)"`      | `UserCard({ user: () => u, onRemove: fn })` |
| Missing required input → runtime            | missing parameter → **compile error**       |

## The template

Nodes are built with hyperscript helpers — `div`, `ul`, `button`, and `h(tag, …)`
for anything without one. Passing a **callback** is what makes a node reactive:

```typescript
({ tasks }) => [
  h1(() => `Tasks — ${tasks.remaining()} left`), // patches only this text node
  h1(`Tasks — ${tasks.remaining()} left`), // structural template dependency
];
```

The same binding boundary applies to attributes, DOM properties, classes,
styles, and host props:

```typescript
button({ disabled: () => tasks.remaining() === 0 }, 'Clear');
div({ class: () => ({ empty: tasks.remaining() === 0 }) });
div({ style: () => ({ opacity: tasks.remaining() ? 1 : 0.5 }) });
```

Each callback has its own effect. A signal change only evaluates the bindings
that read it; sibling bindings and the component template are left alone. A
value calculated before creating the node cannot be assigned to that precise
binding, so Craft keeps the compatible structural rerender behaviour for that
form.

See [Fine-grained reactivity](/guide/components/fine-grained-reactivity) for
the complete rendering model, structural scopes, observability expectations,
and migration checklist.

Keep render callbacks pure. They may read signals and calculate values, but
must not call `set`, `update`, or `mutate`. Perform writes from DOM events,
outputs, mutations, or explicit business effects. Enable
`craft-ng/no-render-writes` to diagnose common violations.

Control flow is made of functions rather than syntax — `each`, `ifBlock`,
`matchBlock`, `defer`. The correspondence with Angular's blocks, and why a raw
ternary is the wrong tool for **structure**, is in
[Learn step 2](/learn/02-derive#control-flow-the-angular-equivalents).

## The meta

```typescript
craftComponent(
  'Card',
  {
    providers: [provideCardStore()],
    styles: ':scope { padding: 1rem } .title { font-weight: 700 }',
    host: { class: 'card-host' },
  },
  /* … */
);
```

- **`providers`** — the component's own DI scope, evaluated before the template.
- **`styles`** — scoped with CSS `@scope`; `:scope` is this component's root. See
  [Encapsulated styles](/guide/components/styles).
- **`host`** — default properties for the root element.
- **`contentStyles`** — styles offered to projected content, per slot. See
  [Content projection](/guide/components/content-projection).

## Composing behaviour

`.pipe(...)` attaches directives, which decorate **both** the logic factory and
the template, left to right:

```typescript
const EditablePanel = Panel.pipe(WithPermission);
```

The same mechanism carries `withProviders(...)` and the exception handlers below.
See [Directives and `.pipe(...)`](/guide/components/directives).

## Mounting the root

The app root is a Craft component too:

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

bootstrapApplication(CraftRootComponentHost, toApplicationConfig(appConfig));
```

`toApplicationConfig` produces the `ApplicationConfig` Angular expects, so the
rest of your bootstrap is unchanged.

## Pitfalls

**Reading a signal outside a callback.** `h1(tasks().length)` evaluates once at
build time. Wrap it: `h1(() => tasks().length)`.

**Forgetting `track` in `each`.** Without a stable identity the renderer cannot
reuse, move or remove the right node.

**Exceptions from the factory or providers don't vanish.** They become the
component's initialization exceptions and flow up to the route unless handled
with `.pipe(catchBlock.exhaustive(...))` — see
[Exceptions as values](/guide/concepts/exceptions).

**Naming mismatch.** The first argument must match the exported binding; the
`craft-component-name-match` rule enforces it.

## See Also

- [Learn: your first state](/learn/01-first-state) — the guided version
- [Directives and `.pipe(...)`](/guide/components/directives)
- [Testing components](/guide/testing/components)
