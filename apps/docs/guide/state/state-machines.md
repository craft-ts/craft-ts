# State machines

`craftStateMachine` models a finite workflow as a named, typed, reactive
primitive. It is useful when a feature has a small set of meaningful modes —
for example, an editor that is either reading or editing, a form that moves
through validation and submission, or a resource that moves through loading,
success and failure.

The important part is not only that the machine has states. It is that the
states and the transitions are **100% declarative**: the machine describes
which events can enter each state, and Craft derives the current state from
those declarations at runtime.

## A different perspective on transitions

Many state-machine APIs describe a transition from the current state:

```text
while in reading, when edit happens, go to editing
```

That perspective makes the target explicit in the transition itself. You look
at the `reading` state's handlers to discover where an `edit` event goes.

Craft reverses the perspective. Each entry in the transitions record describes
**how to enter that step**. The record key is the target step, and `transit()`
inside that step's block means “attempt to enter this step”. It does not take a
state name because the surrounding key already supplies it.

If you are used to XState or a similar state-machine API, the difference is
the direction in which you read the same workflow graph. You may usually start
from `reading` and ask “where does `edit` go?”. In Craft, you start from
`editing` and ask “which event makes the machine enter `editing`?”. The graph
is still explicit; its declarations are owned by their destination step.

```typescript
function* (context, transit) {
  return {
    reading: transitionStep(function* () {
      yield* initStateMachine(() => transit());
      yield* on$(context.commit$, () => transit());
      yield* on$(context.cancel$, () => transit());
    }),

    editing: transitionStep(function* () {
      yield* on$(context.edit$, () => transit());
    }),
  };
}
```

Reading this declaration tells you immediately:

- `reading` is entered during initialisation, after `commit`, or after
  `cancel`;
- `editing` is entered after `edit`.

There is no `currentStep = ...`, no imperative transition table, and no string
such as `transit('editing')`. The destination is the step whose block declared
the event. If an event attempts to enter the step that is already active, the
attempt is a no-op.

This makes the transition logic especially easy to inspect: to answer “when
can the machine enter `reading`?”, read the `reading` block and look at the
events it listens to. The machine's transition behavior is visible in the
declarations themselves.

The same principle applies to the steps themselves. Each step registered in a
`craftStateMachine` can be 100% declarative: its context can be assembled from
Craft primitives, its event reactions can be expressed with `on$`, and its
view can be selected from the typed step context. A step does not need an
imperative “enter” function that manually changes the machine or coordinates
the rest of the feature.

## The text editor example

