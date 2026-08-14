# Type-level tests

Some of what a template guarantees is not observable at runtime — it is in the
types. These assertions resolve **entirely at compile time**: no `TestBed`, no
DOM, no fixture, no component instantiation.

**Use them when** a regression would be silent: an element quietly stops
rendering under a condition, a binding is repointed at another context member, a
handler becomes imperative, a prop changes shape.
**Not instead of** runtime tests — they prove the template's _contract_, not
what the user ends up seeing. Pair them with
[template tests](/guide/testing/components#component-template).

## The three questions they answer

Most of what you'll write falls into one of these. Each is expanded below.

| You want to prove…                                           | Use                                                |
| ------------------------------------------------------------ | -------------------------------------------------- |
| an element renders **only under a condition**                | `TemplateRendersNamedElementWhen` with `{ when }`  |
| a binding is rendered **for every item of a non-empty list** | the same, with `{ when: { items: 'nonEmpty' } }`   |
| a **property is used** on a named element                    | `TemplateNamedElementRendersStateWhen`             |
| an element property delegates to a context method            | `TemplateNamedElementDelegatesToContext`           |
| a component logic field has a specific service output        | `ComponentLogicOutputOf` + `ResolvedServiceOutput` |

::: warning Experimental
This contract is the least settled part of `@craft-ng`. The assertions below
work and are covered by the library's own tests, but their **names and
ergonomics are still moving** — expect the DX to get shorter and more readable
before it stabilises. Pin the version if you rely on them heavily.
:::

## Setting it up

The assertions build on two type helpers, published for applications on a
dedicated subpath:

```ts
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';
```

They are **types only** — nothing is emitted, so importing them costs nothing at
runtime.

An assertion is the pair: a helper that computes a boolean type, wrapped in
`Expect<Equal<…, true>>`. If the computed type stops being `true`, the file stops
compiling.

`ComponentTemplateOf` gets you the template type to assert on:

```ts
type CounterTemplate = ReturnType<ComponentTemplateOf<typeof Counter>>;
```

`ComponentLogicOutputOf` gets the value returned by the component logic
factory. This lets you assert the type of a field returned by the factory,
instead of checking only that the component declares a dependency:

```ts
import type { ComponentLogicOutputOf } from '@craft-ng/component';
import type { ResolvedServiceOutput } from '@craft-ng/core';

type FullDemoLogic = ComponentLogicOutputOf<typeof FullDemoCraft>;
type TodoStoreOutput = ResolvedServiceOutput<typeof TodoStore, {}>;

type StoreIsTodoStore = Expect<Equal<FullDemoLogic['store'], TodoStoreOutput>>;
```

`ResolvedServiceOutput` is used here because it preserves the reactive brands
present on the value produced by `yield* TodoStore()`.

### Running them with Vitest

Type assertions fail at **compile** time, so they need something to typecheck the
file. `tsc --noEmit` is enough, but Vitest can run them alongside your runtime
tests:

```shell
vitest typecheck
```

Put the assertions in a `*.test-d.ts` file and Vitest reports a failing type as a
failing test, in the same run and the same output as everything else. Vitest's
own `expectTypeOf` / `assertType` work there too, and compose with the helpers
below.

::: tip Give them a home
A type assertion nobody typechecks proves nothing. Either keep them in files
covered by `vitest typecheck`, or make sure `tsc --noEmit` runs over them in CI.
:::

## The template contract

`SetupTestComponentTemplate` resolves the template without `TestBed`, a DOM,
the factory, or runtime providers. The component tuple contains the references
allowed for children:

```ts
type CounterTemplateTest = SetupTestComponentTemplate<
  typeof Counter,
  [typeof CounterButton, typeof PlusIcon]
>;
```

The resolver traverses elements, directives, `each`, `defer`, and child
components. A component reference missing from the tuple becomes a type
diagnostic. Visited components are tracked so recursive templates do not create
a resolution loop.

The contract also checks the required public props of `ComponentNode` and keeps
the concrete child component reference. Dynamic component unions produce a
dedicated diagnostic; split them into static branches so they can be checked at
the type level. External Angular components form an explicit boundary and
should be tested with their Angular harness.

The available assertions can verify elements, their exact props, event
arguments, generator callbacks, and outputs. For example, start with a
component whose `disabled` property is nested inside the `counter` state:

```ts
import { computed } from '@angular/core';
import { state } from '@craft-ng/core';
import { button, craftComponent, div } from '@craft-ng/component';
import type {
  ComponentTemplateOf,
  TemplateRendersStateWhen,
  TemplateHasElement,
  TemplateHasElementWithProps,
  TemplateHasYieldableEvent,
} from '@craft-ng/component';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';

const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const counter = yield* state('counter', 0, ({ state, update }) => ({
      disabled: craftComputed(function* () {
        return (yield* state()) === 0;
      }),
      increment: () => update((value) => value + 1),
    }));

    return { counter };
  },
  ({ counter }) =>
    div(
      { class: 'counter' },
      button(
        {
          disabled: counter.disabled,
          *click(_event: MouseEvent) {
            yield* counter.increment();
          },
        },
        '+',
      ),
    ),
);
```

The type assertions inspect the template returned by `Counter`; they do not
instantiate the component or render a DOM fixture:

```ts
type CounterTemplate = ReturnType<ComponentTemplateOf<typeof Counter>>;

type HasButton = Expect<
  Equal<TemplateHasElement<CounterTemplate, 'button'>, true>
>;

// TemplateHasElementWithProps checks the exact prop set of the matching node.
type HasCounterClass = Expect<
  Equal<
    TemplateHasElementWithProps<
      CounterTemplate,
      'div',
      { readonly class: string }
    >,
    true
  >
>;

type HasClick = Expect<
  Equal<
    TemplateHasYieldableEvent<CounterTemplate, 'button', 'click', [MouseEvent]>,
    true
  >
>;

type HasNestedDisabledBinding = Expect<
  Equal<TemplateRendersStateWhen<CounterTemplate, 'counter.disabled'>, true>
>;
```

These checks detect different regressions at compile time. Removing the
`button`, changing the `click` callback to an imperative function, changing
its event arguments, or replacing `counter.disabled` with another context
member makes the corresponding assertion fail. The `TemplateHasElementWithProps`
check also catches an unexpected extra, missing, or differently typed prop.

Primitive properties follow the same contract as events. For derived state, use
`craftComputed` in the `state` insertion:

```ts
const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const counter = yield* state('counter', 0, ({ state }) => ({
      disabled: craftComputed(function* () {
        return (yield* state()) % 2 === 0;
      }),
    }));

    return { counter };
  },
  (context) =>
    button(
      {
        disabled: context.counter.disabled,
      },
      '+',
    ),
);
```

Here, `counter` is created by the component factory and returned in its
context. The template receives that context, and the branded
`context.counter.disabled()` read is the binding that the type assertion
checks:

```ts
type HasDerivedDisabledBinding = TemplateRendersStateWhen<
  ReturnType<ComponentTemplateOf<typeof Counter>>,
  'counter.disabled'
>;

type _HasDerivedDisabledBinding = Expect<
  Equal<HasDerivedDisabledBinding, true>
>;
```

If the template were accidentally changed to use another member, the
assertion would fail:

```ts
type UsesWrongBinding = Expect<
  Equal<
    TemplateRendersStateWhen<
      ReturnType<ComponentTemplateOf<typeof Counter>>,
      'counter.enabled'
    >,
    false
  >
>;
```

The callback is executed by the Craft driver before the DOM property is
written. The assertion verifies the exact binding source without a fixture or
DOM.

`computed` remains a synchronous signal when called directly
(`counter.disabled()`) and in a template context.

Templates supplied to `each` and `defer` are also resolved. When a `defer`
directly loads a Craft component, that component must appear in the registry.
Under this contract, DOM and output callbacks must be generators or branded
Craft methods; ordinary imperative callbacks produce a diagnostic.

Branded Craft methods are projected into the template context as yieldable
callbacks:

```ts
button(
  {
    *click() {
      yield* context.counter.increment(2);
    },
  },
  '+',
);
```

The renderer executes these callbacks with the Craft driver. Render callbacks
(text, classes, styles, `each`, `defer`) remain synchronous.

## Conditional visibility and named elements

Reactive values exposed by Craft primitives and services keep their property
name in the template type. They remain synchronously readable in templates,
while their name brand is available to `ifBlock` and the visibility contract.
Use `ifBlock` to retain the condition and its branches in the VNode contract:

```ts
import { computed, signal } from '@angular/core';
import { markYieldableValue, state } from '@craft-ng/core';
import {
  button,
  craftComponent,
  div,
  ifBlock,
  span,
} from '@craft-ng/component';

const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const isAuth = yield* state('isAuth', true);
    const brandedStatus = yield* state('brandedStatus', 'ready');
    return { isAuth, brandedStatus };
  },
  ({ isAuth, brandedStatus }) =>
    ifBlock(
      isAuth,
      () =>
        div([
          button('increment', { click: function* () {} }, '+'),
          span(brandedStatus),
        ]),
      () => [],
    ),
);
```

The local name is rendered as `data-craft-name`; `data-craft-root` remains an
internal tracking attribute.

### Proving an element renders only under a condition

A named element is asserted with its **full component identity** —
`'<Component>:<tag>:<localName>'` — and the visibility path it sits behind:

```ts
type CounterTemplate = ReturnType<ComponentTemplateOf<typeof Counter>>;

type CanIncrement = Expect<
  Equal<
    TemplateRendersNamedElementWhen<
      CounterTemplate,
      'Counter:button:increment',
      { when: { isAuth: true } }
    >,
    true
  >
>;
```

When the element is truly unconditional, omit `when` (or use an empty object).
An element inside an `ifBlock` or `each` requires its visibility condition;
omitting `when` deliberately returns `false` for such an element. Keep the
complete `ComponentTemplateOf` type if you want editor completion for the
component prefix of the identity. Using `ReturnType<...>`
preserves the element and tag, but loses the component name used for the most
useful completion suggestions:

```ts
type FullDemoTemplate = ComponentTemplateOf<typeof FullDemoCraft>;

type DisplayNewTodoNameInput = Expect<
  Equal<
    TemplateRendersNamedElementWhen<
      FullDemoTemplate,
      'FullDemoCraft:input:TodoNameToAddInput'
    >,
    true
  >
>;
```

When editing the second argument, the available identities are proposed from
the template, for example `FullDemoCraft:input:TodoNameToAddInput` and
`FullDemoCraft:button:AddTodoButton`. `{ when: {} }` is equivalent to omitting
the third argument: both assert that the element is unconditional. For an
element inside an `ifBlock` named `isAuth`, use `{ when: { isAuth: true } }`.

The same visibility contract can identify an element through branded direct
content. Here, `brandedStatus` is not selected by its text; its brand proves that the
`span` renders that value in the authenticated branch:

```ts
type CounterTemplate = ReturnType<ComponentTemplateOf<typeof Counter>>;

type StatusIsRenderedWhenAuthenticated = Expect<
  Equal<
    TemplateRendersStateWhen<
      CounterTemplate,
      'brandedStatus',
      { when: { isAuth: true } }
    >,
    true
  >
>;

const test = await setupCraftComponentTemplateTest.byRegister(Counter, {
  context: {
    isAuth: markYieldableValue(signal(true), 'isAuth'),
    brandedStatus: markYieldableValue(signal('ready'), 'brandedStatus'),
  },
  register: {},
});

const brandedStatusElement = test.locator('span', {
  content: 'brandedStatus',
});
brandedStatusElement?.textContent;
test.destroy();
```

Because the element is conditional, `brandedStatusElement` is typed as
`HTMLSpanElement | undefined`. After `updateContext` and `detectChanges`, the
same locator returns `undefined` while the branch is absent.

### Proving a binding renders for every item of a non-empty list

`each` contributes `<listName>: 'nonEmpty'` to the visibility path, so you can
assert what every item renders — here a translated label exposed by an
`insertSelect` insertion:

```ts
import { computed } from '@angular/core';
import { insertSelect, state } from '@craft-ng/core';
import { craftComponent, each, span } from '@craft-ng/component';
import type {
  ComponentTemplateOf,
  TemplateRendersNamedElementWhen,
  TemplateRendersStateWhen,
} from '@craft-ng/component';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';

const ItemList = craftComponent(
  'ItemList',
  {},
  function* () {
    const items = yield* state(
      'items',
      [{ key: 'first' }, { key: 'second' }],
      insertSelect('item', ({ state: selectedItem }) => ({
        translatedLabel: craftComputed(function* () {
          return `translated:${(yield* selectedItem()).key}`;
        }),
      })),
    );
    return { items };
  },
  ({ items }) =>
    each(items, { track: (item) => item.key }, (_item, index) =>
      span(
        'itemLabel',
        { 'aria-label': items.selectItem(index)?.translatedLabel },
        () => items.selectItem(index)?.translatedLabel() ?? '',
      ),
    ),
);

type ItemListTemplate = ReturnType<ComponentTemplateOf<typeof ItemList>>;

type HasTranslatedLabel = Expect<
  Equal<
    TemplateRendersNamedElementWhen<
      ItemListTemplate,
      'ItemList:span:itemLabel',
      { when: { items: 'nonEmpty' } }
    >,
    true
  >
>;

type RendersTranslatedLabel = Expect<
  Equal<
    TemplateRendersStateWhen<
      ItemListTemplate,
      'items.selectItem.translatedLabel',
      { when: { items: 'nonEmpty' } }
    >,
    true
  >
>;
```

### Proving a property is used on a named element

The same visibility paths verify that a state really feeds a rendered binding,
and that a yieldable action is available on a named element — `'click:increment'`
reads as "the `click` action on the element named `increment`":

```ts
import { craftMethod, state } from '@craft-ng/core';
import { button, craftComponent, ifBlock } from '@craft-ng/component';
import type {
  ComponentTemplateOf,
  TemplateRenderAvailableActionWhen,
  TemplateRendersStateWhen,
} from '@craft-ng/component';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';

const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const isAuth = yield* state('isAuth', true);
    const isAdult = yield* state('isAdult', true);
    const increment = craftMethod('increment', function* () {
      return undefined;
    });

    return { isAuth, isAdult, increment };
  },
  ({ isAuth, isAdult, increment }) =>
    ifBlock(
      isAuth,
      () => button('increment', { click: increment }, () => isAdult()),
      () => [],
    ),
);

type CounterTemplate = ReturnType<ComponentTemplateOf<typeof Counter>>;

type RendersAdultState = Expect<
  Equal<
    TemplateRendersStateWhen<
      CounterTemplate,
      'isAdult',
      { when: { isAuth: true } }
    >,
    true
  >
>;

// The key is `${event}:${localName}`.
type CanIncrementWhenAuthenticated = Expect<
  Equal<
    TemplateRenderAvailableActionWhen<
      CounterTemplate,
      'click:increment',
      { when: { isAuth: true } }
    >,
    true
  >
>;
```

`TemplateRendersStateWhen` recognizes branded reads that contribute to visible
text or other render bindings such as `class` and `style`. Both assertions
return `false` when the state or action exists only under a visibility branch
that is incompatible with `when`.

`each` adds `<listName>: 'nonEmpty'` for its item template and
`<listName>: 'empty'` for its empty template. The
`craft-ng/template-element-name-unique` ESLint rule checks that each component
template declares a literal `tag:localName` at most once, including across
conditional branches.

### Proving a named property uses a specific state

`TemplateNamedElementRendersStateWhen` combines the named-element identity,
the element property, and the context path. All three arguments are constrained
by the template type, so editors can complete the element identity, the
available property names, and the available context paths:

```ts
import type {
  ComponentTemplateOf,
  TemplateNamedElementRendersStateWhen,
} from '@craft-ng/component';
import type { Equal, Expect } from '@craft-ng/dev-tools/testing';

type FullDemoTemplate = ComponentTemplateOf<typeof FullDemoCraft>;

type RemoveButtonUsesRemoveLoading = Expect<
  Equal<
    TemplateNamedElementRendersStateWhen<
      FullDemoTemplate,
      'FullDemoCraft:button:RemoveTodoButton',
      'disabled',
      'store.remove.isLoading'
    >,
    true
  >
>;
```

For a reactive property binding, keep the read inside a render callback so
the context marker remains visible to the template contract:

```ts
button('RemoveTodoButton', {
  disabled: store.remove.isLoading,
});
```

This assertion proves that the `disabled` binding on the named remove button
is driven by `store.remove.isLoading`; it does not instantiate the component or
observe the DOM.

### Proving a named event delegates to a context method

`TemplateNamedElementDelegatesToContext` checks the same relationship for a
generator event callback:

```ts
import type { TemplateNamedElementDelegatesToContext } from '@craft-ng/component';

type AddButtonClickUsesAddMutation = Expect<
  Equal<
    TemplateNamedElementDelegatesToContext<
      FullDemoTemplate,
      'FullDemoCraft:button:AddTodoButton',
      'click',
      'store.add.mutate'
    >,
    true
  >
>;
```

The source callback must delegate with `yield*`:

```ts
button('AddTodoButton', {
  *click() {
    yield* store.add.mutate(title().trim());
  },
});
```

The named identity prevents a different button's `click` handler from
satisfying the assertion.

## Pitfalls

**Asserting `true` where the answer is `false`.** These helpers return a
boolean type, so `Expect<Equal<…, true>>` is the assertion. Writing the helper
alone proves nothing — it just computes a type nobody checks.

**Naming the element is what makes it addressable.** A `button('increment', …)`
carries the local name that `'Counter:button:increment'` resolves. Without it
there is no identity to assert on.

**Imperative callbacks are rejected.** Under this contract, DOM and output
callbacks must be generators or branded Craft methods; an ordinary function
produces a diagnostic.

**A `defer` that loads a Craft component** requires that component to be present
in the registry tuple.

**The ergonomics are known to be rough.** `Expect<Equal<Helper<ReturnType<
ComponentTemplateOf<typeof X>>, …>, true>>` is a lot of ceremony for one
assertion. Shorter façades are being explored; until then, alias what repeats:

```ts
type Tpl = ReturnType<ComponentTemplateOf<typeof Counter>>;
type Assert<T extends true> = Expect<T>;
```

## See Also

- [Testing components](/guide/testing/components) — the runtime half
- [Testing services](/guide/testing/services)
- [Architecture rules](/guide/testing/architecture) — constraints on the whole app graph
- [Learn: test what you wrote](/learn/10-testing)
