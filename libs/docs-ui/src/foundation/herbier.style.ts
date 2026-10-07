/**
 * The Storm Front foundation: palette, theme variables, axes and fonts.
 *
 * Every other sheet of the package reads from here, and nothing here reads from
 * a component. A `*.style.ts` imports vocabulary only (`style-file-boundary`),
 * which is what lets the build plugin evaluate it in Node.
 *
 * The look is dark first — a night sky, cyan for the action, yellow for the
 * signal — and every token carries its light side too, so an overcast daytime
 * theme is the same sheet read the other way, not a second design.
 */
import {
  animate,
  bg,
  color,
  craftGlobalStyles,
  cssVars,
  darkOf,
  defineFont,
  definePalette,
  defineStateAxis,
  easing,
  font,
  fontFamily,
  googleFont,
  keyframes,
  kind,
  num,
  opacity,
  scheme,
  set,
  text,
  unit,
  when,
  type ColorValue,
} from '@craft-ts/style';

export const herbier = definePalette('herbier', {
  surface: {
    page: { light: '#F3F6FC', dark: '#0B1022' },
    raised: { light: '#FFFFFF', dark: '#101834' },
    sunken: { light: '#E8EDF8', dark: '#0A0F1E' },
    // The code surface is dark on purpose, in both themes: one set of syntax
    // colours to prove, and the part of a page that reads as a console.
    code: { light: '#0A0F1E', dark: '#0A0F1E' },
    // Marked lines inside a code block. Opaque tints, not alpha: the contrast
    // proof reads a colour, and a colour over a colour is two of them.
    codeBar: { light: '#101834', dark: '#101834' },
    codeHighlight: { light: '#13214A', dark: '#13214A' },
    codeAdd: { light: '#0E2A26', dark: '#0E2A26' },
    codeRemove: { light: '#2A1521', dark: '#2A1521' },
    codeWarning: { light: '#262210', dark: '#262210' },
    info: { light: '#E6F1FB', dark: '#18224A' },
    tip: { light: '#E4F7EE', dark: '#0F2A2A' },
    warning: { light: '#FFF6D6', dark: '#262210' },
    danger: { light: '#FDE9ED', dark: '#2A1520' },
    important: { light: '#EEEAFF', dark: '#201C40' },
  },
  text: {
    strong: { light: '#0B1022', dark: '#FFFFFF' },
    body: { light: '#1B2547', dark: '#D5DEF7' },
    muted: { light: '#4A557A', dark: '#9AA7CC' },
    link: { light: '#0B6FA8', dark: '#7DD3FF' },
    // Syntax colours. Light and dark are the same: the code surface is.
    codePlain: { light: '#E6ECFF', dark: '#E6ECFF' },
    codeKeyword: { light: '#7DD3FF', dark: '#7DD3FF' },
    codeFunction: { light: '#FFE45C', dark: '#FFE45C' },
    codeString: { light: '#A5E8B6', dark: '#A5E8B6' },
    codeNumber: { light: '#FFB38A', dark: '#FFB38A' },
    codeType: { light: '#C3B5FF', dark: '#C3B5FF' },
    codeComment: { light: '#8D98BD', dark: '#8D98BD' },
    codePunctuation: { light: '#9AA7CC', dark: '#9AA7CC' },
    info: { light: '#0B5A8F', dark: '#7DD3FF' },
    tip: { light: '#0B6B47', dark: '#6EE7B0' },
    warning: { light: '#7A5C00', dark: '#FFE45C' },
    danger: { light: '#A11B33', dark: '#FF8A98' },
    important: { light: '#5538C8', dark: '#C3B5FF' },
  },
  border: {
    subtle: { light: '#CBD5EC', dark: '#26335A' },
    strong: { light: '#98A7CF', dark: '#3A4A86' },
    codeHighlight: { light: '#7DD3FF', dark: '#7DD3FF' },
    codeAdd: { light: '#6EE7B0', dark: '#6EE7B0' },
    codeRemove: { light: '#FF8A98', dark: '#FF8A98' },
    codeWarning: { light: '#FFE45C', dark: '#FFE45C' },
    info: { light: '#8FB8DE', dark: '#3A4A86' },
    tip: { light: '#7CC7A3', dark: '#2F7A62' },
    warning: { light: '#D9B93A', dark: '#8A7A28' },
    danger: { light: '#E58A9A', dark: '#8A4A5A' },
    important: { light: '#A99BF0', dark: '#6E64A8' },
  },
  accent: {
    action: { light: '#0B6FA8', dark: '#7DD3FF' },
  },
});

/**
 * Which kind of message a callout carries. The five VitePress containers and
 * the five GitHub alerts both map onto these: NOTE is `info`, CAUTION is
 * `danger`.
 */
export const tone = defineStateAxis('tone', [
  'info',
  'tip',
  'warning',
  'danger',
  'important',
] as const);

