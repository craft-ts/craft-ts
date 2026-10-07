/**
 * The Herbier foundation: palette, theme variables, axes, fonts and motion.
 *
 * Every other sheet of the package reads from here, and nothing here reads from
 * a component. A `*.style.ts` imports vocabulary only (`style-file-boundary`),
 * which is what lets the build plugin evaluate it in Node.
 *
 * Herbier is a pressed-plant page: warm paper, spruce for the action, sage for
 * what is selected, one tone per kind of message. Every token carries its night
 * side too, so the dark theme is the same sheet read the other way.
 *
 * Two rules shape every value below:
 *
 * - **No alpha and no `color-mix`.** The vocabulary refuses `rgba(…)`, so each
 *   tint the mock-up computes at run time is a plain opaque token, computed
 *   once. A colour over a colour is two colours, and a contrast proof reads
 *   exactly one.
 * - **The theme name lives here and nowhere else.** Components read the
 *   variables of `theme`, never a palette token (the code surface, dark in both
 *   modes, is the one documented exception).
 */
import {
  animate,
  at,
  craftBase,
  defineBreakpoints,
  craftGlobalStyles,
  bg,
  color,
  cssVars,
  darkOf,
  defineFont,
  definePalette,
  defineStateAxis,
  easing,
  font,
  fontFamily,
  googleFont,
  insetBlockStart,
  keyframes,
  kind,
  num,
  opacity,
  position,
  scheme,
  set,
  space,
  text,
  unit,
  unsafeLength,
  when,
  type ColorValue,
} from '@craft-ts/style';

