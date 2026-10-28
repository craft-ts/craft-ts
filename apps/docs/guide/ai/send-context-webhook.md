# Send application context to AI

`provideSendContextToAi` adds a developer-oriented context inspector to a Craft
application. It is useful when an AI assistant needs more than a copied error
message: the selected component, the recent user journey, the relevant app
state, and optionally the DOM and computed CSS.

Typical uses include:

- asking an AI assistant to explain or fix a broken screen;
- preparing a reproducible bug report or a support ticket;
- investigating a failed HTTP request, navigation, mutation, or query;
- sending a consistent, structured context to an internal debugging agent.

The feature is user-driven. It does not call an AI service by itself. Without
an `endpoint`, everything stays in the browser and the user copies the prompt
when they choose to. Recording defaults to `true` and starts a session clip
automatically at app startup; set it to `false` to wait until the user clicks
**Record**. In either mode, the user can stop and manually start recording from
the timeline controls. Events are only captured while a recording clip is active.

## Minimal setup

Register the provider once in the application providers. The default UI then
adds an `AI context` launcher in the bottom-right corner and a context menu to
Craft component hosts. Drag the grip icon beside the launcher to move it out
of the way. The launcher stays within the viewport and keeps its position when
the chat opens and closes. The grip also accepts arrow keys; double-click it to
restore the application's default position.

The minimal setup uses the default session recording behavior:

<<< @/tests/snippets/guide/ai/send-context-webhook.spec.ts#minimal

The two entry points are equivalent:

- open the launcher to start with an empty context, then interact with the app;
- right-click a component to start with that component already selected.

The panel contains an instruction, selected elements, and the action timeline.
The timeline is collapsed initially; use **Show** to inspect its events.
Choose **+ Select an element**, then click anywhere in the application to add a
new target without triggering its action or losing the current instruction.
The cursor changes to a crosshair while the picker is active.
**Escape** or **Cancel selection** cancels the picker. Right-clicking a component
and choosing **Add to AI context** also adds another target to the same draft.
Selected elements can be removed individually.

The two checkboxes control whether to include the action timeline and the full
page. The instruction and selected component context are always included.

## What is collected

The session combines several kinds of context:

- **Selected elements**: tag name, text, outer HTML, and optionally a selector.
- **Component information**: the host name, Craft host tags, click coordinates,
  the clicked element, and truncated host HTML.
- **Timeline**: DOM interactions, HTTP requests, router activity, primitive
  activity, and app snapshot reports. HTTP and navigation entries are linked by
  operation and correlation IDs when those services provide them.
- **App snapshots**: the reports emitted by the app snapshot registry while the
  context is being prepared.
- **DOM and CSS captures**: the selected component or the full page, including
  computed styles. These captures are optional because they can be large and
  briefly pause the page while they are collected.

The default prompt contains selected elements, component information, the
timeline summary, and app snapshots when they exist. **Include full page** adds
the page DOM and computed CSS, excluding the AI overlay itself. It can produce
a large prompt. JSON export and replay controls are kept out of this panel.

**Clear** removes the current timeline and, if recording was active, starts a
fresh clip so the next interactions form a focused reproduction. Clearing keeps
the instruction and selected targets. A stopped recording stays stopped.

Programmatic session exports and replay APIs remain available for debugging
integrations. Use `session.exportSessionJson()` to obtain a portable session;
the AI panel's **Copy prompt** action produces the context for an assistant.

## Match the application's colours

Pass partial light and dark palettes with `theme`. Each colour accepts a CSS
colour, a CSS variable reference, or a typed Craft style colour token. Unspecified
colours keep their defaults; dark values override the light palette for the
selected colour scheme. By default, the overlay follows the document's
`data-mode` attribute when present, then falls back to the browser preference.
Set `colorScheme` to `system`, `light`, or `dark` to choose explicitly. The
palette applies to the launcher, context menu, and panel.

<<< @/tests/snippets/guide/ai/send-context-webhook.spec.ts#theme

The most common keys are `bg`, `surface`, `surface-muted`, `control-bg`, `text`,
`text-muted`, `border`, `border-subtle`, `accent`, `accent-hover`, `accent-text`,
`on-accent`, and `focus`. `SendContextColors` exposes all supported colour keys.
CSS variables can point directly to the application's existing theme, so its
colours can change without replacing this provider.

Set `launcherLabel` to change the default floating button's visible text:

```ts
provideSendContextToAi({
  recording: false,
  launcherLabel: 'Share context',
});
```

For a different icon, layout, or behavior, provide a custom launcher component
with `provideSendContextLauncherComponent`. The `theme` palette also applies to
the built-in launcher.

## Send the context to an agent

Pass a browser-accessible webhook URL to enable the `Send` action. For example,
the endpoint can create a support ticket or forward the payload to an email
service; that server-side integration stays in your application:

<<< @/tests/snippets/guide/ai/send-context-webhook.spec.ts#configuration

The browser sends a JSON `POST` with this versioned shape:

```json
{
  "version": 1,
  "prompt": "# Instruction\nInvestigate this screen",
  "instruction": "Investigate this screen",
  "selectedElements": [],
  "events": [],
  "snapshot": [],
  "captures": {},
  "component": {
    "hostName": "OrdersPage",
    "tagList": ["component:OrdersPage#1"],
    "coords": { "x": 120, "y": 80 },
    "outerHTML": "<section>…</section>"
  }
}
```

