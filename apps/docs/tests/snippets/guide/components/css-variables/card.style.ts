// #region sheet
import {
  bg,
  color,
  craftStyles,
  cssVars,
  defineStateAxis,
  inlineSize,
  kind,
  p,
  palette,
  radius,
  set,
  space,
  unit,
  when,
} from '@craft-ts/style';

const inherited = { inherits: true };

/** The card's public variables. Each has a typed initial value. */
export const cardVars = cssVars('tokenCard', {
  ink: kind.color(palette.text.strong, inherited),
  bg: kind.color(palette.surface.raised, inherited),
  radius: kind.length(unit.px(16), inherited),
});

/** A caller picks a look; without one, every variable keeps its initial value. */
export const cardLook = defineStateAxis('cardLook', ['alert']);

export const card = craftStyles('tokenCard', {
  root: [
    p(space(4)),
    color(cardVars.ink),
    bg(cardVars.bg),
    radius(cardVars.radius),
    when(cardLook.alert, [
      set(cardVars.ink, palette.accent.danger),
      set(cardVars.bg, palette.surface.sunken),
    ]),
  ],
});

/** A panel exposes its own variable and forwards it to the card inside it. */
export const panelVars = cssVars('cardPanel', {
  ink: kind.color(palette.accent.info, inherited),
});

export const panel = craftStyles('cardPanel', {
  root: [p(space(4)), set(cardVars.ink, panelVars.ink)],
});

/** A registered percentage, written at runtime and interpolable. */
export const meterVars = cssVars('cardMeter', {
  value: kind.percentage(unit.pct(0)),
});

export const meter = craftStyles('cardMeter', {
  fill: [inlineSize(meterVars.value), bg(cardVars.ink)],
});
// #endregion sheet
