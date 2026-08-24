# Accessibility

Craft already enforces exhaustive exceptions, `pendingNode`, and reactive
templates. Accessibility follows the same DNA: **an illegal state doesn't
compile, an omission is an ESLint error, the block runtime doesn't wait for
the author to remember.**

Target: **WCAG 2.2 level AA**.

## The five layers

1. **Types** — `img` and `area` require `alt` (including a decorative `''`).
   Semantic helpers (`dialog`, `fieldset`, `table`, `iframe`, `h4`–`h6`,
   `svg`…) exist so the lint applies without going through `h()`.
2. **ESLint `craft-ts/a11y`** — accessible name, labels, ARIA, no click on a
   `div`, `button` with `type`, `h()` forbidden when a named helper exists.
3. **Block runtime** — `pendingNode` announces the fallback (`aria-live`,
   `aria-busy`), `catchNode` sets `role="alert"`, `deferNode` renders a keyboard
   placeholder, `CraftRouterLink` sets `aria-current="page"`.
4. **Primitives** — `heading` / `headingSection` (relative outline), `dialog`
   (native modal + focus), `liveRegion` (toasts). No **styled** button:
   `buttonControl` / `fieldControl` / `disclosureControl` inject accessibility
   props into your native elements.
5. **Tests** — `toBeAccessible()` on the template helper.

```ts
import craftRules from '@craft-ts/dev-tools/eslint-rules';

export default [
  {
    files: ['**/*.ts'],
    plugins: { 'craft-ts': craftRules },
    rules: {
      ...craftRules.configs.a11y.rules,
    },
  },
];
```

The rules are `error` in the preset. A disable is a documented deviation,
not the default path.

## Hyperscript templates

A Craft template is TypeScript, not an `.html` file: accessibility rules
operate on the hyperscript calls themselves — `button(...)`, `img(...)` **and**
`h('img', …)`.

```ts
img({ src: photo.url, alt: photo.title }); // decorative: alt: ''
button({ type: 'button' }, 'Save');
a({ href: '/tasks' }, 'Tasks');
label({ htmlFor: 'email' }, 'Email');
input({ id: 'email', type: 'email' });
```

`h('button')` when a named helper exists is an error
(`prefer-named-html-helpers`): it's a bypass of the types.

## Heading outline

An `h3` inside a Card is a classic false positive: sometimes under an `h1`,
sometimes under an `h2`. The title doesn't choose its rank. **The parent
supplies it.**

```ts
heading('Task list');

headingSection([
  heading('Detail'),
  TaskCard(), // the internal heading() becomes hN+1
]);
```

The snippet above is the core of the API. The skip-link and `main` belong to
the application shell:

- `heading()` reads the current level (1–6) and renders `h1`…`h6`.
- `headingSection(...)` increments by one for the subtree — comment
  fragments, no DOM wrapper, like `ifNode`.
- `headingRoot(...)` resets to `h1` (dialog, explicit reset). A `dialog` also
  sets its own outline root (the dialog title = level 1 **inside** the
  dialog). SFCs loaded via `loadComponent` stay on `heading()`.
- `h1()`…`h6()` remain for raw HTML. The `prefer-relative-heading` rule
  forbids them inside a `craftComponent` (outside specs).

A reusable component exposes `heading()` without a local `headingSection`:
the need for an outline **bubbles up** to the parent. Calling this component
outside a `headingSection` **doesn't compile** (same DNA as `pendingNode`).

Any SFC mounted via `loadComponent` / `loadCraftComponent` calls `heading()` —
not `headingRoot()`. The rank (h1 vs h2+) comes from the parent:

- **Page** (sibling under the shell): `heading()` is the h1.
- **Layout** (SFC with `CraftRouterOutlet`): `heading()` +
  `headingSection([…, CraftRouterOutlet()])` so the child inherits h2+.
- **Shell** (`App`): `skipLink` + `main` + `CraftRouterOutlet`, **without**
  `heading()` above the outlet. Otherwise two h1s, or children stuck at the
  same level as the chrome's title.

`require-route-heading-outline` reads the lazy target.
`require-outlet-heading-section` distinguishes layout from shell. The types
don't connect the outlet to the routed child.