The demo application contains a complete [declarative text editor
example](https://github.com/craft-ts/craft-ts/blob/main/apps/demo/src/app/examples/primitives/state-machine/text-editor.ts).
It has two steps:

```text
reading  ← initialisation, commit, cancel
editing  ← edit
```

The machine's context owns the events and the text state. The transitions only
declare which events enter which step:

```typescript
const machine =
  yield *
  craftStateMachine(
    'textEditor',

    function* () {
      const edit$ = yield* source$<void>('text.edit');
      const commit$ = yield* source$<void>('text.commit');
      const cancel$ = yield* source$<void>('text.cancel');

      const text = yield* state(
        'text',
        { committedValue: '', value: '' },
        insertStatePipe(insertDeepYieldable(), ({ patch }) => ({
          change: (value: string) => patch(() => ({ value })),
          commit: on$(commit$, () =>
            patch((current) => ({ committedValue: current.value })),
          ),
          cancel: on$(cancel$, () =>
            patch((current) => ({ value: current.committedValue })),
          ),
        })),
      );

      return { edit$, commit$, cancel$, text };
    },

    function* (context, transit) {
      return {
        reading: transitionStep(function* () {
          yield* initStateMachine(() => transit());
          yield* on$(context.commit$, () => transit());
          yield* on$(context.cancel$, () => transit());
        }),
        editing: transitionStep(function* () {
          yield* on$(context.edit$, () => transit());
        }),
      };
    },

    function* ({ text, cancel$, commit$, edit$ }) {
      return {
        reading: { text, edit$ },
        editing: { text, commit$, cancel$ },
      };
    },
  );
```

The first factory creates the shared context. The second factory declares the
machine's steps and their incoming events. The third factory gives each step a
typed context for its view: the reading view can edit, while the editing view
can commit or cancel.

`insertDeepYieldable()` makes the object-valued `text` state deeply readable.
The template can therefore bind to `reading.text.value` and
`reading.text.committedValue` without creating a separate `craftComputed` for
each property.

## Rendering the current step

The machine exposes `currentStep` as a union of step names and
`currentStepWithContext` as a discriminated union. Use the latter when each
step needs different data or actions:

```typescript
matchNode.exhaustive(machine.currentStepWithContext, 'step', {
  reading: (reading) =>
    div([
      p(['Committed value: ', reading.text.committedValue]),
      p(['Current value: ', reading.text.value]),
      button({ click: () => reading.edit$.emit() }, 'Edit'),
    ]),

  editing: (editing) =>
    div([
      input({
        value: editing.text.value,
        input: function* (event) {
          yield* editing.text.change(event.target.value);
        },
      }),
      button({ click: () => editing.commit$.emit() }, 'Commit'),
      button({ click: () => editing.cancel$.emit() }, 'Cancel'),
    ]),
});
```

`matchNode.exhaustive` checks that every step is handled, and narrows the
handler argument to that step's context. Adding a new step therefore produces
compile-time feedback both in the machine's transition record and in the
rendering code.

If the view only needs the name, use the shorter scalar form:

```typescript
matchNode.exhaustive(machine.currentStep, {
  reading: () => p('Reading'),
  editing: () => p('Editing'),
});
```

## Guards

The event declaration says when a transition is attempted. A
`transitionGuard` says whether that attempt is accepted. Guards can be local to
one step, global to the machine, or attached to one particular attempt:

```typescript
editing: transitionStep(function* () {
  yield* on$(context.edit$, () =>
    transit().pipe(
      transitionGuard(({ context }) => context.form.isValid()),
    ),
  );
}),
```

A guard can also be a generator and yield Craft services. Those dependencies
become part of the machine's dependency graph. This keeps the condition
declarative as well: the transition is still described by its event and its
accepted predicate, rather than by an imperative event handler that manually
coordinates state.

## Composition and extensions

The final machine insertion has the same role as an insertion on `state`,
`query`, or `mutation`. Use it for derived values, view helpers, selectors, or
reusable behavior. For several machine insertions, use
`insertStateMachinePipe`:

```typescript
const machine =
  yield *
  craftStateMachine(
    'editor',
    contextFactory,
    transitions,
    stepContextFactory,
    insertStateMachinePipe(
      withStateMachineHistory({
        persist: { storeName: 'demo', key: 'editor' },
      }),
      withBackNavigation(),
      ({ currentStep }) => ({
        isReading: craftComputed('isReading', function* () {
          return (yield* currentStep()) === 'reading';
        }),
      }),
    ),
  );
```

History, back/forward navigation, and derived flags are therefore extensions
of the machine rather than hidden responsibilities of its core. The machine
remains focused on declaring steps and the events that enter them.

## When to use a state machine

Use `craftStateMachine` when:

- the feature has a finite set of named workflow steps;
- different steps expose different actions or view data;
- events, recomputations, or initialisation determine when a step is entered;
- exhaustive handling of steps is valuable;
- guards or reusable workflow extensions belong on the state-machine boundary.

For a single independent value, use [`state`](/guide/state/local-state). For a
server read or write, use [`query`](/guide/state/server-state) or
[`mutation`](/guide/state/mutations). A state machine can compose those
primitives in its context when the workflow needs them.

## API summary

| API                      | Role                                                   |
| ------------------------ | ------------------------------------------------------ |
| `craftStateMachine`      | Creates the named state-machine primitive              |
| `transitionStep`         | Declares how one step is entered                       |
| `transit()`              | Creates an attempt to enter the surrounding step       |
| `initStateMachine`       | Declares the attempt that establishes the initial step |
| `transitionGuard`        | Accepts or rejects a transition attempt                |
| `currentStep`            | Reactive union of step names                           |
| `currentStepWithContext` | Reactive discriminated union of step contexts          |
| `insertStateMachinePipe` | Composes machine insertions                            |

## See also

- [Local state](/guide/state/local-state)
- [Typed insertion pipes](/guide/concepts/insertion-pipes)
- [Fine-grained reactivity](/guide/components/fine-grained-reactivity)
- [The text editor example on GitHub](https://github.com/craft-ts/craft-ts/blob/main/apps/demo/src/app/examples/primitives/state-machine/text-editor.ts)
