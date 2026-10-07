/**
 * The callout: the box behind `::: tip`, `::: warning`, `> [!NOTE]` and the
 * rest. One shape, five tones.
 *
 * The tone arrives as `data-tone` on the root. The sheet answers it by writing
 * three local variables (surface, border, title ink) from the theme's per-tone
 * variables, and every part reads those three: the title is a different
 * element, and a variable that inherits is how it learns the tone without a
 * second attribute.
 */
import {
  bg,
  borderColor,
  borderEndEndRadius,
  borderEndStartRadius,
  borderStartEndRadius,
  borderStartStartRadius,
  borderStyle,
  borderWidth,
  color,
  craftStyles,
  cssVars,
  display,
  font,
  fontFamily,
  fontWeight,
  kind,
  letterSpacing,
  lineWidth,
  p,
  paddingInlineStart,
  position,
  pseudo,
  px,
  py,
  radii,
  set,
  space,
  text,
  unit,
  when,
  insetBlockStart,
  insetInlineStart,
  inlineSize,
  blockSize,
  radius,
  marginBlockEnd,
} from '@craft-ts/style';
import { arriving, display as displayFont, herbier, tone } from '../foundation/herbier.style.ts';
import { theme } from '../foundation/herbier.style.ts';

const inherited = { inherits: true } as const;

const v = cssVars('docCallout', {
  surface: kind.color(herbier.surface.info, inherited),
  border: kind.color(herbier.border.info, inherited),
  ink: kind.color(herbier.text.info, inherited),
});

export const calloutUi = craftStyles('docCallout', {
  root: [
    display.block,
    position.relative,
    py(space(3)),
    px(space(4)),
    paddingInlineStart(space(10)),
    marginBlockEnd(space(4)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(v.border),
    bg(v.surface),
    color(theme.ink),
    // The cloud: three generous corners and one that stays square.
    borderStartStartRadius(unit.rem(1.25)),
    borderStartEndRadius(unit.rem(1.25)),
    borderEndEndRadius(unit.rem(1.25)),
    borderEndStartRadius(radii.sm),
    ...arriving,
    set(v.surface, theme.infoSurface),
    set(v.border, theme.infoBorder),
    set(v.ink, theme.infoInk),
    when(tone.tip, [
      set(v.surface, theme.tipSurface),
      set(v.border, theme.tipBorder),
      set(v.ink, theme.tipInk),
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
    when(tone.important, [
      set(v.surface, theme.importantSurface),
      set(v.border, theme.importantBorder),
      set(v.ink, theme.importantInk),
    ]),
    // The marker. A shape, not an icon: it keeps the tone legible for someone
    // who cannot tell the colours apart, together with the title text.
    pseudo.before([
      pseudo.content.empty,
      display.block,
      position.absolute,
      insetInlineStart(space(4)),
      insetBlockStart(space(4)),
      inlineSize(space(4)),
      blockSize(space(4)),
      radius(radii.full),
      bg(v.ink),
    ]),
  ],
  title: [
    display.block,
    marginBlockEnd(space(1)),
    fontFamily(displayFont),
    ...font(text.xs),
    fontWeight.bold,
    letterSpacing(unit.em(0.1)),
    color(v.ink),
  ],
  body: [display.block, ...font(text.sm), p(space(0))],
});