export const herbier = definePalette('herbier', {
  surface: {
    page: { light: '#F2EEE3', dark: '#0F1914' },
    raised: { light: '#FAF7EF', dark: '#15231C' },
    selected: { light: '#DDE5D2', dark: '#1B2E24' },
    selectedHover: { light: '#C1CFBC', dark: '#2E4638' },
    selectedActive: { light: '#ACBFAB', dark: '#3B5847' },
    navHover: { light: '#E5E9D9', dark: '#16261E' },
    // Nothing at all: the fill of a link-style button, whose background must
    // not paint a patch of page colour over a card. The vocabulary has no
    // `transparent` keyword and refuses alpha in a value, so it is a token.
    clear: { light: '#00000000', dark: '#00000000' },
    // The code surface is dark on purpose, in both themes: one set of syntax
    // colours to prove, and the part of a page that reads as a console.
    code: { light: '#17261F', dark: '#0B130F' },
    // Marked lines inside a code block: the code surface mixed with the colour
    // of the mark. Light sits near 8 % because the comment colour falls under
    // AA past that; the night side has room for more.
    codeHighlight: { light: '#22332D', dark: '#202C2A' },
    codeAdd: { light: '#243529', dark: '#212C21' },
    codeRemove: { light: '#2C322C', dark: '#2F2927' },
    codeWarning: { light: '#293324', dark: '#292A1A' },
    info: { light: '#DDE8EC', dark: '#1B2C33' },
    tip: { light: '#DDE5D2', dark: '#1B2E24' },
    important: { light: '#F3E7C4', dark: '#2A2515' },
    warning: { light: '#F5E1D6', dark: '#2E1E16' },
    danger: { light: '#F2DCDD', dark: '#331C20' },
  },
  text: {
    strong: { light: '#1E2B24', dark: '#E6E4D6' },
    body: { light: '#1E2B24', dark: '#E6E4D6' },
    muted: { light: '#46544B', dark: '#B5C2B6' },
    // Labels, and the outline of a control (3:1 is enough there).
    subtle: { light: '#566459', dark: '#94A497' },
    link: { light: '#234536', dark: '#A9D9B8' },
    // Syntax colours. Light and dark are the same: the code surface is.
    codePlain: { light: '#E6E4D6', dark: '#E6E4D6' },
    codeKeyword: { light: '#A9C98F', dark: '#A9C98F' },
    codeFunction: { light: '#E8D6A0', dark: '#E8D6A0' },
    codeString: { light: '#BFD6C2', dark: '#BFD6C2' },
    codeNumber: { light: '#E39A72', dark: '#E39A72' },
    codeType: { light: '#9EC3D0', dark: '#9EC3D0' },
    codeComment: { light: '#8DA093', dark: '#8DA093' },
    codePunctuation: { light: '#B5C2B6', dark: '#B5C2B6' },
    // Glyphs of the marked lines, and the colour of each mark's gutter rule.
    codeHighlight: { light: '#9EC3D0', dark: '#9EC3D0' },
    codeAdd: { light: '#A9C98F', dark: '#A9C98F' },
    codeRemove: { light: '#EC9AA3', dark: '#EC9AA3' },
    codeWarning: { light: '#E0B65A', dark: '#E0B65A' },
    info: { light: '#3F6272', dark: '#9CC4D6' },
    tip: { light: '#234536', dark: '#A9D9B8' },
    important: { light: '#7C5A0B', dark: '#E0B65A' },
    warning: { light: '#9A4727', dark: '#E39A72' },
    danger: { light: '#8E2F3C', dark: '#EC9AA3' },
  },
  border: {
    subtle: { light: '#CFC9B6', dark: '#2A3B31' },
    // The outline of a field and of a secondary button: `text.subtle`.
    strong: { light: '#566459', dark: '#94A497' },
    // A callout's edge: its tone at 38 % over its own surface.
    tip: { light: '#96A897', dark: '#516F5C' },
    info: { light: '#A1B5BE', dark: '#4C6671' },
    important: { light: '#C6B17E', dark: '#6F5C2F' },
    warning: { light: '#D2A694', dark: '#734D39' },
    danger: { light: '#CC9AA0', dark: '#794C52' },
    // The halo of a focused field: spruce at 28 % over the card.
    focusHalo: { light: '#C1CCC0', dark: '#375041' },
    // The rule under the bar of a code block.
    codeLine: { light: '#2A3731', dark: '#1F2622' },
  },
  accent: {
    action: { light: '#2F5D46', dark: '#8FC3A0' },
    actionHover: { light: '#234536', dark: '#A9D9B8' },
    actionActive: { light: '#1C372B', dark: '#BAE1C6' },
    // Text on `action` and on the solid danger button.
    onAction: { light: '#F7F4EA', dark: '#0E1A14' },
    danger: { light: '#8E2F3C', dark: '#EC9AA3' },
    dangerHover: { light: '#7D2935', dark: '#EEA6AE' },
    dangerActive: { light: '#722630', dark: '#F0AEB5' },
    // Decoration only. Never text.
    decor: { light: '#6E8F5C', dark: '#7FA88A' },
  },
  // The hero: five planes of spruce from the far ridge to the foreground, and the
  // contour lines (the spruce at 20 % over the paper, computed once).
  decor: {
    forestBack: { light: '#D6DFCB', dark: '#27402F' },
    forestRidge: { light: '#BBCBAE', dark: '#1F362A' },
    forestMiddle: { light: '#8FAB93', dark: '#182C22' },
    forestNear: { light: '#456F59', dark: '#101F17' },
    forestFront: { light: '#27483B', dark: '#09120D' },
    contour: { light: '#CBD1C4', dark: '#243430' },
  },
  // A soft shadow is a flat, blurred colour: opaque, like everything else.
  effect: {
    shadow: { light: '#D9D7CC', dark: '#090F0C' },
  },
});

/**
 * Which kind of message a callout, a badge or a toast carries. The five
 * VitePress containers and the five GitHub alerts both map onto these: NOTE is
 * `info`, CAUTION is `danger`. `important` is ochre, which also serves the
 * "BETA" label of the mock-up through a custom caption.
 */
export const tone = defineStateAxis('tone', [
  'info',
  'tip',
  'important',
  'warning',
  'danger',
] as const);

/**
 * Forces a theme whatever the user agent prefers: `data-mode` on the document
 * root is the appearance toggle, and a route that is always dark sets it to
 * `dark` while it is active. Global rules only reach `:root`; forcing a theme
 * on a subtree takes a scope class (see `scope.style.ts`).
 */
export const mode = defineStateAxis('mode', ['light', 'dark'] as const);

const themed = { inherits: true } as const;

/**
 * Theme variables. They inherit, because they are set once on the root and read
 * by everything below; the initial value is the light side.
 */
