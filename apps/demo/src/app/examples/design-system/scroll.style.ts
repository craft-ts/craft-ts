/**
 * The case that motivated the whole thing.
 *
 * A back-to-top button is `position: sticky` and reads its scroll state through
 * a container query. Both need something it cannot provide itself: a scroll
 * port on the block axis, and an element declaring `container-type:
 * scroll-state`. The scroll port owns the latter because it is the element
 * whose scrollability the button needs to observe.
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
  insetBlockStart,
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
     * The sticky box. The anchor is the first child of the scroll port, so a
     * block-start inset keeps it visible while the rows below it move past.
     *
     * The scroll-state query is declared on the scroll port below, not here:
     * `scrollable: block-start` describes whether this port can scroll back
     * toward its start, while `stuck: …` would describe this anchor.
     */
    anchor: [
      requires(scrollPort.block),
      position.sticky,
      insetBlockStart(space(4)),
      display.block,
    ],

    /**
     * Hidden at the top, then visible as soon as the scroll port can scroll
     * back toward its block start. `visibility` keeps the anchor's size, so
     * hiding the button does not disable the sticky layout.
     */
    button: [
      visibility.hidden,
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

      when(scrollState.scrollable.blockStart, [
        visibility.visible,
        bg(theme.accent),
        borderColor(theme.accent),
        color(theme.onAccent),
      ]),
    ],
  },
  { axes: [scrollState.scrollable] },
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
    provides(containerType.scrollState),
    display.block,
    // `provides(scrollPort.block)` already sets `min-block-size: 0` — writing
    // it again here would collapse into one atom anyway, and reading it as a
    // separate decision would hide that the pair travels together.
    blockSize(unit.vh(60)),
  ],

  /**
   * A typed trailing space leaves room for the sticky anchor to finish its
   * containing block at scroll end instead of colliding with the edge.
   */
  tail: [display.block, blockSize(space(8))],
});
