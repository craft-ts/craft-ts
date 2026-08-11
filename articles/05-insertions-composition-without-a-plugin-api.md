---
title: 'Reusing behaviour between stores, without inheritance and without a plugin API'
published: false
description: 'Persistence, collections, optimistic updates, sub-state logic — all attached to a primitive the same way. The library’s own building blocks use the exact mechanism you do, and that constraint is the design.'
tags: angular, typescript, webdev, architecture
series: 'Building craft-ng'
canonical_url: ''
cover_image: ''
---

You write a store. It works. You add persistence to `localStorage` — twenty lines, fine.

Then a second store needs the same thing.

That moment, repeated across a codebase, is where state management architectures are actually decided. And the usual answers are all a little disappointing:

- **Copy-paste.** Honest, fast, and now the bug you find in six months exists in nine places with three different spellings.
- **A base class.** Works until two behaviours want the same slot, or until a store needs one and a half of them. Inheritance forces a total order on things that have no natural order.
- **A plugin API.** The library author decided in advance what an extension point is. If your need falls between two of them, you are writing a fork or a wrapper — and the library's own features are usually implemented with privileged access you do not get.

craft-ng's answer is a single idea, and its whole value is in a constraint the library imposes on itself.

## An insertion is a function that returns what to expose

An insertion receives a primitive's internals and returns the members to attach to it:

```typescript
const counter = yield* state(
  'counter',
  0,
  ({ state, update, set }) => ({
    increment: () => update((value) => value + 1),
    reset: () => set(0),
    isOdd: computed(() => state() % 2 === 1),
  }),
);

counter.increment();
counter.isOdd(); // true
```

That is the entire mechanism. You have already seen it in every previous article without me naming it — the third argument of `state`, the `insertReactOnMutation` wired to a query, the storage persister. All the same shape.

And here is the constraint that makes it interesting:

> **There is nothing special about a library insertion.**

`insertStoragePersister`, `insertEntities`, `insertReactOnMutation`, `insertPaginationPlaceholderData` — none of them have access to anything your own function does not. They are not plugins registered against an extension point. They are functions of the same shape, shipped in the package.

Which means the answer to "how do I share this behaviour" is not a new concept to learn. It is: **extract the function.**

```typescript
import { InsertionStateFactoryContext, state } from '@craft-ng/core';

export const withUndo = <State>({
  state: read,
  set,
}: InsertionStateFactoryContext<State, {}>) => {
  let previous: State | undefined;
  return {
    save: () => void (previous = read()),
    undo: () => (previous === undefined ? undefined : set(previous)),
  };
};

const counter = yield* state('counter', 0, (context) => withUndo(context));
```

The moment two primitives want the same behaviour, you have a library insertion. That is the whole extension story, and there is no second one.

Two details in that snippet are worth more than they look, and I only found them by trying to write this section.

**The insertion is generic, and it is called through a lambda.** Handing `withUndo` directly to `state` asks TypeScript to infer `State` from the position of the argument rather than from a value, which is exactly where inference gives up. Wrapping it in `(context) => withUndo(context)` lets the state type flow in first, and the generic resolves. It costs seven characters and it is the difference between working and a wall of inference errors.

**The context has a public type per primitive.** `InsertionStateFactoryContext<State, PreviousOutputs>` for `state`, `InsertionResourceFactoryContext<…>` for `query` / `mutation` / `asyncProcess`, `InsertionQueryParamsFactoryContext<…>` for `queryParams`. The second parameter is what the members before you produced — `{}` when your insertion does not read them. If you would rather type the whole function than its argument, the matching `Insertions*Factory` aliases do that instead.

Full disclosure on that last point: those types were not exported when I started writing this article. Trying to write this section is what surfaced it — the extension story was "just extract the function", and the type you need to extract it was internal. It ships in the next beta.

## Composing them

A primitive takes one insertion. For several, each primitive has its typed pipe:

| Primitive | Typed pipe |
|---|---|
| `state` | `insertStatePipe` |
| `query` | `insertQueryPipe` |
| `mutation` | `insertMutationPipe` |
| `queryParams` | `insertQueryParamsPipe` |
| `asyncProcess` | `insertAsyncProcessPipe` |

```typescript
const counter = yield* state(
  'counter',
  0,
  insertStatePipe(
    ({ update }) => ({
      increment: () => update((value) => value + 1),
    }),
    ({ state, insertions }) => ({
      isOdd: computed(() => state() % 2 === 1),
      incrementAndReport: () => {
        insertions.increment(); // the previous member's output
        return state();
      },
    }),
  ),
);
```

The `insertions` argument is what makes this composition rather than concatenation: each member sees what the members before it produced, so a later behaviour can build on an earlier one instead of duplicating it.

The guarantees are worth stating precisely, because "it composes" usually hides the interesting details:

- members run **left to right**;
- each member reads the previous outputs through `insertions`;
- the resulting members are the **intersection** of all of them — on a key conflict, the rightmost wins at runtime;
- tracked dependencies are the **union**, so a member that yields a service folds that dependency into the enclosing graph;
- each member is **wrapped individually**, so observability and correlation tracking see them separately rather than as one opaque blob.

That fourth point is the one that ties this article to the second one. An insertion can be a `function*` and yield services. Persistence that needs a logger, a reaction that needs the current user — the dependency does not disappear into the insertion, it surfaces in the graph of whatever primitive used it.

## Attaching behaviour to a branch, not the root

Most state is a tree, and most methods concern one branch of it. Written normally, they all pile up at the top:

```typescript
// everything lives at the root, and every method re-navigates the tree
update((board) => ({ ...board, cell: { ...board.cell, color: 'black' } }));
```

`insertSelect` targets a nested part and attaches insertions **to that part**:

```typescript
const board = yield* state(
  'board',
  { cell: { color: 'white', paintCount: 0 } },
  insertSelect('cell', ({ update, state }) => ({
    paint: () =>
      update((cell) => ({
        ...cell,
        color: 'black',
        paintCount: cell.paintCount + 1,
      })),
    paintCountStr: () => `Painted ${state().paintCount} times`,
  })),
);

board.selectCell().paint();
```

Inside the insertion, `update` and `state` are the *cell's*. The method reads as if the cell were the whole world, which is the point: the logic lives next to the data it operates on. The same API covers arrays — `selectCell(0)?.paint()` — so you do not switch helpers based on the shape of the parent.

And because pipes nest, a selected branch can carry its own pipeline: persistence on the root, methods on a sub-branch, entity helpers on an array three levels down.

## Collections, generated

`insertEntities` is the same mechanism applied to lists. Point it at an array — including one nested in an object — and it generates typed `addOne` / `removeMany` / `updateOne` / `upsertMany` methods against it, with a custom id selector when yours is not `id`.

I want to flag something about this one, because it is the most-used insertion and it carries a warning in its own documentation: **it currently promotes imperative state changes.** You call `addOne`, the state mutates, and that is a different flavour from the declarative style the rest of the library pushes. It is on my list to improve. I would rather you adopt it knowing that than discover the inconsistency yourself and conclude the design is confused.

## What it looks like in one piece

Persistence, pagination placeholders, and an optimistic reaction to a delete, on one query:

```typescript
const users = yield* query(
  'users',
  {
    params: pagination,
    identifier: (params) => `${params.page}-${params.pageSize}`,
    loader: function* ({ params }) {
      return yield* ApiService.getDataList(params);
    },
  },
  insertQueryPipe(
    insertStoragePersister({ storeName: 'app', key: 'users' }),
    insertPaginationPlaceholderData({ initialValue: [] as User[] }),
    insertReactOnMutation(deleteUser, {
      filter: ({ mutationIdentifier, queryResource }) =>
        !!queryResource.value()?.some((u) => u.id === mutationIdentifier),
      optimisticUpdate: ({ queryResource, mutationIdentifier }) =>
        removeOne({ entities: queryResource.value(), id: mutationIdentifier }),
    }),
  ),
);
```

Four capabilities, one list, no base class and no plugin registry. Remove a line and that capability is gone; the others do not notice.

## What this costs

**Key conflicts are resolved at runtime, by position.** Two members exposing the same name means the rightmost wins — silently. The types are an intersection, so nothing warns you. This is the sharpest edge in the mechanism, and it hurts most in the case you would most want protection: pulling in a shared insertion from elsewhere in the codebase that happens to use a name you also use.

**The pipe shows up on day one.** One insertion per primitive means your second behaviour already needs `insertQueryPipe`. Small ceremony, met early.

**Methods appear from nowhere.** `board.selectCell().paint()` is not defined anywhere you can jump to by name — it comes from a generated shape. Inference gives you autocomplete and type checking, but "where is this method defined" has a less satisfying answer than a class method, and that is a real navigation cost on a large codebase.

**Every member is another node for the compiler.** Same trade-off named in article two, and pipes are where it concentrates: a five-member pipe on a deeply nested `insertSelect` is exactly the shape that makes type-checking slow. This is the area I am actively working on.

## The question

The design bet is that **one uniform mechanism beats a set of well-chosen extension points**. The library gets no privileges, so anything it can do, you can do — and the cost is that nothing steers you toward the right way to do it.

**Which do you actually want from a state library?** A small number of curated extension points, where the library's opinions do the thinking — or a single primitive mechanism that makes you responsible for your own conventions? I have met good engineers who firmly want the first, and their argument is not one I can dismiss: an open mechanism means every team invents its own vocabulary, and reading someone else's code becomes archaeology.

Next in this series: **testing** — what it looks like when a test describes the real dependency graph instead of mocking whatever the constructor happened to ask for.