export const theme = cssVars('herbier', {
  surface: kind.color(herbier.surface.page, themed),
  raised: kind.color(herbier.surface.raised, themed),
  selected: kind.color(herbier.surface.selected, themed),
  selectedHover: kind.color(herbier.surface.selectedHover, themed),
  selectedActive: kind.color(herbier.surface.selectedActive, themed),
  navHover: kind.color(herbier.surface.navHover, themed),
  clear: kind.color(herbier.surface.clear, themed),
  ink: kind.color(herbier.text.body, themed),
  // The colour an icon is drawn in. A mask has no `currentColor` to borrow, so
  // whoever sets a text colour for a subtree sets this one beside it.
  glyph: kind.color(herbier.text.body, themed),
  inkMuted: kind.color(herbier.text.muted, themed),
  inkSubtle: kind.color(herbier.text.subtle, themed),
  link: kind.color(herbier.text.link, themed),
  line: kind.color(herbier.border.subtle, themed),
  lineStrong: kind.color(herbier.border.strong, themed),
  action: kind.color(herbier.accent.action, themed),
  actionHover: kind.color(herbier.accent.actionHover, themed),
  actionActive: kind.color(herbier.accent.actionActive, themed),
  onAction: kind.color(herbier.accent.onAction, themed),
  danger: kind.color(herbier.accent.danger, themed),
  dangerHover: kind.color(herbier.accent.dangerHover, themed),
  dangerActive: kind.color(herbier.accent.dangerActive, themed),
  decor: kind.color(herbier.accent.decor, themed),
  focusHalo: kind.color(herbier.border.focusHalo, themed),
  shadow: kind.color(herbier.effect.shadow, themed),
  forestBack: kind.color(herbier.decor.forestBack, themed),
  forestRidge: kind.color(herbier.decor.forestRidge, themed),
  forestMiddle: kind.color(herbier.decor.forestMiddle, themed),
  forestNear: kind.color(herbier.decor.forestNear, themed),
  forestFront: kind.color(herbier.decor.forestFront, themed),
  contour: kind.color(herbier.decor.contour, themed),
  // The corner and the shadow of a code block. A code group draws one card for
  // its tabs and its block, so it sets these to nothing for the block inside.
  codeCorner: kind.length(unit.px(6), themed),
  codeLift: kind.color(herbier.effect.shadow, themed),
  infoSurface: kind.color(herbier.surface.info, themed),
  infoBorder: kind.color(herbier.border.info, themed),
  infoInk: kind.color(herbier.text.info, themed),
  tipSurface: kind.color(herbier.surface.tip, themed),
  tipBorder: kind.color(herbier.border.tip, themed),
  tipInk: kind.color(herbier.text.tip, themed),
  importantSurface: kind.color(herbier.surface.important, themed),
  importantBorder: kind.color(herbier.border.important, themed),
  importantInk: kind.color(herbier.text.important, themed),
  warningSurface: kind.color(herbier.surface.warning, themed),
  warningBorder: kind.color(herbier.border.warning, themed),
  warningInk: kind.color(herbier.text.warning, themed),
  dangerSurface: kind.color(herbier.surface.danger, themed),
  dangerBorder: kind.color(herbier.border.danger, themed),
  dangerInk: kind.color(herbier.text.danger, themed),
});

/**
 * Newsreader for headings, captions and the pull quote; Hanken Grotesk for the
 * interface and the body; Geist Mono for code.
 *
 * Known gap: the mock-up loads Newsreader with its optical-size axis (6..72),
 * which makes the 84 px title finer and tighter. `googleFont` cannot ask for an
 * axis, so the title is a little heavier. Serving the variable file with
 * `localFont` closes it; that waits for the rendering to be compared.
 */
export const displayFont = defineFont('herbierDisplay', {
  family: 'Newsreader',
  source: googleFont({ weights: [400, 500, 600], italic: true }),
  display: 'swap',
  fallback: 'ui-serif',
});

export const sansFont = defineFont('herbierSans', {
  family: 'Hanken Grotesk',
  source: googleFont({ weights: [400, 500, 600, 700] }),
  display: 'swap',
  fallback: 'system-ui',
});

export const monoFont = defineFont('herbierMono', {
  family: 'Geist Mono',
  source: googleFont({ weights: [400, 500] }),
  display: 'swap',
  fallback: 'ui-monospace',
});

/**
 * The display sizes of the mock-up, which the shared type scale (12 to 22 px)
 * does not reach. Three local, marked lengths rather than three new steps in a
 * library shared with other products: the graph counts them, so the debt is
 * visible, and they go the day the shared scale grows. Each one shrinks with
 * the viewport, down to a phone.
 */
export const displaySize = {
  hero: unsafeLength('clamp(2.75rem, 9vw, 5.25rem)', 'herbier-display'),
  title: unsafeLength('clamp(2.25rem, 7vw, 4.5rem)', 'herbier-display'),
  lead: unsafeLength('clamp(2rem, 5.5vw, 3.5rem)', 'herbier-display'),
} as const;

