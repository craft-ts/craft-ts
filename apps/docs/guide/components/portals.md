# Portals

Use `portalNode(target, children)` for a menu, tooltip, dialog or toast that must
escape its component's DOM ancestors. A `transform`, `filter`, or
`contain: layout paint` on a pane can otherwise offset and clip fixed overlays.

```typescript
import { craftComponent, div, ifNode, portalNode } from '@craft-ts/component';

const Menu = craftComponent('Menu', {}, () => div([
  Trigger({}),
  portalNode('body', ifNode(MenuView.open, () => MenuSurface({}))),
]));
```

The portal places its children directly under the target, without a wrapper.
They retain the declaring template's injector, reactive scope, scoped styles,
security checks and render tracing. Removing the portal or destroying its owner
removes the remote content and releases its bindings and child components.
Native DOM events bubble through the target's DOM ancestors.

## Targets and updates

The target can be `'body'`, an element in the declaring document, or a function
returning such an element. The function runs in the template's injection and
reactive context; reading a signal there lets the portal follow a changing
host. Moving targets preserves the existing child view and its local state.

```typescript
portalNode(() => overlayRoot(), () => MenuSurface({}));
```

Children can be a node, an array, or a function returning nodes. Conditional
content belongs inside the portal or can own the portal itself. An application
can provide its overlay root through a service, then pass that element to
`portalNode`. Put inherited theme variables on that target or the document root.

Positioning, focus handling and dismissal remain the responsibility of the
menu or dialog. A portal only changes where its view is mounted.

## Server rendering and hydration

`'body'` resolves against the current browser or server document. `renderCraft`
returns `portalHtml` alongside `rootHtml`; its complete `html` already includes
both, followed by the transfer snapshot. A server shell using the separate
fields should put `portalHtml` at the end of its body.

Hydration claims the existing remote nodes using their declaring application's
hydration identities. It preserves their DOM identity, removes server portals
that the client no longer renders, and leaves unrelated document content alone.
Remote content counts toward the SSR HTML size budget.
