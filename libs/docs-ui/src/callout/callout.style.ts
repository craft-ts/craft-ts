/**
 * The callout: the box behind `::: tip`, `::: warning`, `> [!NOTE]` and the
 * rest. One shape, five tones.
 *
 * The tone arrives as `data-tone` on the root. The sheet answers it by writing
 * three local variables (surface, border, title ink) from the theme's per-tone
 * variables, and every part reads those three: the title is a different
 * element, and a variable that inherits is how it learns the tone without a
 * second attribute.
 *
 * Colour is never the only carrier of the tone: each one has its own glyph
 * (a leaf, a sprout, a triangle…) and its own caption, so a reader who cannot
 * tell the colours apart loses nothing.
 */
import {
  bg,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cssVars,
  display,
  font,
  fontFamily,
  fontWeight,
  insetBlockStart,
  insetInlineStart,
  kind,
  letterSpacing,
  lineWidth,
  marginBlockEnd,
  p,
  paddingInlineEnd,
  paddingInlineStart,
  position,
  py,
  radii,
  radius,
  set,
  space,
  text,
  unit,
  when,
} from '@craft-ts/style';
import {
  arriving,
  herbier,
  sansFont,
  theme,
  tone,
  weight,
} from '../foundation/herbier.style.ts';

const inherited = { inherits: true } as const;

const v = cssVars('docCallout', {
  surface: kind.color(herbier.surface.info, inherited),
  border: kind.color(herbier.border.info, inherited),
  ink: kind.color(herbier.text.info, inherited),
});

export const calloutUi = craftStyles('docCallout', {
  root: [
    display.block,
    py(space(4)),
    paddingInlineEnd(space(4)),
    // Room for the glyph: 56 px in the mock-up.
    paddingInlineStart(unit.rem(3.5)),
    marginBlockEnd(space(4)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(v.border),
    bg(v.surface),
    color(theme.ink),
    radius(radii.md),
    ...font(text.sm),
    ...arriving,
    set(v.surface, theme.infoSurface),
    set(v.border, theme.infoBorder),
    set(v.ink, theme.infoInk),
    when(tone.tip, [
      set(v.surface, theme.tipSurface),
      set(v.border, theme.tipBorder),
      set(v.ink, theme.tipInk),
    ]),
    when(tone.important, [
      set(v.surface, theme.importantSurface),
      set(v.border, theme.importantBorder),
      set(v.ink, theme.importantInk),
    ]),
    when(tone.warning, [
      set(v.surface, theme.warningSurface),
      set(v.border, theme.warningBorder),
      set(v.ink, theme.warningInk),
    ]),
    when(tone.danger, [
      set(v.surface, theme.dangerSurface),
      set(v.border, theme.dangerBorder),
      set(v.ink, theme.dangerInk),
    ]),
    // The glyph reads the tone's ink through the theme's icon variable.
    set(theme.glyph, v.ink),
  ],
  icon: [
    display.block,
    position.absolute,
    insetInlineStart(space(4)),
    insetBlockStart(space(4)),
  ],
  title: [
    display.block,
    marginBlockEnd(space(1)),
    fontFamily(sansFont),
    ...font(text.xs),
    fontWeight(weight.semibold),
    letterSpacing(unit.em(0.2)),
    color(v.ink),
  ],
  body: [display.block, p(space(0))],
});
