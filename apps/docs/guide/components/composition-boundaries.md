# Composition boundaries: `sealComponent`

A component's type remembers two different things:

- **its contracts** — props and inputs, the services it still needs
  (`ComponentDepsOf`), the exceptions a parent must catch, a `heading()` a
  parent must wrap in `headingSection`, style channels, content requirements;
- **the shape of the tree its template renders** — every element, and the
  full type of every child component, recursively.

A parent checks the contracts. Only typed locators and template contracts read
the shape. Each component computes its contracts once. The shape, however,
grows with the depth of the tree, and some composition sites re-expand it:

- a node choosing between two components (`flag ? A() : B()`);
- a component passed to a slot, mounted as a `forNode` row, or compared
  against a generic constraint;
- the declaration (`.d.ts`) of an exported component, which may fail with
  `TS7056: The inferred type of this node exceeds the maximum length the
  compiler will serialize`.

`sealComponent` keeps the contracts and drops the shape.

## Usage

Keep the definition plain, and seal the component where it is composed:

```ts
// workspace-browser.ts
import { craftComponent } from '@craft-ts/component';

export const WorkspaceBrowser = craftComponent(
  'WorkspaceBrowser',
  { providers: [provideWorkspace()] },
  function* () {
    const workspace = yield* Workspace();
    return div([Toolbar(), FileTree(), Preview()]);
  },
);
```

```ts
// shell.ts
import { craftComponent, div, sealComponent } from '@craft-ts/component';
import { WorkspaceBrowser } from './workspace-browser';

const SealedWorkspaceBrowser = sealComponent(WorkspaceBrowser);

export const Shell = craftComponent('Shell', {}, () =>
  div([flag ? SealedWorkspaceBrowser() : Welcome()]),
);
```

The component itself is returned untouched. Sealing only changes what its type
remembers, so there is nothing to change at runtime. Keeping the definition
unsealed keeps its own tests able to reach into its template (see
[Testing a sealed component](#testing-a-sealed-component)).

A library that publishes declaration files seals in its public index instead,
so the `.d.ts` no longer has to spell the template out (TS7056):

```ts
// index.ts of the library
import { WorkspaceBrowser as WorkspaceBrowserComponent } from './workspace-browser';
import { sealComponent } from '@craft-ts/component';

export const WorkspaceBrowser = sealComponent(WorkspaceBrowserComponent);
```

## What a sealed component keeps

| Contract | Still checked on a sealed component |
| --- | --- |
| Props and required inputs | yes: a missing input is still a compile error |
| Dependency contract (`ComponentDepsOf`, `RouteCheckedDI`) | yes: the component and every parent rendering it |
| Initialization exceptions | yes: rendering it without `catchNode` is still refused |
| Field exceptions | yes |
| `heading()` need | yes: the parent must still wrap it in `headingSection` |
| Style channels and content requirements | yes |
| `.pipe(...)` | yes, with the same operators and checks |
| Typed locators / template contracts reaching *into* it | no, they stop at the sealed boundary |

## When to seal

Sealing is one remedy for a type that grew too deep, not a default. Reach for
it when TypeScript reports one of these on a component tree:

- `TS2589: Type instantiation is excessively deep and possibly infinite`;
- `TS2321: Excessive stack depth comparing types`;
- `TS7056: The inferred type of this node exceeds the maximum length the
  compiler will serialize`;

or when `tsc --extendedDiagnostics` shows composition dominating the
instantiation count. Seal at the boundary the error points to: a node
choosing between components, a slot, a `forNode` row, an exported component.
Other remedies remain: split one huge template into child components, and for
a route collection, split it with `loadChildren`
([Scaling routes](/guide/routing/scaling)).

A sealed component costs about the same per nesting level as a plain one. The
difference shows where the plain one re-expands its tree: a node choosing
between two plain components overflows (TS2321) around 14 levels, while sealed
components compile 32 levels down. `npm run type-budget` checks these figures
on every change.

## Testing a sealed component

The register of `setupCraftComponentTemplateTest` — the services a test must
mock or declare — is the same whether a component, or a child it renders, is
sealed. Locating by tag, role, label or attribute works the same too.

What stops at a sealed boundary is everything that reads the template's
types: content locators (`result.locator('span', { content: 'status' })`) and
template contracts (`TemplateRendersNamedElementWhen`). Test the unsealed
component, which is why the definition stays plain and the seal sits where the
component is used:

```ts
// workspace-browser.spec.ts — the plain component keeps typed locators.
const result = await setupCraftComponentTemplateTest(WorkspaceBrowser, {
  inputs: {},
  register: { workspace: 'provided' },
});
result.locator('span', { content: 'workspaceName' });
```

A parent test cannot locate by content inside a sealed child. That is usually
right: a parent test should not depend on how a child renders.

## Never type a component by hand

Before: the annotation suggested to hide a component's template drops its
contracts with it.

```ts
// ✗ drops the dependency contract, the exceptions and the heading need
export const Panel: CraftComponent<PropsFromFactory<() => never>> = PanelImpl;
```

After:

```ts
// ✓ keeps every contract, drops only the template tree
export const Panel = sealComponent(PanelImpl);
```

Why it matters: `CraftComponent<Props>` has no dependency contract. A DI proof
on that component, or on any component rendering it, used to answer `true`
even with a provider missing. It now fails with:

```
The dependency contract of a component rendered in this component is unknown:
the value is not a component, or a component was typed by hand. Pass the
component itself to ComponentDepsOf, and seal a component with
sealComponent(Component) instead of typing it
```

`craft-ts/no-craft-component-return-type` reports the annotation in the
editor. It offers to remove it as a suggestion, not as an automatic fix,
because removing it can change what compiles. Use `sealComponent(...)` when
the annotation was there to keep the type small.

When a declaration needs to name the type, use `SealedComponent<typeof PanelImpl>`.
Never write the `CraftComponent<…>` arguments yourself.

## See Also

- [Components](/guide/components/)
- [Scaling routes](/guide/routing/scaling): DI proofs and when they fail closed
- [Testing components](/guide/testing/components)
- [ESLint rules](/guide/routing/eslint-rules)