/**
 * What a tone paints, as three variables that inherit: the fill, the edge and
 * the ink of the label. A callout, a badge and a toast all read these, so the
 * five-way `when` below is written once and a nested part (an icon, a title)
 * learns the tone without a second attribute.
 */
export const toneVars = cssVars('herbierTone', {
  surface: kind.color(herbier.surface.info, themed),
  border: kind.color(herbier.border.info, themed),
  ink: kind.color(herbier.text.info, themed),
});

/** Spread into the root of a sheet whose element carries `data-tone`. */
export const toneRules = [
  set(toneVars.surface, theme.infoSurface),
  set(toneVars.border, theme.infoBorder),
  set(toneVars.ink, theme.infoInk),
  when(tone.tip, [
    set(toneVars.surface, theme.tipSurface),
    set(toneVars.border, theme.tipBorder),
    set(toneVars.ink, theme.tipInk),
  ]),
  when(tone.important, [
    set(toneVars.surface, theme.importantSurface),
    set(toneVars.border, theme.importantBorder),
    set(toneVars.ink, theme.importantInk),
  ]),
  when(tone.warning, [
    set(toneVars.surface, theme.warningSurface),
    set(toneVars.border, theme.warningBorder),
    set(toneVars.ink, theme.warningInk),
  ]),
  when(tone.danger, [
    set(toneVars.surface, theme.dangerSurface),
    set(toneVars.border, theme.dangerBorder),
    set(toneVars.ink, theme.dangerInk),
  ]),
] as const;

/** One side of the palette, written once and read for light and for dark. */
const paint = (side: (token: ColorValue) => ColorValue) => [
  set(theme.surface, side(herbier.surface.page)),
  set(theme.raised, side(herbier.surface.raised)),
  set(theme.selected, side(herbier.surface.selected)),
  set(theme.selectedHover, side(herbier.surface.selectedHover)),
  set(theme.selectedActive, side(herbier.surface.selectedActive)),
  set(theme.navHover, side(herbier.surface.navHover)),
  set(theme.clear, side(herbier.surface.clear)),
  set(theme.ink, side(herbier.text.body)),
  set(theme.glyph, side(herbier.text.body)),
  set(theme.inkMuted, side(herbier.text.muted)),
  set(theme.inkSubtle, side(herbier.text.subtle)),
  set(theme.link, side(herbier.text.link)),
  set(theme.line, side(herbier.border.subtle)),
  set(theme.lineStrong, side(herbier.border.strong)),
  set(theme.action, side(herbier.accent.action)),
  set(theme.actionHover, side(herbier.accent.actionHover)),
  set(theme.actionActive, side(herbier.accent.actionActive)),
  set(theme.onAction, side(herbier.accent.onAction)),
  set(theme.danger, side(herbier.accent.danger)),
  set(theme.dangerHover, side(herbier.accent.dangerHover)),
  set(theme.dangerActive, side(herbier.accent.dangerActive)),
  set(theme.decor, side(herbier.accent.decor)),
  set(theme.focusHalo, side(herbier.border.focusHalo)),
  set(theme.shadow, side(herbier.effect.shadow)),
  set(theme.forestBack, side(herbier.decor.forestBack)),
  set(theme.forestRidge, side(herbier.decor.forestRidge)),
  set(theme.forestMiddle, side(herbier.decor.forestMiddle)),
  set(theme.forestNear, side(herbier.decor.forestNear)),
  set(theme.forestFront, side(herbier.decor.forestFront)),
  set(theme.contour, side(herbier.decor.contour)),
  set(theme.codeLift, side(herbier.effect.shadow)),
  set(theme.infoSurface, side(herbier.surface.info)),
  set(theme.infoBorder, side(herbier.border.info)),
  set(theme.infoInk, side(herbier.text.info)),
  set(theme.tipSurface, side(herbier.surface.tip)),
  set(theme.tipBorder, side(herbier.border.tip)),
  set(theme.tipInk, side(herbier.text.tip)),
  set(theme.importantSurface, side(herbier.surface.important)),
  set(theme.importantBorder, side(herbier.border.important)),
  set(theme.importantInk, side(herbier.text.important)),
  set(theme.warningSurface, side(herbier.surface.warning)),
  set(theme.warningBorder, side(herbier.border.warning)),
  set(theme.warningInk, side(herbier.text.warning)),
  set(theme.dangerSurface, side(herbier.surface.danger)),
  set(theme.dangerBorder, side(herbier.border.danger)),
  set(theme.dangerInk, side(herbier.text.danger)),
  // The foundation's own variables: the focus ring is drawn once, on every
  // `:focus-visible`, from these. Herbier = a spruce ring of 2 px, 3 px off,
  // never removed — no component draws its own.
  set(craftBase.focusRing, side(herbier.accent.action)),
  set(craftBase.accent, side(herbier.accent.action)),
  set(craftBase.selectionBg, side(herbier.surface.selected)),
  set(craftBase.selectionInk, side(herbier.text.strong)),
];

