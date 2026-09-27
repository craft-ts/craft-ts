# Global foundation and fonts

An app built on `@craft-ts/style` has no `styles.css`. What used to go there
falls into three layers, and craft-ts writes the first two for you:

| layer          | written by                   | what it holds                                                            |
| -------------- | ---------------------------- | ------------------------------------------------------------------------ |
| `craft.reset`  | craft-ts, on by default      | a modern reset                                                           |
| `craft.base`   | craft-ts, on by default      | colour scheme, focus ring, reduced motion, selection, form accent        |
| `craft.global` | your app, `craftGlobalStyles` | your theme variables on `:root`, element defaults (`body`, `a`, …)       |

They come before the component layers. The full order is fixed by the emitter,
whatever order your modules are imported in:

```css
@layer craft.reset, craft.base, craft.tokens, craft.global,
       craft.components, craft.variants, craft.overrides;
```

Every layer is named `craft.*`. A third-party stylesheet that arrives unlayered
wins over all of them — that is how CSS treats unlayered styles — which is
exactly why one should be rare, deliberate and attested.

## The reset

On by default. It sets `box-sizing: border-box` everywhere, removes default
margins, makes media blocks that never overflow (`max-inline-size: 100%`), lets
form controls inherit the document font, balances headings and avoids orphans
in paragraphs (`text-wrap`), wraps long words (`overflow-wrap: anywhere`) and
stops mobile browsers from inflating text.

It is written with the typed vocabulary, like any sheet
([`libs/style/src/lib/global/reset.ts`](https://github.com/craft-ts/craft-ts/blob/main/libs/style/src/lib/global/reset.ts)).
Turning it off is a deliberate choice:

```ts
craftStyle({ reset: false });
```

## The base

Also on by default (`base: false` to opt out). It states once, for the whole
document, what components used to have to remember one by one:

- `color-scheme` follows the `scheme` axis, so scrollbars and form controls
  turn dark with the page;
- every `:focus-visible` gets a visible ring;
- scrolling is smooth only for users who did not ask for less motion, and
  under `prefers-reduced-motion` **every** animation and transition collapses
  to an instant. The guard is `!important` in the earliest layer, the one
  place that beats every later layer, so no component can forget it;
- `accent-color` and `::selection` come from the theme.

The colours and sizes are typed theme variables, exported as `craftBase`:
`accent`, `focusRing`, `focusWidth`, `focusOffset`, `selectionBg`,
`selectionInk`. Re-theme them from your own global styles (below).

## Your app's globals

<<< @/tests/snippets/guide/style/foundation/global.spec.ts#globals

`root` goes on `:root`, `elements` on tag names — the only selectors accepted.
Anything narrower than an element belongs to a component sheet. The items are
the same as in a sheet: generated properties, `set(...)`, `when(...)`, and
`pseudo.*`. `when` on a state axis becomes an attribute on `:root`, which is
how a theme toggle is written (`when(theme.dark, [...])` →
`:root[data-theme='dark']`).

`no-raw-css-value` applies here as everywhere else: no literal reaches a
helper.

## Fonts

<<< @/tests/snippets/guide/style/foundation/global.spec.ts#font

`defineFont` replaces the three things a `styles.css` used to carry:

- **the `@import url(fonts.googleapis…)`** — the plugin injects a `preconnect`
  to both Google origins, then the stylesheet preloaded and applied, into
  `<head>` of `index.html`. An `@import` inside the CSS could only be
  discovered once the CSS itself had downloaded;
- **the `@font-face` blocks** — `localFont({ files: [...] })` emits them, and
  preloads the `.woff2` files;
- **the `* { font-family: … !important }`** — the returned token is a family
  stack, used once with `fontFamily(bodyFont)` on `body` and inherited from
  there. Form controls inherit it through the reset.

A server renderer that writes `<head>` itself reads the same tags as HTML:

```ts
import head from 'virtual:craft-style-head';
```

### Fallback without layout shift

While the web font loads, the fallback font is shown, and the text jumps when
the real one arrives. `adjustFallback` builds a `"<family> Fallback"` face from
a local font, resized so both occupy the same space:

```ts
defineFont('body', {
  family: 'Chivo',
  source: googleFont({ weights: [400, 700] }),
  fallback: 'system-ui',
  adjustFallback: {
    // The web font's metrics, in font units. Capsize publishes them for every
    // Google font (@capsizecss/metrics).
    metrics: {
      unitsPerEm: 1000,
      ascent: 954,
      descent: -250,
      lineGap: 0,
      xWidthAvg: 505,
    },
    // Optional, Arial by default: `face: { local: 'Helvetica', metrics }`.
  },
});
```

`size-adjust` matches the average glyph width, so lines break at the same
place; `ascent-override`, `descent-override` and `line-gap-override` keep the
line height.

## What this replaces in the ESLint rules

`require-focus-visible` and `require-reduced-motion` used to read each
component's CSS text to check that a focus ring and a reduced-motion branch
were there. The base layer guarantees both for the whole document, so a
component no longer has anything to prove.
