# Content projection and typed fragments

Craft provides two function-first primitives for reusable content:

- `ContentInput<Slots>` describes a component's named slots;
- `craftSlot(renderer)` brands an inert slot renderer;
- `project(fragment)` renders a slot without adding a DOM wrapper;
- `craftTemplate<Context>(renderer)` creates an inert, parameterized fragment;
- `renderTemplate(template, context)` renders that fragment with a checked context.

## Typed slots

Slots are declared in the component factory. Required properties are required at
the call site, optional properties can be used for fallbacks, and object
literals reject unknown slot names:

```ts
import {
  ContentInput,
  CraftFragment,
  craftComponent,
  div,
  h2,
  p,
  project,
  section,
} from '@craft-ng/component';

type CardSlots = {
  readonly header?: CraftFragment;
  readonly default: CraftFragment;
};

const Card = craftComponent(
  'Card',
  {},
  (content: ContentInput<CardSlots>) => ({ content }),
  ({ content }) =>
    div([
      content.header ? project(content.header) : h2('Default title'),
      section(project(content.default)),
    ]),
);

Card({
  content: {
    header: () => h2('My title'),
    default: () => p('Projected content'),
  },
});
```

The renderer evaluates each slot in the context where the content was
declared. A provider from the component that calls `project` is not visible to
the projected content. If the content uses a Craft service, that dependency is
propagated to the declaring component and checked there. A provider declared
only by `Card` cannot satisfy it.

This is lexical by design: use a typed template when the component must pass
data into reusable content instead of relying on an implicit child injector.

### Projected child components

The same rule applies when a slot contains another Craft component. The child
component is created with its own component injector, whose parent is the
injector of the component that declared the slot content:

```ts
import { inject, InjectionToken } from '@angular/core';
import { craftComponent, span } from '@craft-ng/component';

const labelToken = new InjectionToken<string>('label');

const Badge = craftComponent(
  'Badge',
  {},
  () => ({ label: inject(labelToken) }),
  ({ label }) => span(label),
);

const Page = craftComponent(
  'Page',
  { providers: [{ provide: labelToken, useValue: 'declared by Page' }] },
  () => ({}),
  () =>
    Card({
      content: {
        default: () => Badge({}),
      },
    }),
);
```

If `Card` also provides `labelToken`, `Badge` still receives `declared by
Page`: `Card`'s injector is not in the projected content's ancestry. A
provider declared by `Badge` itself (or supplied with `withProviders` on that
`Badge` invocation) is available to `Badge` and its descendants and can
override the provider from `Page`. Root and route injectors remain available
as normal ancestors.

In short, projection preserves the declaration chain:

```text
root / route injector
  └─ Page injector (declares the slot)
       └─ Badge injector (projected child)

Card injector is a sibling branch for the projected content, not its parent.
```

## Parameterized templates

`craftTemplate` does not render while it is declared. Its context is checked at
the declaration and at every `renderTemplate` call, so it can be reused in
lists, conditional branches, slots, and deferred content:

```ts
import { craftTemplate, li, renderTemplate } from '@craft-ng/component';

const row = craftTemplate<{
  readonly $implicit: User;
  readonly index: number;
}>(({ $implicit: user, index }) => li(`${index}: ${user.name}`));

renderTemplate(row, { $implicit: user, index: 0 });
// TypeScript error: `index` is required.
renderTemplate(row, { $implicit: user });
```

Templates are ordinary composable Craft nodes. Their dependencies are included
in the same static graph as elements, `ifBlock`, `each`, `defer`, components,
and projected slots. `TemplateRef` from Angular is intentionally not accepted
by this API; Angular interop remains an explicit boundary.
