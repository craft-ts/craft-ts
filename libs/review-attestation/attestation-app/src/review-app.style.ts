/**
 * The review application's design system: its palette, the theme, the
 * document defaults, and the shell.
 *
 * Roles, not colours: every sheet of the app reads `theme.*`, never a palette
 * entry directly, so the second theme is one block here. Three states, as the
 * reviewer knows them:
 *
 * - the light values are the defaults;
 * - `scheme.dark` switches to dark when the machine asks for it;
 * - an explicit choice (`data-reviewTheme` on the shell, bound to the
 *   preference) wins over both — an attribute selector outranks the media
 *   query's plain class.
 *
 * The theme lives on the shell's class, not on `:root`: the static contrast
 * proof reads classes, and the modals and menus are all inside the shell.
 */
import {
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftGlobalStyles,
  craftStyles,
  cssVars,
  cursor,
  darkOf,
  definePalette,
  defineStateAxis,
  font,
  fontFamily,
  fontSize,
  fontWeight,
  interaction,
  kind,
  letterSpacing,
  lineWidth,
  lineHeight,
  marginBlockEnd,
  minBlockSize,
  minWidth,
  monospaceStack,
  num,
  opacity,
  px,
  py,
  radius,
  scheme,
  set,
  space,
  systemFontStack,
  text,
  textTransform,
  uaScheme,
  unit,
  when,
} from '@craft-ts/style';

export const reviewUi = definePalette('reviewUi', {
  surface: {
    page: { light: '#f5f6f8', dark: '#111318' },
    base: { light: '#ffffff', dark: '#171a20' },
    raised: { light: '#ffffff', dark: '#1b1f26' },
    sunken: { light: '#fbfcfd', dark: '#12151b' },
    checker: { light: '#e9ecf1', dark: '#262a32' },
    accent: { light: '#e8ecff', dark: '#202a51' },
    danger: { light: '#fdeceb', dark: '#321e23' },
    dangerHover: { light: '#fbdcda', dark: '#342126' },
    warn: { light: '#fdf3e2', dark: '#2b2216' },
    created: { light: '#e6f3ec', dark: '#1a2c24' },
    scrim: { light: '#fffffff2', dark: '#171a20f2' },
    caption: { light: '#ffffffdd', dark: '#111318dd' },
    backdrop: { light: '#f5f6f8b8', dark: '#111318b8' },
    frame: { light: '#ffffff', dark: '#ffffff' },
    transparent: { light: 'transparent', dark: 'transparent' },
  },
  text: {
    bright: { light: '#0d1117', dark: '#f3f4f7' },
    base: { light: '#1c2230', dark: '#e7e9ee' },
    muted: { light: '#4a5262', dark: '#aeb5c3' },
    dim: { light: '#667085', dark: '#8b93a5' },
    accent: { light: '#1e2a72', dark: '#d8deff' },
    link: { light: '#2f45c4', dark: '#9db2ff' },
    onAccent: { light: '#ffffff', dark: '#ffffff' },
    danger: { light: '#7a1710', dark: '#ffc7c7' },
    dangerHover: { light: '#5c110c', dark: '#ffd4d6' },
    warn: { light: '#7a4a00', dark: '#ffcc80' },
    created: { light: '#1c6b3f', dark: '#7fd6a2' },
  },
  border: {
    line: { light: '#dfe3ea', dark: '#2a2e37' },
    strong: { light: '#c4cad5', dark: '#373d49' },
    accent: { light: '#b3befa', dark: '#3e4e8c' },
    danger: { light: '#f0b7b2', dark: '#623c42' },
    warn: { light: '#e6c894', dark: '#5b4526' },
    guide: { light: '#dfe3eab3', dark: '#2a2e37b3' },
  },
  accent: {
    base: { light: '#3b53d8', dark: '#526fff' },
    hover: { light: '#2f45c4', dark: '#6379ff' },
    active: { light: '#2a3eb0', dark: '#5268ef' },
    danger: { light: '#b42318', dark: '#e06c75' },
    dangerHover: { light: '#971a12', dark: '#ff9ea4' },
    dangerRing: { light: '#b4231833', dark: '#e06c7533' },
  },
  effect: {
    shadow: { light: '#0f172a1f', dark: '#00000088' },
    shadowStrong: { light: '#0f172a2e', dark: '#00000099' },
    fold: { light: '#080a0e8c', dark: '#080a0e8c' },
  },
});

