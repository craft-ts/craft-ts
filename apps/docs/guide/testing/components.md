# Testing components

Craft components are tested in two independent halves: the **logic factory**
(plain values, no DOM) and the **template** (real DOM, explicit locators). You
can test one without paying for the other.

**Use the logic test** for what the factory computes and exposes.
**Use the template test** for what actually renders, and for interaction.

The utilities live in a dedicated submodule:

```ts
import {
  setupCraftComponentLogicTest,
  setupCraftComponentTemplateTest,
  setupCraftDirectiveLogicTest,
  setupCraftDirectiveTemplateTest,
} from '@craft-ts/component/testing';
```

They deliberately separate the factory from rendering. Each utility also
exposes a `.byRegister(...)` form, which makes the services used by the tested
code explicit.

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
          value: () => [],
        },
      },
    },
  });

expect(context.store.todos.value()).toEqual([]);
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

### Explicit DOM locators

Template tests also expose `locator(tag, criteria)`. The tag determines the
DOM element type, while `class`, `data-*`, and `aria-*` criteria are matched
against the rendered element:

<<< @/tests/snippets/guide/testing/components/editor.spec.ts#editor


The notation `tag('name', props, children)` is generic: `tag` means the HTML
helper for the element you want. There is no separate `tag` function. For a
button, write the three arguments explicitly:

```ts
const saveButton = button(
  'save', // name: stable local name
  { class: 'save' }, // props: DOM properties and attributes
  'Save', // children: rendered content
);
```

The same pattern works with every built-in helper:

```ts
import { input } from '@craft-ts/component';

const searchInput = input('search', { 'aria-label': 'Search' }, []);
```

The name is rendered as `data-craft-name="save"` and can be used as a
complementary named locator when a class is not sufficiently discriminating.

### Locating branded content

When an element directly renders a branded Craft value, use the brand name as
the `content` criterion. The locator does not inspect the rendered value, so
this also works for non-text values and remains independent of formatting:

```typescript
import { craftSignal as signal } from '@craft-ts/core';
import { span, craftComponent } from '@craft-ts/component';
import { markYieldableValue, state } from '@craft-ts/core';

const Status = craftComponent(
  'Status',
  {},
  function* () {
    const brandedStatus = yield* state('brandedStatus', 'ready');
    return { brandedStatus };
  },
  ({ brandedStatus }) => span(brandedStatus),
);

const test = await setupCraftComponentTemplateTest.byRegister(Status, {
  context: {
    brandedStatus: markYieldableValue(signal('ready'), 'brandedStatus'),
  },
  register: {},
});

const brandedStatusElement = test.locator('span', {
  content: 'brandedStatus',
});
expect(brandedStatusElement.textContent).toBe('ready');
test.destroy();
```



This template has no `ifBlock`, `each`, or `defer`, so
`brandedStatusElement` is an `HTMLSpanElement`, never `undefined`; optional
chaining is not needed here.

The brand name is part of the template type. An unknown value such as
`{ content: 'missing' }` is rejected by TypeScript. The return type is the
inferred DOM type when the element is always rendered. Under `ifBlock`, `each`,
or `defer`, it is `MaybeDefined<HTMLSpanElement>` (equivalent to
`HTMLSpanElement | undefined`), so callers must handle the absent branch.

Use static, discriminating markers for locators. A literal class or attribute
declared in the template is a stable proof; a value produced by a binding is
not. Attributes declared through `attrs` are queried using their rendered
attribute name:

```ts
input({ attrs: { 'aria-label': 'Search' } });
test.locator('input', { 'aria-label': 'Search' });
```

The locator searches the complete rendered subtree, including Craft child
components. A branch that is currently absent returns `undefined`; a runtime
result with more than one matching element throws an explicit cardinality
error. Call the locator again after `updateContext` and `detectChanges` when a
conditional branch changes.

When a class is not sufficiently discriminating, keep using the existing
named locators (`tag('name', props, children)`) and query their
`data-craft-name` marker. A future collection API will cover repeated targets;
the singular locator should remain reserved for one expected element.

To verify that a DOM property is connected to the correct context member, add a
contract assertion next to the template test:

<<< @/tests/snippets/guide/testing/components/counter.spec.ts#counter


TypeScript performs this check. It fails if the branded `counter.disabled` read
is no longer exposed by the rendered template. It does not replace the
rendering test; it verifies the template contract without a DOM.

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

## Type-level tests

The template's contract can also be checked **without rendering anything** —
that an element only appears under a condition, that a binding is really the one
you think, that a list item renders its label. That is its own page:
**[Type-level tests](/guide/testing/type-level)**.

## See Also

- [Testing services](/guide/testing/services)
- [Browser boundaries](/guide/testing/browser-boundaries)
- [Architecture rules](/guide/testing/architecture) — constraints on the whole app graph
- [Routing setup](/guide/routing/setup) — where `GenDeps_*` comes from
