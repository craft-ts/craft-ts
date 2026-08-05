# 10. Test what you wrote

**Goal:** test `TaskList` and the `Tasks` component without guessing what to
mock — the dependency graph tells you.

## The idea

Most test setups let you forget a dependency and find out at runtime. Craft
inverts it: you pass a **register** covering the whole graph, and the compiler
refuses to run the test until every node is accounted for.

Each node is one of four things: `'real'`, its own `provideX(...)`, a mock
object, or `'notReached'`.

## Testing a service

Here is the service under test — the one from [step 4](/learn/04-compose), with
its scope changed to `toProvide` so it has a `provideTaskStats()` to mount in
the test:

```typescript
export const { TaskStats, provideTaskStats } = craftService(
  { name: 'TaskStats', scope: 'toProvide' },
  function* () {
    const tasks = yield* TaskList();

    return {
      done: computed(() => tasks().filter((task) => task.done).length),
    };
  },
);
```

It depends on one thing, `TaskList`, and exposes one thing, `done`. The test
mirrors that exactly:

```typescript
import { setupCraftServiceTestingByRegister } from '@craft-ng/core';
import { vi } from 'vitest';

const { sut, mocks } = await setupCraftServiceTestingByRegister(TaskStats, {
  // the SUT itself, mounted through its own provider
  TaskStats: provideTaskStats(),

  // its only dependency, replaced by a mock
  TaskList: {
    $self: vi.fn(() => [
      { id: '1', title: 'a', done: true },
      { id: '2', title: 'b', done: false },
    ]),
  },
});

expect(sut.done()).toBe(1);
expect(mocks.TaskList.$self).toHaveBeenCalled();
```

`sut` is the service under test; `mocks` gives you back the mocks you supplied,
already typed, so `mocks.TaskList.$self` is assertable.

::: tip Which register entry to use
`provideX()` for a `toProvide` or `manuallyProvidedAtRoot` service, `'real'` for
a reachable `global` or `function` one, a plain object to mock it, and
`'notReached'` for a branch this test never touches.
:::

`$self` is the service's own returned value — the ref itself, as opposed to a
property hanging off it.

## Why the register is small

Because of step 4. `TaskStats` yielded only what it needed, so the register only
asks for that. Had it yielded the whole `TaskApi`, the register would demand
`TaskApi` too. **Precise yields make short tests** — that's the payoff for the
`yield*` discipline.

## Testing a component

Here is the component under test, from steps 2 and 3 — a factory that yields
`TaskList`, and a template that renders it:

```typescript
export const Tasks = craftComponent(
  'Tasks',
  {},
  function* () {
    const tasks = yield* TaskList();
    return { tasks };
  },
  ({ tasks }) => [
    h1(() => `Tasks — ${tasks.remaining()} left`),
    ul(
      each(
        () => tasks(),
        { track: (task) => task.id },
        (task) => li(task.title),
      ),
    ),
  ],
);
```

Those two halves are tested **independently**: the factory produces a context
without touching the DOM, and the template renders a context without running the
factory.

The logic test runs the factory only — no DOM:

```typescript
import { setupCraftComponentLogicTest } from '@craft-ng/component/testing';

const { context, mocks, destroy } =
  await setupCraftComponentLogicTest.byRegister(Tasks, {
    register: {
      TaskList: {
        $self: () => [{ id: '1', title: 'a', done: false }],
        remaining: () => 1,
      },
    },
  });

expect(context.tasks.remaining()).toBe(1);
destroy();
```

The template test does the opposite — it renders with a context you hand it, and
never runs the factory:

```typescript
import { setupCraftComponentTemplateTest } from '@craft-ng/component/testing';

const test = await setupCraftComponentTemplateTest.byRegister(Tasks, {
  context: {
    tasks: Object.assign(() => [{ id: '1', title: 'Write tests', done: false }], {
      remaining: () => 1,
      add: () => {},
      toggle: () => {},
      remove: () => {},
    }),
  },
  register: {},
});

expect(test.nativeElement.textContent).toContain('Write tests');
test.destroy();
```

That separation is why component tests stay fast: you only pay for the DOM when
the DOM is what you're asserting on.

## Finding elements

Template tests expose `locator(tag, criteria)` rather than raw CSS selectors:

```typescript
const removeButton = test.locator('button', { 'data-testid': 'remove' });
removeButton?.click();
```

## Proving it at the type level

Some of what craft guarantees isn't observable at runtime at all — it's in the
types. Those get their own kind of test, resolved by the compiler with no
`TestBed`, no DOM and no factory:

```typescript
type TasksTemplateTest = SetupTestComponentTemplate<typeof Tasks, [typeof TaskRow]>;
```

The resolver walks elements, directives, `each`, `defer` and child components,
and a child missing from the tuple becomes a type diagnostic. Companion
assertions — `TemplateHasElement`, `TemplateHasElementWithProps`,
`TemplateHasYieldableEvent`, `TemplateRendersStateWhen` — check that the template
really renders what you think, including event argument types.

This is how you pin down a template contract that a runtime test would only
catch by accident. Full reference:
[Type-level tests](/guide/testing/type-level).

## Tests that stay close to reality

Mocking everything makes tests that pass while the app is broken. `boundaryOnly`
keeps the real graph and lets you replace only what actually touches the outside
world — the services marked `browserBoundary: true` (HTTP, storage, location):

```typescript
const { sut } = await setupCraftServiceTestingByRegister(TaskList, register, {
  boundaryOnly: true,
});
```

Everything in between runs for real. See
[Browser boundaries](/guide/testing/browser-boundaries).

## What you gained

Tests whose setup is derived from the real dependency graph, so "I forgot to
mock that" becomes a compile error.

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 9. Wire up routing](/learn/09-routing)

[Where to go next →](/learn/next)

</div>