const themed = { inherits: true };
const u = reviewUi;

/** The theme every sheet of the app reads. Initial values: the light side. */
export const theme = cssVars('review', {
  bg: kind.color(u.surface.page, themed),
  surface: kind.color(u.surface.base, themed),
  surfaceRaised: kind.color(u.surface.raised, themed),
  surfaceSunken: kind.color(u.surface.sunken, themed),
  checker: kind.color(u.surface.checker, themed),
  accentBg: kind.color(u.surface.accent, themed),
  dangerBg: kind.color(u.surface.danger, themed),
  dangerBgHover: kind.color(u.surface.dangerHover, themed),
  warnBg: kind.color(u.surface.warn, themed),
  createdBg: kind.color(u.surface.created, themed),
  scrim: kind.color(u.surface.scrim, themed),
  caption: kind.color(u.surface.caption, themed),
  backdrop: kind.color(u.surface.backdrop, themed),
  textBright: kind.color(u.text.bright, themed),
  text: kind.color(u.text.base, themed),
  textMuted: kind.color(u.text.muted, themed),
  textDim: kind.color(u.text.dim, themed),
  accentText: kind.color(u.text.accent, themed),
  accentLink: kind.color(u.text.link, themed),
  onAccent: kind.color(u.text.onAccent, themed),
  dangerText: kind.color(u.text.danger, themed),
  dangerTextHover: kind.color(u.text.dangerHover, themed),
  warnText: kind.color(u.text.warn, themed),
  createdText: kind.color(u.text.created, themed),
  line: kind.color(u.border.line, themed),
  lineStrong: kind.color(u.border.strong, themed),
  accentBorder: kind.color(u.border.accent, themed),
  dangerBorder: kind.color(u.border.danger, themed),
  warnBorder: kind.color(u.border.warn, themed),
  guide: kind.color(u.border.guide, themed),
  accent: kind.color(u.accent.base, themed),
  accentHover: kind.color(u.accent.hover, themed),
  accentActive: kind.color(u.accent.active, themed),
  danger: kind.color(u.accent.danger, themed),
  dangerHover: kind.color(u.accent.dangerHover, themed),
  dangerRing: kind.color(u.accent.dangerRing, themed),
  shadow: kind.color(u.effect.shadow, themed),
  shadowStrong: kind.color(u.effect.shadowStrong, themed),
});

type Side = 'light' | 'dark';
const side = (value: typeof u.surface.page, which: Side) =>
  which === 'dark' ? darkOf(value) : value;

