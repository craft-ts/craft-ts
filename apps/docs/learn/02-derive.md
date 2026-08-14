# 2. Derive instead of duplicate

**Goal:** attach methods and derived values to your state, instead of scattering
them across the component.

## The insertion argument

The last argument of a primitive is an **insertion**: a function that receives
the primitive's internals and returns whatever you want exposed on it.

```typescript
import { craftComputed, state } from '@craft-ng/core';

const tasks = yield* state('tasks', [] as Task[], ({ state, set, update }) => ({
  add: (title: string) =>
    update((current) => [
      ...current,
      { id: crypto.randomUUID(), title, done: false },
    ]),

  toggle: (id: string) =>
    update((current) =>
      current.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    ),

  remove: function* (id: string) {
    const current = yield* state();
    return yield* set(current.filter((task) => task.id !== id));
  },

  remaining: craftComputed(function* () {
    return (yield* state()).filter((task) => !task.done).length;
  }),
}));
```

Everything you return is now on the ref:

```typescript
yield* tasks(); // the array
yield* tasks.add('Learn insertions');
yield* tasks.remaining(); // 1
```

The context gives you `state` (the current value as a yieldable reader), `set`
and `update`. Non-generator insertion methods may return `update(...)` directly
— the wrapper consumes the write. `remaining` is a `craftComputed`: it does not
own `state()`, so it yields it. That is how the computed's own dependency graph
records the read.

## The whole component

```typescript
import {
  button,
  craftComponent,
  each,
  h1,
  input,
  li,
  ul,
} from '@craft-ng/component';

export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* state('tasks', [] as Task[], /* … as above … */);
    return { tasks };
  },
  ({ tasks }) => [
    h1(function* () {
      return `Tasks — ${yield* tasks.remaining()} left`;
    }),

    input({
      type: 'text',
      placeholder: 'New task…',
      *keydown(event) {
        if (event.key !== 'Enter') return;
        const field = event.target as HTMLInputElement;
        yield* tasks.add(field.value);
        field.value = '';
      },
    }),

    ul(
      each(
        tasks,
        { track: (task) => task.id, empty: () => li('Nothing to do 🎉') },
        (task) =>
          li([
            input({
              type: 'checkbox',
              checked: task.done,
              *change() {
                yield* tasks.toggle(task.id);
              },
            }),
            task.title,
            button({
              *click() {
                yield* tasks.remove(task.id);
              },
            }, '×'),
          ]),
      ),
    ),
  ],
);
```

Two template things worth noting. `each(source, options, render)` takes a
`track` — the stable identity the renderer uses to reuse, move and remove
nodes — and an optional `empty` branch. Pass the reader itself (`tasks`) rather
than `() => tasks()`. When a binding must format or call a method, use a
generator and `yield*`.

The logic factory is now three lines. That's the point: **behaviour lives on the
state, not around it.**

## Control flow: the Angular equivalents

Craft templates are TypeScript, so control flow is made of functions rather than
syntax. Each Angular block has a counterpart:

| Angular    | Craft                                              |
| ---------- | -------------------------------------------------- |
| `@for`     | `each(source, { track, empty }, render)`            |
| `@empty`   | the `empty` option of `each`                        |
| `@if`      | `ifBlock(condition, whenTrue, whenFalse?)`          |
| `@switch`  | `matchBlock.exhaustive(source, key, handlers)`      |
| `@defer`   | `defer(loader, options)`                            |

`matchBlock.exhaustive` is the closest thing to `@switch`, and it is stricter:
it matches on a **discriminant key** of a union and the handler map must cover
every member — a missing case is a compile error, which `@switch` cannot give
you.

```typescript
matchBlock.exhaustive(() => tasksQuery.exceptions().loader, 'code', {
  TASK_NOT_FOUND: () => p('This task no longer exists.'),
  TASK_FORBIDDEN: () => p('You do not have access to it.'),
});
```

### Why not a plain ternary or `switch`?

Because a raw TypeScript conditional **collapses**. The template type ends up
holding the *result* of the branch, not the fact that a branch existed:

```typescript
// works at runtime, but the contract is now opaque
tasks.isEmpty() ? p('Nothing to do') : ul(/* … */);
```

