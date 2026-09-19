# Testing components

A component is one function, so the seam is no longer inside it: it is the
**service** the component takes. Behaviour lives there and is tested with plain
values and no DOM; the component is then rendered against that service, real or
mocked.

**Use a [service test](/guide/testing/services)** for what the behaviour
computes. **Use the template test** for what actually renders, and for
interaction.

The rendering utilities live in a dedicated submodule:

```ts
import {
  setupCraftComponentTemplateTest,
  setupCraftDirectiveTemplateTest,
} from '@craft-ts/component/testing';
```

Each also exposes a `.byRegister(...)` form, which makes the services used by
the rendered code explicit.

## The component's service

`setupCraftServiceTestingByRegister` runs the service alone and returns what it
exposes, together with the installed mocks:

```ts
const { sut, mocks } = await setupCraftServiceTestingByRegister(TodoStoreView, {
  todoStoreView: provideTodoStoreView(),
  TodoStore: {
    todos: {
      status: () => 'resolved',
      value: () => [],
    },
  },
});

expect(craftUse(sut.todos.value())).toEqual([]);
expect(mocks.TodoStore).toBeDefined();
```

A service that takes inputs receives them through `bindings`; see
[Testing services](/guide/testing/services).

## Component template

The template test mounts the component with the inputs it declares, and with
its services taken from `register`:

```ts
const test = await setupCraftComponentTemplateTest.byRegister(StatusComponent, {
  inputs: { status: () => 'resolved' },
  register: { statusView: provideStatusView() },
});

expect(test.nativeElement.textContent).toContain('Loaded');
test.detectChanges();
test.updateInputs({ status: () => 'error' });
expect(test.nativeElement.textContent).toContain('Error');
test.destroy();
```

The result exposes `nativeElement`, `element`, `mocks`, `detectChanges`,
`updateInputs`, `locator`, the accessible queries (`getByRole`, `getByLabel`,
…), and `destroy`. Craft styles, child components, Craft directives, and
reactivity are rendered by the normal renderer.

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
import { span, craftComponent } from '@craft-ts/component';
import { state } from '@craft-ts/core';

const Status = craftComponent('Status', {}, function* () {
  const brandedStatus = yield* state('brandedStatus', 'ready');
  return span(brandedStatus);
});

const test = await setupCraftComponentTemplateTest.byRegister(Status, {
  inputs: {},
  register: {},
});

const brandedStatusElement = test.locator('span', {
  content: 'brandedStatus',
});
expect(brandedStatusElement.textContent).toBe('ready');
test.destroy();
```



This template has no `ifNode`, `forNode`, or `deferNode`, so
`brandedStatusElement` is an `HTMLSpanElement`, never `undefined`; optional
chaining is not needed here.

The brand name is part of the template type. An unknown value such as
`{ content: 'missing' }` is rejected by TypeScript. The return type is the
inferred DOM type when the element is always rendered. Under `ifNode`, `forNode`,
or `deferNode`, it is `MaybeDefined<HTMLSpanElement>` (equivalent to
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
error. Call the locator again after `updateInputs` and `detectChanges` when a
conditional branch changes.

When a class is not sufficiently discriminating, keep using the existing
named locators (`tag('name', props, children)`) and query their
`data-craft-name` marker. A future collection API will cover repeated targets;
the singular locator should remain reserved for one expected element.

To verify that a DOM property is connected to the correct member, add a
contract assertion next to the template test:

<<< @/tests/snippets/guide/testing/components/counter.spec.ts#counter


TypeScript performs this check. It fails if the branded `counter.disabled` read
is no longer exposed by the rendered template. It does not replace the
rendering test; it verifies the template contract without a DOM.

## Inputs and service dependencies

`inputs` are what the call site passes; everything the component *takes* goes
through `register` — including its own service:

```ts
await setupCraftComponentTemplateTest.byRegister(FullDemoCraft, {
  inputs: {},
  register: { fullDemoView: todoStoreMock },
});
```

If the component or a child uses a `FormatterService`, the registry contains
`FormatterService`, never the child component:

```ts
register: {
  FormatterService: formatterMock,
}
```

`CraftComponentTemplateDepsOf<Component>` is the projection that types the
registry: it lists the services the rendered tree reaches. Child components are
never entries in `register`.

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
await setupCraftComponentTemplateTest.byRegister(Component, {
  inputs: {},
  providers: [provideApiService({ baseUrl: '/test' })],
  register: {
    ApiService: 'provided',
  },
});
```

`appStart` decisions (`'run'` or `'ignore'`) are available in the options when
the tested graph contains a service with `appStart: true`.

## Testing a directive

A directive declares transformations, so each is tested where it acts. A
`service` transform is tested like any service — take the service the directive
overrides and read the members it changed. A `template` transform is mounted
with the base template it wraps:

```ts
const test = await setupCraftDirectiveTemplateTest.byRegister(whenDirective, {
  baseTemplate: (inputs) => p(inputs.message),
  inputs: { when: () => true, message: 'ready' },
  register: {},
});

test.updateInputs({ when: () => false, message: 'hidden' });
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
