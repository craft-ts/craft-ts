# Pure `craftComputed` derivations

`assertCraftComputedPure` requires a `craftComputed` to read dependencies and
return a value. It may not call a method or write to a source:

```typescript
it('keeps derivations free of side effects', () => {
  assertCraftComputedPure(graph.graph);
});
```

## The safe shape

```typescript
const remaining = craftComputed('remaining', function* () {
  return (yield* tasks()).filter((task) => !task.done).length;
});
```

## What it prevents

This looks convenient but makes a derivation an imperative workflow:

```typescript
const count = craftComputed('count', function* () {
  yield* audit.log('count recomputed');
  yield* tasks.set(normalizeTasks(yield* tasks()));
  return (yield* tasks()).length;
});
```

Now reading `count` can write state, invoke a method, or trigger another
computation. Re-computation order becomes observable, and a harmless template
read can cause a loop.

## The `set` can be hidden in a local function

Moving the write into a helper does not make it a derivation. This is still
invalid:

```typescript
const tasks = yield* state(
  'tasks',
  initialTasks,
  ({ set }) => ({ set }),
);

const remaining = craftComputed('remaining', function* () {
  // The write is not on the next line, but the helper belongs to this computed.
  const normalizeAndStore = function* (value: Task[]) {
    yield* tasks.set(normalizeTasks(value));
  };

  const current = yield* tasks();
  yield* normalizeAndStore(current);
  return current.filter((task) => !task.done).length;
});
```

The graph still records the relationship:

```text
craftComputed:remaining ──writes──▶ state:tasks
```

So `assertCraftComputedPure` rejects it even though the computed body only calls
`normalizeAndStore` at the apparent call site. The failure points back to the
computed and the write target, rather than relying on a reviewer to notice a
`set` several lines down.

The same applies to an indirect method call:

```typescript
const refresh = craftMethod('refresh', function* () {
  yield* tasks.set(initialTasks);
});

const count = craftComputed('count', function* () {
  const runRefresh = () => refresh();
  yield* runRefresh();
  return (yield* tasks()).length;
});
```

The rule sees the `calls` edge from `count` to `refresh`. This is why the check
belongs on the graph in addition to a local ESLint rule: it protects the
invariant even when the side effect is hidden behind a binding.

The fix is to keep the computed read-only and move the write to an explicit
method or event:

```typescript
const normalize = craftMethod('normalize', function* () {
  yield* tasks.set(normalizeTasks(yield* tasks()));
});

const remaining = craftComputed('remaining', function* () {
  return (yield* tasks()).filter((task) => !task.done).length;
});
```

## Where the side effect belongs

- derive a value with `craftComputed`;
- react to an event with `on$`;
- update a primitive from a user action with a method;
- run external work with `craftEffect` or an explicit resource primitive.

Separating these roles makes the dependency graph explainable and tests
deterministic.

## See also

- [The mental model](/guide/concepts/mental-model)
- [`craftComputed`](/guide/reactivity/craft-computed)
