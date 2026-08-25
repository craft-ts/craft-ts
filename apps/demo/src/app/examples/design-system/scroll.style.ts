/**
 * The case that motivated the whole thing.
 *
 * A back-to-top button is `position: sticky` and reads its scroll state through
 * a container query. Both need something it cannot provide itself: a scroll
 * port on the block axis, and an element declaring `container-type:
 * scroll-state`. Get either wrong and the button silently never changes, or
 * sticks to the wrong box.
 *
 * `requires(...)` is attached to the class that depends on it, not to the sheet:
 * the error then names a rule rather than a file.
 */
import {
  bg,
  blockSize,
  borderColor,
  borderStyle,
  borderWidth,
  color,
  containerType,
  craftStyles,
  cursor,
  display,
  font,
  insetBlockEnd,
  lineWidth,
  position,
  provides,
  px,
  py,
  radii,
  radius,
  requires,
  scrollPort,
  scrollState,
  space,
  text,
  unit,
  visibility,
  when,
} from '@craft-ts/style';
import { theme } from './foundation.style.ts';

export const backToTop = craftStyles(
  'backToTop',
  {
    /**
     * The sticky box, and the scroll-state container in one. The tail owned by
     * the shell gives it room to release at the end of the scroll range: a
     * last child with only `inset-block-end` is already stuck at the start and
     * remains stuck when its natural position reaches that inset.
     *
     * `scroll-state(stuck: …)` asks about the **container**, so the element
     * that sticks has to be the one that declares the container — the button
     * inside then reads its state. Making the scroll port the container
     * instead parses, applies, and never matches: the port is not what sticks.
     */
    anchor: [
      requires(scrollPort.block),
      provides(containerType.scrollState),
      position.sticky,
      insetBlockEnd(space(4)),
      display.block,
    ],

    /**
     * Visible by default, hidden with `visibility` while the anchor is stuck.
     *
     * The anchor is the last meaningful item, so `stuck: block-end` is the
     * transient state before the scroll range is exhausted. Inverting the
     * paint condition makes the button appear at the end, when the anchor has
     * released, while keeping its size available for sticky layout.
     */
    button: [
      visibility.visible,
      px(space(4)),
      py(space(2)),
      radius(radii.full),
      borderWidth(lineWidth.hairline),
      borderStyle.solid,
      borderColor(theme.border),
      bg(theme.raised),
      color(theme.ink),
      font(text.sm),
      cursor.pointer,

      // Do not paint the transient block-end-stuck state; paint the released
      // state at the end of the scroll range.
      when(scrollState.stuck.blockEnd, [visibility.hidden]),
    ],
  },
  { axes: [scrollState.stuck] },
);

/**
 * The layout that owns the scrollable region — and the only place the demands
 * above can be answered.
 *
 * `provides(...)` returns the CSS effect **and** the discharge in the same
 * object. `overflow` does not exist in the property table, so this is the one
 * road to `overflow-block: auto`: the wrong fix is not discouraged, it cannot
 * be written.
 */
export const shell = craftStyles('appShell', {
  main: [
    provides(scrollPort.block),
    display.block,
    // `provides(scrollPort.block)` already sets `min-block-size: 0` — writing
    // it again here would collapse into one atom anyway, and reading it as a
    // separate decision would hide that the pair travels together.
    blockSize(unit.vh(60)),
  ],

  /**
   * A typed trailing space lets the sticky anchor release at scroll end. It
   * must be larger than the anchor's block-end inset; otherwise the natural
   * position lands exactly on the sticky threshold and still reports stuck.
   */
  tail: [display.block, blockSize(space(8))],
});
