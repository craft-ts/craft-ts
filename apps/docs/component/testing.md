# Testing Craft Components and Directives

The testing utilities are available from the dedicated submodule:

```ts
import {
  setupCraftComponentLogicTest,
  setupCraftComponentTemplateTest,
  setupCraftDirectiveLogicTest,
  setupCraftDirectiveTemplateTest,
} from '@craft-ng/component/testing';
```

They complement the existing Angular setup and deliberately separate the
factory from rendering. Each utility also exposes a `.byRegister(...)` form,
which makes the services used by the tested code explicit.

The package also re-exports the legacy registry-based setups:

```ts
import {
  setupCraftServiceTestingByRegister,
  setupCraftComponentTestingByRegister,
} from '@craft-ng/component/testing';
```

They remain compatible with the existing test setup and can be used in the
same file as the logic/template utilities.

## Component logic

The logic test executes only the factory and returns its context together with
the installed mocks:

```ts
const { context, mocks, destroy } =
  await setupCraftComponentLogicTest.byRegister(FullDemoCraft, {
    register: {
      TodoStore: {
        todos: {
          status: () => 'resolved',
          safeValue: () => [],
        },
      },
    },
  });

expect(context.store.todos.safeValue()).toEqual([]);
expect(mocks.TodoStore).toBeDefined();
destroy();
```

Factory arguments can be provided through `args` when the component declares
inputs:

```ts
await setupCraftComponentLogicTest.byRegister(StatusComponent, {
  args: [statusInput],
  register: {},
});
```

## Component template

The template test receives an already-built context. The component logic is not
executed:

```ts
const test = await setupCraftComponentTemplateTest.byRegister(StatusComponent, {
  context: { status: () => 'resolved' },
  register: {},
});

expect(test.nativeElement.textContent).toContain('Loaded');
test.detectChanges();
test.updateContext({ status: () => 'error' });
expect(test.nativeElement.textContent).toContain('Error');
test.destroy();
```

The result exposes `nativeElement`, `element`, `mocks`, `detectChanges`,
`updateContext`, and `destroy`. Craft styles, child components, Craft
directives, and reactivity are rendered by the normal renderer.

To verify that a DOM property is connected to the correct context member, add a
contract assertion next to the template test:

```ts
import { craftComputed, state } from '@craft-ng/core';
import { craftComponent, button } from '@craft-ng/component';
import type {
  ComponentTemplateOf,
  TemplateDelegatesToContext,
} from '@craft-ng/component';
import type { Equal, Expect } from 'test-type';

const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const { counter } = yield* state('counter', 0, ({ state, update }) => ({
      disabled: craftComputed('disabled', () => state() % 2 === 0).disabled,
      increment: () => update((value) => value + 1),
    }));

    return { counter };
  },
  ({ counter }) =>
    button(
      {
        *disabled() {
          return yield* counter.disabled();
        },
        *click() {
          yield* counter.increment();
        },
      },
      '+',
    ),
);

it('tests the derived disabled state', async () => {
  const { context, destroy } = await setupCraftComponentLogicTest.byRegister(
    Counter,
    {
      register: {},
    },
  );

  try {
    expect(context.counter.disabled()).toBe(true);

    context.counter.increment();

    expect(context.counter()).toBe(1);
    expect(context.counter.disabled()).toBe(false);
  } finally {
    destroy();
  }
});

type _DisabledBindingIsCorrect = Expect<
  Equal<
    TemplateDelegatesToContext<
      ReturnType<ComponentTemplateOf<typeof Counter>>,
      'button',
      'disabled',
      'counter.disabled'
    >,
    true
  >
>;
```

TypeScript performs this check. It fails if the `button.disabled` callback
delegates to another member or no longer delegates to `counter.disabled`. It
does not replace the rendering test; it verifies the exact template wiring
without a DOM.

## Context and service dependencies

The `context` is a factory value and is not a registry dependency. In this
example, `store` is provided directly to the template:

```ts
await setupCraftComponentTemplateTest.byRegister(FullDemoCraft, {
  context: { store: todoStoreMock },
  register: {},
});
```

Conversely, if `StatusComponent` or a child component uses a
`FormatterService`, the template registry contains `FormatterService`, never
the child component:

```ts
register: {
  FormatterService: formatterMock,
}
```

The `CraftComponentLogicDepsOf<Component>` and
`CraftComponentTemplateDepsOf<Component>` projections keep these two graphs
separate. A template registry therefore accepts only services; child components
are never entries in `register`.

## Registry values and providers

Resolution follows the same rules as service tests:

- an object is a mock and is available in `mocks`;
- `'real'` keeps the real service;
- `'notReached'` documents a branch removed by a parent mock;
- `'provided'` requests the value provided by the parent injector;
- a `provideX(...)` provider explicitly configures a service.

