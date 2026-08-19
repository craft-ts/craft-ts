# Components

A Craft component is a **function**, not a class. No decorator, no separate
template file, no host element wrapped around your markup.

**Use it for** application components. [`loadCraftComponent`](/guide/routing/setup)
mounts a Craft component on a route.

## Install

The component renderer is published as a separate package and is currently on
the `beta` channel:

```shell
npm i @craft-ts/core@beta @craft-ts/component@beta
```

See [`@craft-ts/component` on npm](https://www.npmjs.com/package/@craft-ts/component).

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

<<< @/tests/snippets/guide/components/index/tasks.spec.ts#tasks


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

<<< @/tests/snippets/guide/components/index/usercard.spec.ts#usercard


An `Input<T>` **is a yieldable reader** — `yield* user()` reads the current
value. An `Output<H>` is a yieldable callback; delegate to it with `yield*`.

Rendering a child is a function call, so there is no binding layer to get wrong:

```typescript
UserCard({ user: currentUser, onRemove: removeUser });
```

| Contract | Craft |
| --- | --- |
| Input | an `Input<T>` factory parameter |
| Output | an `Output<H>` parameter, called directly |
| Component call | `UserCard({ user: u, onRemove: fn })` |
| Missing required input | **compile error** |

## The template

Nodes are built with hyperscript helpers — `div`, `ul`, `button`, and `h(tag, …)`
for anything without one. Pass a yieldable reader to a binding. Use a generator
when the binding must format or call a method:

```typescript
({ tasks }) => [
  h1(function* () {
    return `Tasks — ${yield* tasks.remaining()} left`;
  }),
  h1(`Tasks — static`); // static text needs no reader
];
```

The same binding boundary applies to attributes, DOM properties, classes,
styles, and host props. Prefer exposing a derived reader on the primitive
(`tasks.isEmpty`) and passing it (`disabled: tasks.isEmpty`) over wrapping a
synchronous call.

See [Fine-grained reactivity](/guide/components/fine-grained-reactivity) for
the complete rendering model, structural scopes, observability expectations,
and migration checklist.

See [Progressive `each` rendering](/guide/components/schedule-each) when a
large collection needs frame-based scheduling.

Keep render callbacks pure. They may read signals and calculate values, but
must not call `set`, `update`, or `mutate`. Perform writes from DOM events,
outputs, mutations, or explicit business effects. Enable
`craft-ts/no-render-writes` to diagnose common violations.

Control flow is made of functions rather than syntax — `each`, `ifBlock`,
`matchBlock`, `defer`. The relationship between these blocks, and why a raw
ternary is the wrong tool for **structure**, is in
[Learn step 2](/learn/02-derive#control-flow).

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
import { bootstrapCraft } from '@craft-ts/component';
import { appConfig } from './app.config';

bootstrapCraft({ config: appConfig });
```

`bootstrapCraft` builds the root injector, runs the app-start hooks, then
mounts the root component into `<craft-root>` (or the element you pass as
`host`).

## Pitfalls

**Reading a reader outside a binding.** `h1(tasks().length)` evaluates once at
build time. Pass the reader (`p(tasks.remaining)`) or use a generator:
`h1(function* () { return yield* tasks.remaining(); })`.

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
- [Accessibility](/guide/components/accessibility)
- [Testing components](/guide/testing/components)
