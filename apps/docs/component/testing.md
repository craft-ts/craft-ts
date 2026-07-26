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
    const counter = yield* state(0, ({ state, update }) => ({
      disabled: craftComputed(
        'disabled',
        () => state() % 2 === 0,
      ),
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
  const { context, destroy } =
    await setupCraftComponentLogicTest.byRegister(Counter, {
      register: {},
    });

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

The available assertions can verify elements, their props, event arguments,
generator callbacks, and outputs:

```ts
type HasButton = TemplateHasElementWithProps<
  ReturnType<ComponentTemplateOf<typeof Counter>>,
  'button',
  { readonly class: string }
>;

type HasClick = TemplateHasYieldableEvent<
  ReturnType<ComponentTemplateOf<typeof Counter>>,
  'button',
  'click',
  [MouseEvent]
>;

type HasDisabledBinding = TemplateDelegatesToContext<
  ReturnType<ComponentTemplateOf<typeof Counter>>,
  'button',
  'disabled'
>;

type HasNestedDisabledBinding = TemplateDelegatesToContext<
  ReturnType<ComponentTemplateOf<typeof Counter>>,
  'button',
  'disabled',
  'counter.disabled'
>;
```

Primitive properties follow the same contract as events. For derived state, use
`craftComputed` in the `state` insertion:

```ts
const counter = yield* state(0, ({ state }) => ({
  disabled: craftComputed('disabled', () => state() % 2 === 0),
}));

button(
  {
    *disabled() {
      return yield* context.counter.disabled();
    },
  },
  '+',
);
```

The callback is executed by the Craft driver before the DOM property is
written. The following assertion verifies the exact binding source without a
fixture or DOM:

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