`ifBlock` and `matchBlock` keep the condition **and both branches** in the node
contract. That is what lets you assert, at compile time, that an element renders
*only* when a condition holds, or that a label renders for every item of a
non-empty list — see [Type-level tests](/guide/testing/type-level). With a
ternary those assertions have nothing to inspect.

The renderer also uses the block structure to update surgically instead of
rebuilding the subtree.

::: tip When a ternary is fine
For a leaf value — a class name, a piece of text, an attribute — a ternary is
the right tool. The rule concerns **structure**: whenever a branch decides
whether an element exists, reach for `ifBlock` or `matchBlock`.
:::

`ifBlock` takes a **named** reactive value as its condition (a primitive ref, or
a value marked with `markYieldableValue`), because that name is what the
visibility contract records.

## Reusing behaviour across components

An insertion factors logic out of a **primitive**. Its counterpart for
**components** is a directive: `craftDirective` decorates both a component's
logic factory and its template, and you attach it with `.pipe(...)`:

```typescript
export const Card = craftComponent(
  'Card',
  {},
  (user: Input<User>) => ({ user: deepYieldable(user) }),
  ({ user }) => div(user.name),
).pipe(InteractivePermissions);
```

The directive can add to the context the template receives — here a
`permissions` object the component never had to declare — and directives compose
left to right. That is how a tooltip, focus management or interaction analytics
get added to several components without any of them knowing about it.

The full pattern — writing a directive, what it can require from its host, and
how styles compose — is on
[Directives and `.pipe(...)`](/guide/components/directives). See also
[Customization](/guide/components/customization) for the three layers of
component customization, and [Encapsulated styles](/guide/components/styles).

## Every exception a component picks up must be handled

If a component's factory — or one of its providers — can raise a
`craftException`, that code becomes part of the component's contract. It has to
be dealt with, and the compiler is the one that says so:

```typescript
export const Restricted = MyComponent.pipe(
  catchBlock.exhaustive({
    NO_ACCESS: () => p('You do not have access to this data.'),
  }),
);
```

`catchBlock.exhaustive` is the one you want most of the time: it renders a
**fallback**. When the failure happens in the factory or a provider — before the
template exists — the fallback simply renders alone.

Handle it here and the code disappears from the contract. Leave it and it flows
up to the route, where `handleExceptions` **must** cover it — a reachable code
with no handler doesn't compile, and neither does a handler for a code nothing
can produce.

::: warning Where the error actually lands today
The compile-time enforcement is at the **route**
(`assertExhaustiveRouteExceptions`). The component `.pipe(...)` overload is
currently kept permissive to avoid excessive TypeScript instantiation depth, so
an unhandled code there is caught by runtime dispatch instead. Practical
consequence: a component rendered outside any route gets no compile-time
reminder — handle its codes explicitly.

The whole rule is on [An unhandled exception doesn't just
disappear](/guide/concepts/exceptions).
:::

`matchBlock.exhaustive` is the sibling for rendering from an exception *value*
or signal. Reach for `catchTag.exhaustive` only when the reaction is pure
logic — a toast, a log — and produces no DOM.

## Several insertions at once

One insertion function gets crowded fast. Split it and compose with `insertStatePipe`:

```typescript
import { insertStatePipe, craftComputed, state } from '@craft-ng/core';

const tasks = yield* state(
  'tasks',
  [] as Task[],
  insertStatePipe(
    ({ update }) => ({
      add: (title: string) => update((c) => [...c, newTask(title)]),
    }),
    ({ state }) => ({
      remaining: craftComputed(function* () {
        return (yield* state()).filter((t) => !t.done).length;
      }),
      isEmpty: craftComputed(function* () {
        return (yield* state()).length === 0;
      }),
    }),
  ),
);
```

Each function in the pipe receives the same context and contributes its own
slice. This is what makes behaviour **reusable**: an insertion is just a
function, so it can be extracted, parameterised and shared.

::: tip That's what "insertions" are
The library ships ready-made ones — storage persistence, optimistic updates,
pagination placeholders, forms. They are the exact same shape as the functions
you just wrote. See [Insertions](/guide/concepts/insertions).
:::

## What you gained

State that carries its own behaviour, a template that only renders, and a
composition mechanism that scales past the first three methods.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 1. Your first state](/learn/01-first-state)

[3. Move logic out of the component →](/learn/03-service)

</div>