/**
 * Forces a theme whatever the user agent prefers: `data-mode` on the document
 * root is the appearance toggle, and a route that is always dark sets it to
 * `dark` while it is active. Global rules only reach `:root`, so forcing a
 * theme on a subtree would need a scope class of its own.
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
  sunken: kind.color(herbier.surface.sunken, themed),
  ink: kind.color(herbier.text.body, themed),
  inkStrong: kind.color(herbier.text.strong, themed),
  inkMuted: kind.color(herbier.text.muted, themed),
  link: kind.color(herbier.text.link, themed),
  line: kind.color(herbier.border.subtle, themed),
  lineStrong: kind.color(herbier.border.strong, themed),
  action: kind.color(herbier.accent.action, themed),
  infoSurface: kind.color(herbier.surface.info, themed),
  infoBorder: kind.color(herbier.border.info, themed),
  infoInk: kind.color(herbier.text.info, themed),
  tipSurface: kind.color(herbier.surface.tip, themed),
  tipBorder: kind.color(herbier.border.tip, themed),
  tipInk: kind.color(herbier.text.tip, themed),
  warningSurface: kind.color(herbier.surface.warning, themed),
  warningBorder: kind.color(herbier.border.warning, themed),
  warningInk: kind.color(herbier.text.warning, themed),
  dangerSurface: kind.color(herbier.surface.danger, themed),
  dangerBorder: kind.color(herbier.border.danger, themed),
  dangerInk: kind.color(herbier.text.danger, themed),
  importantSurface: kind.color(herbier.surface.important, themed),
  importantBorder: kind.color(herbier.border.important, themed),
  importantInk: kind.color(herbier.text.important, themed),
});

export const sans = defineFont('herbierSans', {
  family: 'Manrope',
  source: googleFont({ weights: [400, 500, 600, 700, 800] }),
  display: 'swap',
  fallback: 'system-ui',
});

export const display = defineFont('herbierDisplay', {
  family: 'Sora',
  source: googleFont({ weights: [600, 700, 800] }),
  display: 'swap',
  fallback: 'system-ui',
});

export const mono = defineFont('herbierMono', {
  family: 'JetBrains Mono',
  source: googleFont({ weights: [400, 500] }),
  display: 'swap',
  fallback: 'monospace',
});

/** One side of the palette, written once and read for light and for dark. */
const paint = (side: (token: ColorValue) => ColorValue) => [
  set(theme.surface, side(herbier.surface.page)),
  set(theme.raised, side(herbier.surface.raised)),
  set(theme.sunken, side(herbier.surface.sunken)),
  set(theme.ink, side(herbier.text.body)),
  set(theme.inkStrong, side(herbier.text.strong)),
  set(theme.inkMuted, side(herbier.text.muted)),
  set(theme.link, side(herbier.text.link)),
  set(theme.line, side(herbier.border.subtle)),
  set(theme.lineStrong, side(herbier.border.strong)),
  set(theme.action, side(herbier.accent.action)),
  set(theme.infoSurface, side(herbier.surface.info)),
  set(theme.infoBorder, side(herbier.border.info)),
  set(theme.infoInk, side(herbier.text.info)),
  set(theme.tipSurface, side(herbier.surface.tip)),
  set(theme.tipBorder, side(herbier.border.tip)),
  set(theme.tipInk, side(herbier.text.tip)),
  set(theme.warningSurface, side(herbier.surface.warning)),
  set(theme.warningBorder, side(herbier.border.warning)),
  set(theme.warningInk, side(herbier.text.warning)),
  set(theme.dangerSurface, side(herbier.surface.danger)),
  set(theme.dangerBorder, side(herbier.border.danger)),
  set(theme.dangerInk, side(herbier.text.danger)),
  set(theme.importantSurface, side(herbier.surface.important)),
  set(theme.importantBorder, side(herbier.border.important)),
  set(theme.importantInk, side(herbier.text.important)),
];

const light = paint((token) => token);
const dark = paint(darkOf);

craftGlobalStyles('herbier', {
  root: [
    ...light,
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
      fontFamily(sans),
      ...font(text.base),
    ],
  },
});

/** The three durations of the system. Nothing animates faster than `fast`. */
export const duration = {
  fast: unit.ms(150),
  normal: unit.ms(250),
  slow: unit.ms(450),
} as const;

/** The one curve: a quick start that settles, never a bounce. */
export const ease = easing.cubicBezier(0.22, 1, 0.36, 1);

/** A container arrives by fading in. Reduced motion collapses it to instant. */
export const arrive = keyframes('herbierArrive', {
  from: [opacity(num(0))],
  to: [opacity(num(1))],
});

/** The `animation-*` longhands for `arrive`, spread into a sheet. */
export const arriving = animate(arrive, {
  duration: duration.slow,
  easing: ease,
  fillMode: 'backwards',
});
