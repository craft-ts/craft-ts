/**
 * The code block behind a fenced block, a `<<<` import and each tab of a code
 * group.
 *
 * Two axes drive it, both written by the Markdown pipeline and never computed
 * at render time: `syntax` on every token (what kind of word it is) and `mark`
 * on every line (highlighted, added, removed, error, warning, or dimmed because
 * another line has the focus). A mark is also a glyph in the gutter, so the
 * difference between "added" and "removed" does not rest on colour alone.
 *
 * The code surface is dark in both themes, which is why the colours here are
 * read straight from the palette instead of through a theme variable: there is
 * no second side to switch to.
 */
import {
  alignItems,
  bg,
  craftBase,
  cursor,
  interaction,
  prop,
  set,
  transitions,
  blockSize,
  borderBlockEndColor,
  borderBlockEndStyle,
  borderBlockEndWidth,
  borderWidth,
  p,
  borderInlineStartColor,
  borderInlineStartStyle,
  borderInlineStartWidth,
  color,
  craftStyles,
  defineStateAxis,
  display,
  font,
  fontFamily,
  fontWeight,
  gap,
  inlineSize,
  justifyContent,
  letterSpacing,
  lineHeight,
  lineWidth,
  marginBlockEnd,
  num,
  opacity,
  paddingInlineEnd,
  paddingInlineStart,
  provides,
  py,
  radius,
  scrollPort,
  shadow,
  space,
  text,
  textAlign,
  unit,
  userSelect,
  when,
  whiteSpace,
} from '@craft-ts/style';
import {
  arriving,
  duration,
  ease,
  herbier,
  monoFont,
  sansFont,
  theme,
  weight,
} from '../foundation/herbier.style.ts';

/** What the line means. A line without a mark is plain. */
export const mark = defineStateAxis('mark', [
  'highlight',
  'add',
  'remove',
  'error',
  'warning',
  'dim',
] as const);

const bar = unit.px(3);

export const codeUi = craftStyles('docCode', {
  root: [
    display.block,
    marginBlockEnd(space(5)),
    bg(herbier.surface.code),
    radius(theme.codeCorner),
    // The block floats a little above the page: a soft, opaque shadow.
    shadow({ y: unit.px(14), blur: unit.px(30), color: theme.codeLift }),
    // The code surface is dark in both themes, so the spruce ring of the page
    // would vanish on it in the light one: the ring is the pale green here.
    set(craftBase.focusRing, herbier.text.codeKeyword),
    ...arriving,
  ],
  bar: [
    display.flex,
    alignItems.center,
    justifyContent.spaceBetween,
    gap(space(3)),
    blockSize(unit.rem(2.375)),
    paddingInlineStart(space(5)),
    paddingInlineEnd(space(4)),
    fontFamily(monoFont),
    ...font(text.xs),
    color(herbier.text.codeComment),
    borderBlockEndWidth(lineWidth.hairline),
    borderBlockEndStyle.solid,
    borderBlockEndColor(herbier.border.codeLine),
  ],
  name: [color(herbier.text.codeComment)],
  tools: [display.flex, alignItems.center, gap(space(3))],
  lang: [
    fontFamily(sansFont),
    fontWeight(weight.semibold),
    letterSpacing(unit.em(0.04)),
    color(herbier.text.codeComment),
  ],
  // The "Copy" label: a small, quiet command in the bar of the block.
  copy: [
    display.inlineFlex,
    alignItems.center,
    gap(space(2)),
    bg(theme.clear),
    borderWidth(unit.px(0)),
    p(space(0)),
    cursor.pointer,
    fontFamily(sansFont),
    ...font(text.xs),
    fontWeight(weight.semibold),
    letterSpacing(unit.em(0.04)),
    color(herbier.text.codeKeyword),
    set(theme.glyph, herbier.text.codeKeyword),
    ...transitions([prop.color], { duration: duration.fast, easing: ease }),
    when(interaction.hover, [
      color(herbier.text.codePlain),
      set(theme.glyph, herbier.text.codePlain),
    ]),
  ],
  // The scroll port: `overflow` has no helper, and this is the one road to it.
  body: [
    display.block,
    py(space(3)),
    fontFamily(monoFont),
    ...font(text.sm),
    lineHeight(num(1.75)),
    color(herbier.text.codePlain),
    whiteSpace.pre,
    provides(scrollPort.inline),
  ],
  number: [
    display.inlineBlock,
    inlineSize(unit.rem(2)),
    textAlign.end,
    paddingInlineEnd(space(3)),
    color(herbier.text.codeComment),
    userSelect.none,
  ],
  // The glyph that says what the colour says, for readers who do not see it.
  glyph: [
    display.inlineBlock,
    inlineSize(unit.rem(1.25)),
    fontWeight(weight.bold),
    userSelect.none,
    when(mark.add, [color(herbier.text.codeAdd)]),
    when(mark.remove, [color(herbier.text.codeRemove)]),
    when(mark.error, [color(herbier.text.codeRemove)]),
    when(mark.warning, [color(herbier.text.codeWarning)]),
  ],
});

/**
 * A line of code. One class per meaning — not one class carrying every meaning
 * behind an attribute — because a page has thousands of lines and a class list
 * that names five alternatives would be written into each of them: a plain line
 * carries the atoms of a plain line and nothing else. The set stays closed and
 * enumerable; `data-mark` still says what the line means.
 */
const lineBase = [
  display.block,
  paddingInlineStart(space(5)),
  paddingInlineEnd(space(5)),
  borderInlineStartWidth(bar),
  borderInlineStartStyle.solid,
] as const;

export const lineUi = craftStyles('docCodeLine', {
  plain: [...lineBase, borderInlineStartColor(herbier.surface.code)],
  highlight: [
    ...lineBase,
    bg(herbier.surface.codeHighlight),
    borderInlineStartColor(herbier.text.codeHighlight),
  ],
  add: [
    ...lineBase,
    bg(herbier.surface.codeAdd),
    borderInlineStartColor(herbier.text.codeAdd),
  ],
  remove: [
    ...lineBase,
    bg(herbier.surface.codeRemove),
    borderInlineStartColor(herbier.text.codeRemove),
  ],
  error: [
    ...lineBase,
    bg(herbier.surface.codeRemove),
    borderInlineStartColor(herbier.text.codeRemove),
  ],
  warning: [
    ...lineBase,
    bg(herbier.surface.codeWarning),
    borderInlineStartColor(herbier.text.codeWarning),
  ],
  dim: [
    ...lineBase,
    borderInlineStartColor(herbier.surface.code),
    opacity(num(0.45)),
  ],
});

/** A word of code, by what kind of word it is. The same reasoning as the lines. */
export const tokenUi = craftStyles('docCodeToken', {
  plain: [],
  keyword: [color(herbier.text.codeKeyword)],
  function: [color(herbier.text.codeFunction)],
  string: [color(herbier.text.codeString)],
  number: [color(herbier.text.codeNumber)],
  type: [color(herbier.text.codeType)],
  comment: [color(herbier.text.codeComment)],
  punctuation: [color(herbier.text.codePunctuation)],
});