Providers declared in `meta.providers` are available in the component scope.
Upstream providers go in `providers`:

```ts
await setupCraftComponentLogicTest.byRegister(Component, {
  providers: [provideApiService({ baseUrl: '/test' })],
  register: {
    ApiService: 'provided',
  },
});
```

`appStart` decisions (`'run'` or `'ignore'`) are available in the options when
the tested graph contains a service with `appStart: true`.

## Testing a directive

Directive logic receives its `baseLogic` and arguments explicitly:

```ts
const { context } = await setupCraftDirectiveLogicTest.byRegister(
  hasPermissionInput,
  {
    baseLogic,
    args: [userInput, permissionInput],
    register: {},
  },
);
```

For the template, provide `baseTemplate` and the final context:

```ts
const test = await setupCraftDirectiveTemplateTest.byRegister(whenDirective, {
  baseTemplate: (context) => p(context.message()),
  context: { when: () => true, message: () => 'ready' },
  register: {},
});

test.updateContext({ when: () => false, message: () => 'hidden' });
test.destroy();
```

Structural directives follow the same path and can verify that rendering is
replaced with `[]`. Calling `destroy()` cleans up views, injectors, listeners,
and acquired styles.

## Type-level template contract

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
import { craftComputed, state } from '@craft-ng/core';
import { button, craftComponent, div } from '@craft-ng/component';
import type {
  ComponentTemplateOf,
  TemplateDelegatesToContext,
  TemplateHasElement,
  TemplateHasElementWithProps,
  TemplateHasYieldableEvent,
} from '@craft-ng/component';
import type { Equal, Expect } from 'test-type';

const Counter = craftComponent(
  'Counter',
  {},
  function* () {
    const { counter } = yield* state('counter', 0, ({ state, update }) => ({
      disabled: craftComputed('disabled', () => state() === 0).disabled,
      increment: () => update((value) => value + 1),
    }));

    return { counter };
  },
  ({ counter }) =>
    div(
      { class: 'counter' },
      button(
        {
          *disabled() {
            return yield* counter.disabled();
          },
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

// The default path is "disabled". This is false because the template uses
// the nested member "counter.disabled" instead.
type HasTopLevelDisabledBinding = Expect<
  Equal<
    TemplateDelegatesToContext<CounterTemplate, 'button', 'disabled'>,
    false
  >
>;

type HasNestedDisabledBinding = Expect<
  Equal<
    TemplateDelegatesToContext<
      CounterTemplate,
      'button',
      'disabled',
      'counter.disabled'
    >,
    true
  >
>;

// This becomes false if the template is accidentally wired to another member.
type DoesNotUseEnabled = Expect<
  Equal<
    TemplateDelegatesToContext<
      CounterTemplate,
      'button',
      'disabled',
      'counter.enabled'
    >,
    false
  >
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
    const { counter } = yield* state('counter', 0, ({ state }) => ({
      disabled: craftComputed('disabled', () => state() % 2 === 0).disabled,
    }));

    return { counter };
  },
  (context) =>
    button(
      {
        *disabled() {
          return yield* context.counter.disabled();
        },
      },
      '+',
    ),
);
```

Here, `counter` is created by the component factory and returned in its
context. The template receives that context, so `context.counter.disabled()`
is the exact binding that the type assertion checks:

```ts
type HasDerivedDisabledBinding = TemplateDelegatesToContext<
  ReturnType<ComponentTemplateOf<typeof Counter>>,
  'button',
  'disabled',
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
    TemplateDelegatesToContext<
      ReturnType<ComponentTemplateOf<typeof Counter>>,
      'button',
      'disabled',
      'counter.enabled'
    >,
    false
  >
>;
```

The callback is executed by the Craft driver before the DOM property is
written. The assertion verifies the exact binding source without a fixture or
DOM.

`craftComputed` remains a synchronous signal when called directly
(`counter.disabled()`). In a template context, it is projected to a yieldable
callback so it can be consumed with `yield*`.

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
import { craftComputed } from '@craft-ng/core';
import { button, craftComponent, ifBlock } from '@craft-ng/component';

const Counter = craftComponent(
  'Counter',
  {},
  () => ({ isAuth: craftComputed('isAuth', () => true).isAuth }),
  ({ isAuth }) =>
    ifBlock(
      isAuth,
      () => button('increment', { click: function* () {} }, '+'),
      () => [],
    ),
);
```

The local name is rendered as `data-craft-name`; `data-craft-root` remains an
internal tracking attribute. A named element can be asserted with its full
component identity and visibility path:

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

`each` adds `<listName>: 'nonEmpty'` for its item template and
`<listName>: 'empty'` for its empty template. The
`craft-ng/template-element-name-unique` ESLint rule checks that each component
template declares a literal `tag:localName` at most once, including across
conditional branches.