`prompt` is generated from the instruction, the selected options, and the
structured fields. `component` is omitted when the chat was opened from the
launcher without a captured component. `captures.page` is present when **Include full page** is selected.
Unchecking **Include action timeline** removes events from both the prompt and
the structured payload. Events generated by the webhook request itself are excluded from
the context sent to that webhook.

Set `sendButtonLabel` to match the destination, such as `Send to support`.

Any `2xx` response is successful, including `200`, `202`, and `204`. Network
failures, timeouts, and non-`2xx` responses are shown in the chat. `Retry`
reuses the exact same payload. **Copy prompt** remains available after a
failed request.

The endpoint is application configuration shipped to the browser, not a
secret. It must allow the application's origin through CORS and accept JSON
`POST` requests. Put authentication and secret management in a protected
same-origin proxy or agent gateway.

## Configure the webhook

`provideSendContextToAi` currently accepts the browser-accessible `endpoint`.
Omit it to keep the experience copy-only, or pass a URL to enable sending:

<<< @/tests/snippets/guide/ai/send-context-webhook.spec.ts#endpoint-configuration

Treat that URL as public application configuration. Put authentication,
redaction, and any tenant-specific policy in a protected same-origin proxy or
agent gateway; never put credentials in the browser bundle.

The session and its record controller are also injectable:

```ts
import {
  SEND_CONTEXT_RECORD_CONTROLLER,
  SEND_CONTEXT_SESSION,
} from '@craft-ts/component';
import { ɵinject as inject } from '@craft-ts/core';

const record = inject(SEND_CONTEXT_RECORD_CONTROLLER);
record.startRecord('Checkout failure');

// Later, from the same application flow:
record.stopRecord();
const summary = record.exportSummary();
const json = record.exportJson();

const session = inject(SEND_CONTEXT_SESSION);
session.capture('custom', 'emitted', {
  name: 'checkout.validation',
  state: { step: 'payment' },
});
```

Use the record controller for clips and the session for low-level event
emission, subscription, clearing, and programmatic export.

## Customize the UI with DI

There are four levels of UI customization:

| Provider                                                                  | What it replaces or adds                  | When to use it                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `provideSendContextToAi({ launcherLabel: 'Share context' })`              | The default launcher text                 | Change the visible button label                                    |
| `provideSendContextChatComponent(() => MyChat)`                           | The default chat panel                    | Keep the built-in launcher and context menu, but replace the panel |
| `provideSendContextUiRenderer(() => MyRenderer)`                          | The complete renderer                     | Own the launcher/chat lifecycle and render the whole experience    |
| `provideSendContextLauncherComponent(() => MyLauncher)` / `provideSendContextContextMenuComponent(() => MyMenu)` | The floating launcher or right-click menu | Match the application's controls or visual language                |

The complete renderer receives `SendContextUiContext`. It exposes the live
session, events, clips, selected targets, captured payload, DOM capture element,
recording state, endpoint, and operations such as `addTarget`, `removeTarget`,
`selectClip`, `pickTarget`, `cancelTargetSelection`, and `close`. The optional
`selectingTarget` property reports whether the picker is active.

```ts
import {
  provideSendContextChatComponent,
  provideSendContextUiRenderer,
  type SendContextUiContext,
} from '@craft-ts/component';

// A chat replacement keeps the default surrounding behavior.
provideSendContextChatComponent(() => MyChat);

// A complete renderer receives the live context as its `context` input.
provideSendContextUiRenderer(() => MyRenderer);

// MyRenderer's input contract is:
// { context: Input<SendContextUiContext>; onClose: Output<() => void> }
```

`provideSendContextChatSection`, `provideSendContextChatAction`, and
`provideSendContextExportSection` are multi providers intended for a custom
renderer. They let feature libraries contribute sections, commands, or export
views without depending on one global renderer. The built-in chat does not
render those extension entries itself; a custom renderer reads them from
`SendContextUiContext`.

For example, a feature can contribute an action that starts a named clip:

```ts
import { provideSendContextChatAction } from '@craft-ts/component';

const providers = [
  provideSendContextChatAction({
    id: 'record-checkout',
    label: 'Record checkout flow',
    run: (context) => context.session.startRecord('Checkout flow'),
  }),
];
```

The UI provider tokens are regular DI contracts, so a custom launcher or menu
can be registered directly:

```ts
import {
  SEND_CONTEXT_CONTEXT_MENU_COMPONENT,
  SEND_CONTEXT_LAUNCHER_COMPONENT,
} from '@craft-ts/component';

const providers = [
  {
    provide: SEND_CONTEXT_LAUNCHER_COMPONENT,
    useValue: MyLauncher,
  },
  {
    provide: SEND_CONTEXT_CONTEXT_MENU_COMPONENT,
    useValue: MyContextMenu,
  },
];
```

## Complete integration example

An application can combine the default UI, a protected endpoint, stricter
retention, and application-specific event filtering:

```ts
import { craftAppConfig } from '@craft-ts/core';
import {
  provideSendContextEventFilter,
  provideSendContextToAi,
  SEND_CONTEXT_RETENTION_POLICY,
} from '@craft-ts/component';

export const appConfig = craftAppConfig({
  providers: [
    provideSendContextToAi({
      recording: true,
      endpoint: '/internal/ai/context',
    }),
    {
      provide: SEND_CONTEXT_RETENTION_POLICY,
      useValue: { maxEvents: 250, maxBytes: 1024 * 1024 },
    },
    provideSendContextEventFilter((event) => event.name !== 'healthcheck'),
  ],
});
```

The server-side endpoint should validate `version`, authenticate the user,
apply any additional server-side redaction, and then forward either `prompt`
or the structured context to the selected agent.
