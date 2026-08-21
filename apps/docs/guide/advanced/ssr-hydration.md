# SSR and hydration

Craft can render a complete application to deterministic HTML on the server,
transfer its serializable state, and then attach the browser runtime to the
existing DOM. This runtime path does not require the Craft compiler.

**Use it when** the first response must contain useful HTML without rebuilding
the same component tree during browser startup.

## Render one isolated request

`renderCraft` creates a new platform, injector, primitive registry, in-memory
history, and storage pair for every call. Do not reuse its injector between
requests.

```ts
import { renderCraft } from '@craft-ts/component';
import { appConfig } from './app.config';

const controller = new AbortController();
const rendered = await renderCraft({
  config: appConfig,
  url: '/dashboard?page=2',
  signal: controller.signal,
  timeoutMs: 5_000,
});

return new Response(
  `<!doctype html><html><body>${rendered.html}</body></html>`,
  {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  },
);
```

The result separates `rootHtml`, collected `styles`, and the transfer
`snapshot`; `html` combines all three. `renderToString(component, options)` is
the smaller API when no application config is needed.

All app initializers are run before the server render. Aborting the request
rejects pending SSR work with the signal reason. A blocking render that exceeds
`timeoutMs` rejects with `CraftSsrTimeoutError` and lists the pending sources.
A route policy may set a shorter `timeoutMs` for the sources it blocks.

## Hydrate the existing DOM

Serve the generated `<craft-root>`, style element, and transfer script without
changing them. The browser entry point then uses the same app config. `startCraft`
chooses hydration when the SSR marker is present and falls back to a normal
client mount when the page was not rendered by Craft SSR:

```ts
import { startCraft } from '@craft-ts/component';
import { appConfig } from './app.config';

const app = startCraft({ config: appConfig });
```

Hydration restores the snapshot before creating primitives, claims elements,
text markers, and block boundaries by their structural keys, and attaches
bindings and listeners. A resolved transferred query therefore does not issue
the same initial request again. The transfer script and server style element
are removed after a successful first pass; the normal client style registry
then owns the styles.

Call `app.destroy()` when the application host is removed. Pass `host`,
`snapshot`, or `onMismatch` when the defaults are not appropriate.

Use `hydrateCraft` directly when the application needs to force hydration or
pass hydration-specific options.

## Choose what SSR does with pending data

The boundary that owns the pending UI owns its SSR policy. A query still only
describes data and its loader.

```ts
div(UserList()).pipe(
  pendingBlock({
    ssr: 'block',
    fallback: () => UserListSkeleton(),
  }),
);
```

The three modes are:

| Mode       | Server action                          | Initial HTML                             |
| ---------- | -------------------------------------- | ---------------------------------------- |
| `block`    | Starts and awaits the suspended source | Resolved content and query snapshot      |
| `fallback` | Does not await the source              | Boundary fallback                        |
| `client`   | Does not start the source              | Explicit browser-owned shell or fallback |

`client` requires an explicit fallback in the catch-all form. An exhaustive
boundary already supplies explicit source fallbacks.

A route can provide the page default:

```ts
craftRoute('dashboard', {
  path: 'dashboard',
  loadComponent: () => import('./dashboard'),
  ssr: { mode: 'block' },
});
```

The nearest local `pendingBlock` wins over the route policy. A read that
suspends without either policy fails with
`CraftUnhandledSsrResolutionError`; Craft never silently skips the loader or
waits forever. Reloading queries keep rendering their previous value and do
not suspend.

## Structural identity and local recovery

Hydration keys come from the component and template path, not from a global
counter or random id. Static children use their logical position, blocks use a
stable boundary segment, and `each` entries use the declared business key.
Server and client must therefore execute the same template structure and use
stable `each` keys.

If a key is absent, a tag differs, text changed, or a dynamic branch no longer
matches, Craft recreates that local subtree and keeps compatible siblings. In
development it also reports a `HydrationMismatchError` containing the key,
expected node, actual node, and reason.

## Transfer snapshot rules

Only values composed of JSON primitives, plain objects, and arrays are
transferred. Functions, `bigint`, class instances, and cycles fail explicitly.
Unreadable or absent primitive values are omitted. Query entries include their
status, resolved value when present, and a plain `{ name, message }` error when
the runtime exposes one.

`serializeCraftTransferSnapshot` escapes `<`, `>`, `&`, U+2028, and U+2029, so
the JSON cannot close its `application/json` script element. Treat the snapshot
as application data nevertheless: do not place secrets in state that reaches
the browser.

## Current scope

This first runtime release covers full-page hydration, deterministic HTML,
CSS collection, state/query transfer, async boundary policies, keyed `each`
recovery, and local mismatch remounts. Streaming, resumability, islands,
cross-boundary event replay, compiler-generated renderers, and a direct
server-function transport are later work.