/** Every theme variable set to one side of the palette, and the UA scheme with it. */
const themeSide = (which: Side) => [
  set(theme.bg, side(u.surface.page, which)),
  set(theme.surface, side(u.surface.base, which)),
  set(theme.surfaceRaised, side(u.surface.raised, which)),
  set(theme.surfaceSunken, side(u.surface.sunken, which)),
  set(theme.checker, side(u.surface.checker, which)),
  set(theme.accentBg, side(u.surface.accent, which)),
  set(theme.dangerBg, side(u.surface.danger, which)),
  set(theme.dangerBgHover, side(u.surface.dangerHover, which)),
  set(theme.warnBg, side(u.surface.warn, which)),
  set(theme.createdBg, side(u.surface.created, which)),
  set(theme.scrim, side(u.surface.scrim, which)),
  set(theme.caption, side(u.surface.caption, which)),
  set(theme.backdrop, side(u.surface.backdrop, which)),
  set(theme.textBright, side(u.text.bright, which)),
  set(theme.text, side(u.text.base, which)),
  set(theme.textMuted, side(u.text.muted, which)),
  set(theme.textDim, side(u.text.dim, which)),
  set(theme.accentText, side(u.text.accent, which)),
  set(theme.accentLink, side(u.text.link, which)),
  set(theme.onAccent, side(u.text.onAccent, which)),
  set(theme.dangerText, side(u.text.danger, which)),
  set(theme.dangerTextHover, side(u.text.dangerHover, which)),
  set(theme.warnText, side(u.text.warn, which)),
  set(theme.createdText, side(u.text.created, which)),
  set(theme.line, side(u.border.line, which)),
  set(theme.lineStrong, side(u.border.strong, which)),
  set(theme.accentBorder, side(u.border.accent, which)),
  set(theme.dangerBorder, side(u.border.danger, which)),
  set(theme.warnBorder, side(u.border.warn, which)),
  set(theme.guide, side(u.border.guide, which)),
  set(theme.accent, side(u.accent.base, which)),
  set(theme.accentHover, side(u.accent.hover, which)),
  set(theme.accentActive, side(u.accent.active, which)),
  set(theme.danger, side(u.accent.danger, which)),
  set(theme.dangerHover, side(u.accent.dangerHover, which)),
  set(theme.dangerRing, side(u.accent.dangerRing, which)),
  set(theme.shadow, side(u.effect.shadow, which)),
  set(theme.shadowStrong, side(u.effect.shadowStrong, which)),
  which === 'dark' ? uaScheme.dark : uaScheme.light,
];

/** The reviewer's explicit choice. Drives `data-reviewTheme` on the shell. */
export const themeChoice = defineStateAxis('reviewTheme', ['light', 'dark']);

/** Inter, then the platform's sans-serif. */
export const reviewFont = systemFontStack(
  ['Inter', 'ui-sans-serif', 'system-ui'],
  'sans-serif',
);

craftGlobalStyles('review', {
  elements: {
    body: [
      minWidth(unit.px(320)),
      minBlockSize(unit.vh(100)),
      fontFamily(reviewFont),
      fontSize(unit.px(14)),
      lineHeight(num(1.45)),
      bg(u.surface.page),
      color(u.text.base),
      when(scheme.dark, [
        bg(darkOf(u.surface.page)),
        color(darkOf(u.text.base)),
      ]),
    ],
    h1: [
      marginBlockEnd(space(0)),
      fontSize(unit.px(23)),
      letterSpacing(unit.em(-0.03)),
    ],
    h2: [marginBlockEnd(space(1)), fontSize(unit.px(19))],
    h3: [
      marginBlockEnd(unit.px(10)),
      fontSize(unit.px(13)),
      letterSpacing(unit.em(0.09)),
      textTransform.uppercase,
      color(theme.textMuted),
    ],
    button: [
      cursor.pointer,
      color(theme.text),
      when(interaction.disabled, [cursor.notAllowed, opacity(num(0.45))]),
    ],
    select: [
      py(unit.px(8)),
      px(unit.px(10)),
      borderWidth(lineWidth.hairline),
      borderStyle.solid,
      borderColor(theme.lineStrong),
      radius(unit.px(7)),
      color(theme.text),
      bg(theme.surfaceSunken),
    ],
  },
});

export const reviewTheme = craftStyles('reviewTheme', {
  root: [
    ...themeSide('light'),
    when(scheme.dark, themeSide('dark')),
    when(themeChoice.dark, themeSide('dark')),
    when(themeChoice.light, themeSide('light')),
    minBlockSize(unit.vh(100)),
    color(theme.text),
    bg(theme.bg),
  ],
});

/** The decision buttons: the slice the contrast proof covers. */
export const decision = craftStyles('reviewDecision', {
  primary: [bg(theme.accentActive), color(theme.onAccent)],
  key: [color(theme.onAccent)],
});

/** Shared small pieces: eyebrow, code text, chips. */
export const reviewText = craftStyles('reviewText', {
  eyebrow: [
    color(theme.textDim),
    letterSpacing(unit.em(0.14)),
    fontWeight(num(700)),
  ],
  code: [fontFamily(monospaceStack)],
  small: [font(text.xs), color(theme.textDim)],
});