```ts
// Shell — no heading() above the outlet
skipLink('main', 'Skip to content');
main({ id: 'main', tabIndex: -1 }, CraftRouterOutlet());

// Layout — title + outlet inside headingSection
heading('Team');
headingSection([CraftRouterOutlet()]);

// Page (loadComponent) — heading() only; h1 or h2+ depending on the parent
heading('Task list');
headingSection([
  heading('Detail'),
  TaskCard(),
]);
```

## Blocks

`pendingNode` detaches the source from the document while loading (the
nodes stay mounted, they aren't CSS `hidden`). The fallback is wrapped in
`aria-live="polite"` `aria-atomic="true"` `aria-busy="true"`. On reload, the
source stays visible; `aria-busy` signals the refresh. Focus in the source is
restored when it resumes.

`catchNode` wraps the error message in `role="alert"` if the fallback isn't
already a live region.

`deferNode` sets `aria-busy` while loading. An `interaction` trigger on a
placeholder that isn't already a control gets `role="button"` and
`tabIndex="0"`, and only fires on keyboard via Enter / Space.

## Dialog and live region

```ts
dialog(
  { labelledBy: 'title', open: true, onClose },
  [heading({ id: 'title' }, 'Confirm'), button({ type: 'button', click: onClose }, 'Close')],
);

liveRegion({ politeness: 'polite' }, copied() ? 'Copied' : '');
```

`dialog` relies on the native `<dialog>` (`showModal`, Escape, `aria-modal`).
`liveRegion` is a `<span role="status">` (or `alert` if `assertive`).

## Control helpers (props to merge)

The helpers are renderless: they supply the attributes to merge onto your own
HTML elements, without imposing a visual widget.

```ts
const email = fieldControl('email');
label(email.label, 'Email');
input({ ...email.input, type: 'email' });
p(email.description, 'We never share your email.');

const faq = disclosureControl('faq-1', isOpen);
button({ ...faq.button, click: toggle }, 'What is Craft?');
div(faq.panel, '…');

button(buttonControl({ disabled: isSaving, keepFocusable: true }), 'Save');
```

A closed panel gets `hidden` and `aria-hidden`, so no focus stays inside it.
`keepFocusable` sets `aria-disabled` without `disabled`: the click isn't cut
off, the author must no-op the handler.

The states are also exposed as `data-*`, which allows a simple CSS
convention independent of the component:

```css
button[data-disabled] { opacity: 0.5; }
input[data-invalid] { border-color: var(--danger); }
button[data-open] { font-weight: 600; }
```

A live region must be mounted from the very first render: never condition
its node on the message. This lets the screen reader subscribe to it before
any event happens.

```ts
// correct — region exists at first paint
liveRegion({ label: 'Notifications' }, copied() ? 'Copied' : '');

// incorrect — SR never subscribes
ifNode(copied, () => liveRegion('Copied'));
```

## Navigation

`provideCraftRouter` registers `CraftTitleStrategy`: the route's `title` is
written via `BrowserDocument.setTitle`.

`withA11yNavigationFocus()` (opt-in, passed to `provideCraftRouter`) moves
focus to `#main` / `<main>` after each internal navigation — not on first
load, the skip-link handles that.

`skipLink('main', 'Skip to content')` at the top of the shell, with
`main({ id: 'main', tabIndex: -1 }, …)`.

To sync the document's language and direction from a generator:

```ts
yield* BrowserDocument.setLang('en');
yield* BrowserDocument.setDir('ltr');
```

`clickFocus` sets focus before running the handler, useful for controls that
open a search or a dialog:

```ts
button({
  type: 'button',
  click: clickFocus('#search-warmup', openSearch),
}, 'Search');
```

## Tests

```ts
const { getByRole, getByLabel, toBeAccessible } =
  await setupCraftComponentTemplateTest(
    Page,
    { context },
  );
await toBeAccessible();
getByRole('button', { name: 'Save' });
getByLabel('Email');
```

`assertAccessible` / `toBeAccessible()` cover the structural checks (alt,
accessible name, tabindex, iframe title). Real contrast and the rest of
WCAG 2.2 AA remain a job for axe / AccessLint in application CI.

## CSS

The `require-focus-visible` and `require-reduced-motion` rules apply to the
`styles` of a `craftComponent`: if you style `button` / `a` / `input`, define
`:focus-visible`; if you animate, gate it with `prefers-reduced-motion`.
Contrast goes through tokens (`no-hardcoded-design-values`), not a second CSS
linter.