const light = paint((token) => token);
const dark = paint(darkOf);

/**
 * Every theme variable written for one side, for a subtree that must not follow
 * the page: the root rules above only reach `:root`, so a region that is always
 * dark (the Effect lessons) spreads `paintDark` under its own scope.
 */
export const paintLight = light;
export const paintDark = dark;

/**
 * The widths the layout changes at. A phone gets one column and a drawer, a
 * tablet adds the sidebar, a laptop adds the outline.
 *
 * **The names are chosen to sort.** The emitter orders conditional atoms by
 * class name, and the class name carries the breakpoint's name, so two
 * breakpoints that set the same property land in alphabetical order, not in
 * declaration order. With `sm`, `md`, `lg` that order is `lg`, `md`, `sm`: the
 * narrow rule would win at every width. `compact` < `medium` < `wide` <
 * `xwide` is ascending both ways, and `herbier.spec.ts` keeps it that way.
 */
export const bp = defineBreakpoints({
  compact: at.minInlineSize(unit.rem(36)),
  medium: at.minInlineSize(unit.rem(48)),
  wide: at.minInlineSize(unit.rem(64)),
  xwide: at.minInlineSize(unit.rem(80)),
});

/** Which side a scoped subtree is forced to. */
export const scope = defineStateAxis('scope', ['light', 'dark'] as const);

craftGlobalStyles('herbier', {
  root: [
    ...light,
    set(theme.codeCorner, unit.px(6)),
    set(craftBase.focusOffset, unit.px(3)),
    // Follows the user agent …
    when(scheme.dark, dark),
    // … unless the document forces a side. `:root[data-mode='light']` is more
    // specific than the media query, so the explicit choice always wins.
    when(mode.light, light),
    when(mode.dark, dark),
  ],
  elements: {
    body: [
      bg(theme.surface),
      color(theme.ink),
      fontFamily(sansFont),
      ...font(text.base),
    ],
  },
});

/** The four weights the three fonts are loaded in. */
export const weight = {
  regular: num(400),
  medium: num(500),
  semibold: num(600),
  bold: num(700),
} as const;

/** The three durations of the system. Nothing animates faster than `fast`. */
export const duration = {
  fast: unit.ms(150),
  normal: unit.ms(250),
  slow: unit.ms(450),
  /** A card settling onto the page. */
  rise: unit.ms(900),
} as const;

/** The one curve: a quick start that settles, never a bounce. */
export const ease = easing.cubicBezier(0.22, 1, 0.36, 1);

/**
 * A container arrives by fading in and settling 10 px: it is placed with
 * `inset-block-start` on a relatively positioned box, since the vocabulary has
 * no typed `transform`. Reduced motion collapses it to instant (`craft.base`).
 */
export const arrive = keyframes('herbierRise', {
  from: [opacity(num(0)), insetBlockStart(space(2))],
  to: [opacity(num(1)), insetBlockStart(space(0))],
});

/** The `position` and `animation-*` longhands for `arrive`, spread into a sheet. */
export const arriving = [
  position.relative,
  ...animate(arrive, {
    duration: duration.rise,
    easing: ease,
    fillMode: 'backwards',
  }),
] as const;

/**
 * A surface that is already placed by the browser — a modal `<dialog>` is
 * `position: fixed` in the top layer — arrives by fading only. `arriving` sets
 * `position: relative` to be able to slide, which would take it out of the top
 * layer's placement and leave it at the foot of the page.
 */
export const fade = keyframes('herbierFade', {
  from: [opacity(num(0))],
  to: [opacity(num(1))],
});

export const fading = animate(fade, {
  duration: duration.slow,
  easing: ease,
  fillMode: 'backwards',
});

/** `arriving`, after a delay: the staggered entrance of a row of cards. */
export const arrivingAfter = (delay: ReturnType<typeof unit.ms>) =>
  [
    position.relative,
    ...animate(arrive, {
      duration: duration.rise,
      easing: ease,
      delay,
      fillMode: 'backwards',
    }),
  ] as const;
