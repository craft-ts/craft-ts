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
  bg,
  borderColor,
  borderEndEndRadius,
  borderEndStartRadius,
  borderInlineStartColor,
  borderInlineStartStyle,
  borderInlineStartWidth,
  borderStartEndRadius,
  borderStartStartRadius,
  borderStyle,
  borderWidth,
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
  lineWidth,
  marginBlockEnd,
  num,
  opacity,
  paddingInlineEnd,
  paddingInlineStart,
  provides,
  py,
  radii,
  scrollPort,
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
  mono,
  herbier,
  theme,
} from '../foundation/herbier.style.ts';

/** What kind of word a token is. The pipeline maps grammar scopes onto these. */
export const syntax = defineStateAxis('syntax', [
  'keyword',
  'function',
  'string',
  'number',
  'type',
  'comment',
  'punctuation',
] as const);

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
    marginBlockEnd(space(4)),
    bg(herbier.surface.code),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.lineStrong),
    borderStartStartRadius(radii.xl),
    borderStartEndRadius(radii.sm),
    borderEndEndRadius(radii.xl),
    borderEndStartRadius(radii.sm),
    ...arriving,
  ],
  bar: [
    display.flex,
    justifyContent.spaceBetween,
    gap(space(3)),
    py(space(2)),
    paddingInlineStart(space(4)),
    paddingInlineEnd(space(4)),
    fontFamily(mono),
    ...font(text.xs),
    color(herbier.text.codePunctuation),
    bg(herbier.surface.codeBar),
  ],
  name: [color(herbier.text.codePlain)],
  lang: [color(herbier.text.codePunctuation)],
  // The scroll port: `overflow` has no helper, and this is the one road to it.
  body: [
    display.block,
    py(space(3)),
    fontFamily(mono),
    ...font(text.sm),
    color(herbier.text.codePlain),
    whiteSpace.pre,
    provides(scrollPort.inline),
  ],
  line: [
    display.block,
    paddingInlineStart(space(4)),
    paddingInlineEnd(space(4)),
    borderInlineStartWidth(bar),
    borderInlineStartStyle.solid,
    borderInlineStartColor(herbier.surface.code),
    when(mark.highlight, [
      bg(herbier.surface.codeHighlight),
      borderInlineStartColor(herbier.border.codeHighlight),
    ]),
    when(mark.add, [
      bg(herbier.surface.codeAdd),
      borderInlineStartColor(herbier.border.codeAdd),
    ]),
    when(mark.remove, [
      bg(herbier.surface.codeRemove),
      borderInlineStartColor(herbier.border.codeRemove),
    ]),
    when(mark.error, [
      bg(herbier.surface.codeRemove),
      borderInlineStartColor(herbier.border.codeRemove),
    ]),
    when(mark.warning, [
      bg(herbier.surface.codeWarning),
      borderInlineStartColor(herbier.border.codeWarning),
    ]),
    when(mark.dim, [opacity(num(0.45))]),
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
    fontWeight.bold,
    userSelect.none,
    when(mark.add, [color(herbier.border.codeAdd)]),
    when(mark.remove, [color(herbier.border.codeRemove)]),
    when(mark.error, [color(herbier.border.codeRemove)]),
    when(mark.warning, [color(herbier.border.codeWarning)]),
  ],
  token: [
    when(syntax.keyword, [color(herbier.text.codeKeyword)]),
    when(syntax.function, [color(herbier.text.codeFunction)]),
    when(syntax.string, [color(herbier.text.codeString)]),
    when(syntax.number, [color(herbier.text.codeNumber)]),
    when(syntax.type, [color(herbier.text.codeType)]),
    when(syntax.comment, [color(herbier.text.codeComment)]),
    when(syntax.punctuation, [color(herbier.text.codePunctuation)]),
  ],
});
