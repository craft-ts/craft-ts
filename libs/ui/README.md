# @craft-ts/ui

The Herbier design system, as a library: a theme (palette, fonts, motion, the
four seasons, light and dark) and the components built on it — buttons, badges,
callouts, fields, switches, tabs, code blocks, toasts, dialogs, menus and the
appearance controls.

This is the one copy. It is not published to npm:

- the docs site (`libs/docs-ui`, `apps/docs-herbier`) reads it from the
  workspace;
- the demo (`apps/demo`) reads it from the workspace, and the release **copies
  `libs/ui/src` next to the demo** when it exports the demo to the StackBlitz
  repository (`syncDemoWorkspace` in `tools/release-local.mjs`), with the
  specifiers `@craft-ts/ui` and `@craft-ts/ui/style` mapped to that copy. The
  components are therefore in the StackBlitz project, readable and editable.

## Using it

```ts
import { button } from '@craft-ts/component';
import { buttonUi } from '@craft-ts/ui';

button(
  'save',
  { class: buttonUi.root, 'data-variant': 'primary', type: 'button' },
  'Save',
);
```

A `*.style.ts` reads the theme from `@craft-ts/ui/style` (vocabulary only, safe
to evaluate in Node):

```ts
import { theme } from '@craft-ts/ui/style';
```

| entry                | what it is                                                                      |
| -------------------- | ------------------------------------------------------------------------------- |
| `@craft-ts/ui`       | the components, their sheets (`buttonUi`, `badgeUi`, …) and the theme variables |
| `@craft-ts/ui/style` | the theme and the sheets a `*.style.ts` may import, with no component           |

## Appearance

`data-mode` (`light` | `dark`) and `data-season` on the document root drive every
colour and drawing. `bootScript()` returns the few lines to put inline in the
`<head>` so they are written before the first paint, and `DocModeToggle` /
`DocSeasonPicker` change them afterwards. The choice is kept in `localStorage`
under `craft-mode` and `craft-season`.

## Keeping the export working

The export copies the sources and nothing else, so everything under `src`
imports only `@craft-ts/core`, `@craft-ts/component`, `@craft-ts/style` (all
three are dependencies of the exported project) and its own files — never
another library of the workspace, never a path outside `libs/ui/src`. A spec of
`tools/release-local.test.mjs` copies the sources and checks it.
