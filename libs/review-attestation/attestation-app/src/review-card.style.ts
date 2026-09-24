/**
 * The review card: its heading, the evidence (a frozen page or a picture, or
 * the template statement), and the decision column beside it.
 *
 * Which evidence a card shows depends on its kind. The card's children bind
 * `data-reviewKind` themselves and hide on the kinds they do not apply to —
 * the old sheet reached them from the card with descendant selectors.
 */
import {
  alignItems,
  alignSelf,
  at,
  backdropBlur,
  bg,
  bgImage,
  bgSize,
  blockSize,
  borderColor,
  borderInlineStartColor,
  borderInlineStartStyle,
  borderInlineStartWidth,
  borderStyle,
  borderWidth,
  bottom,
  color,
  craftStyles,
  cssVars,
  kind,
  cursor,
  defineBreakpoints,
  defineStateAxis,
  display,
  flex,
  flexDirection,
  flexWrap,
  fontFamily,
  fontSize,
  fontVariantNumeric,
  fontWeight,
  gap,
  gradient,
  gridTemplateColumns,
  inlineSize,
  interaction,
  ariaPressed,
  justifyContent,
  left,
  letterSpacing,
  lineHeight,
  lineWidth,
  marginBlock,
  marginBlockEnd,
  marginBlockStart,
  marginInline,
  maxBlockSize,
  maxInlineSize,
  math,
  minBlockSize,
  minWidth,
  monospaceStack,
  num,
  opacity,
  overflowWrap,
  p,
  paddingBlockStart,
  paddingInlineStart,
  placeItems,
  pointerEvents,
  position,
  provides,
  pseudo,
  px,
  py,
  radii,
  radius,
  resize,
  scrollPort,
  shadow,
  space,
  textTransform,
  top,
  tracks,
  transformOrigin,
  unit,
  when,
  whiteSpace,
  wordBreak,
  zIndex,
  right,
  spanAllColumns,
  int,
  cssString,
  clipOverflow,
  inset,
  justifyItems,
  columnGap,
  rowGap,
} from '@craft-ts/style';
import { reviewFont, reviewUi, theme } from './review-app.style';

/** A card's kind, bound on the pieces that only some kinds show. */
export const reviewKind = defineStateAxis('reviewKind', [
  'visual',
  'template',
  'removal',
  'folder-layout',
  'eslint-disable',
  'architecture-waiver',
]);

/** How the evidence picture is drawn. Drives `data-zoom`. */
export const zoomMode = defineStateAxis('zoom', ['fit', 'actual']);

/** A button's role in a row of actions. The default is the plain button. */
export const actionTone = defineStateAxis('reviewAction', [
  'primary',
  'danger',
]);

/** The tone of a notice. The default is an error. */
export const noticeTone = defineStateAxis('reviewNotice', [
  'cluster',
  'warning',
  'degraded',
]);

const bp = defineBreakpoints({ wide: at.minInlineSize(unit.px(761)) });

/**
 * Where a box drawn over the evidence sits: the selection band (pixels, from
 * the pointer) and the fold (percentages of the picture). Written with
 * `assign(...)`; the boxes read them.
 */
export const evidenceBox = cssVars('evidenceBox', {
  left: kind.lengthPercentage(unit.px(0)),
  top: kind.lengthPercentage(unit.px(0)),
  width: kind.lengthPercentage(unit.px(0)),
  height: kind.lengthPercentage(unit.px(0)),
});

const placed = [
  left(evidenceBox.left),
  top(evidenceBox.top),
  inlineSize(evidenceBox.width),
  blockSize(evidenceBox.height),
];
const transparent = reviewUi.surface.transparent;

const hairline = (tint: Parameters<typeof borderColor>[0]) => [
  borderWidth(lineWidth.hairline),
  borderStyle.solid,
  borderColor(tint),
];

const hideOn = (
  ...kinds: readonly (typeof reviewKind)[keyof typeof reviewKind][]
) => kinds.map((kind) => when(kind, [display.none]));

/** Small shared pieces: the eyebrow, code, chips, key caps, links. */
export const reviewBits = craftStyles('reviewBits', {
  eyebrow: [
    display.block,
    letterSpacing(unit.em(0.14)),
    fontWeight(num(700)),
    color(theme.textDim),
  ],
  code: [fontFamily(monospaceStack)],
  subject: [
    display.block,
    maxInlineSize(unit.px(760)),
    fontFamily(monospaceStack),
    fontSize(unit.px(12)),
    overflowWrap.anywhere,
    color(theme.textDim),
  ],
  sourceLink: [
    display.inlineBlock,
    marginBlockStart(unit.px(5)),
    fontSize(unit.px(12)),
    fontWeight(num(650)),
    color(theme.accentLink),
    when(interaction.hover, [color(theme.accentHover)]),
  ],
  chip: [
    py(unit.px(4)),
    px(unit.px(8)),
    ...hairline(theme.lineStrong),
    radius(radii.full),
    fontSize(unit.px(12)),
    whiteSpace.nowrap,
    fontVariantNumeric.tabularNums,
    color(theme.textMuted),
    bg(theme.surfaceRaised),
  ],
  key: [
    marginInline(unit.px(4)),
    borderStyle.solid,
    borderColor(theme.lineStrong),
    borderWidth(lineWidth.hairline),
    radius(unit.px(4)),
    px(unit.px(5)),
    fontSize(unit.px(11)),
  ],
  /** A button in an action row: plain, primary or danger. */
  button: [
    py(unit.px(8)),
    px(unit.px(10)),
    ...hairline(theme.lineStrong),
    radius(unit.px(7)),
    color(theme.text),
    bg(theme.surfaceSunken),
    when(actionTone.primary, [
      borderColor(theme.accent),
      color(theme.onAccent),
      bg(theme.accentActive),
    ]),
    when(actionTone.danger, [
      borderColor(theme.dangerBorder),
      color(theme.dangerText),
      bg(theme.dangerBgHover),
    ]),
    when(interaction.hover, [borderColor(theme.accentHover)]),
  ],
  list: [marginBlock(space(0)), paddingInlineStart(unit.px(20))],
  muted: [color(theme.textMuted)],
  dim: [color(theme.textDim)],
});

/** Error, cluster, warning and degraded notices. */
export const notice = craftStyles('reviewNotice', {
  root: [
    inlineSize(math.min(unit.px(1180), unit.pct(100))),
    marginInline.auto,
    marginBlockStart(unit.px(14)),
    py(unit.px(10)),
    px(unit.px(12)),
    radius(unit.px(7)),
    // An error, unless the tone says otherwise.
    display.flex,
    alignItems.flexStart,
    gap(unit.px(10)),
    ...hairline(theme.dangerBorder),
    borderInlineStartWidth(unit.px(4)),
    borderInlineStartColor(theme.danger),
    color(theme.dangerText),
    bg(theme.dangerBg),
    shadow({ y: unit.px(8), blur: unit.px(24), color: theme.shadow }),
    when(noticeTone.cluster, [
      display.block,
      inlineSize(unit.pct(100)),
      marginBlockStart(space(0)),
      marginBlockEnd(unit.px(14)),
      borderInlineStartWidth(lineWidth.hairline),
      borderColor(theme.accentBorder),
      color(theme.accentText),
      bg(theme.accentBg),
      shadow({ y: unit.px(0), blur: unit.px(0), color: transparent }),
    ]),
    when(noticeTone.warning, [
      display.block,
      borderInlineStartWidth(lineWidth.hairline),
      borderColor(theme.warnBorder),
      color(theme.warnText),
      bg(theme.warnBg),
      shadow({ y: unit.px(0), blur: unit.px(0), color: transparent }),
    ]),
    when(noticeTone.degraded, [
      display.block,
      inlineSize(unit.pct(100)),
      marginBlockStart(space(0)),
      marginBlockEnd(unit.px(12)),
      borderInlineStartWidth(lineWidth.hairline),
      borderColor(theme.warnBorder),
      color(theme.warnText),
      bg(theme.warnBg),
      shadow({ y: unit.px(0), blur: unit.px(0), color: transparent }),
    ]),
  ],
  icon: [
    display.grid,
    flex.none,
    placeItems.center,
    inlineSize(unit.px(22)),
    blockSize(unit.px(22)),
    borderWidth(lineWidth.hairline),
    borderStyle.solid,
    borderColor(theme.dangerText),
    radius(radii.full),
    fontWeight(num(800)),
    lineHeight(num(1)),
  ],
  copy: [minWidth(unit.px(0))],
  title: [display.block, color(theme.dangerTextHover)],
  body: [marginBlockStart(unit.px(5)), color(theme.dangerText)],
  warningTitle: [display.block, marginBlockEnd(unit.px(6))],
  detail: [marginBlockStart(unit.px(6))],
  detailSummary: [cursor.pointer, fontSize(unit.px(12)), opacity(num(0.85))],
  detailLine: [
    fontFamily(monospaceStack),
    fontSize(unit.px(12)),
    wordBreak.breakAll,
  ],
});

/** The shell of the review: the panel, the card grid, heading and columns. */
export const reviewCard = craftStyles('reviewCard', {
  panel: [
    minWidth(unit.px(0)),
    py(unit.px(20)),
    px(unit.px(14)),
    when(bp.wide, [
      paddingBlockStart(unit.px(28)),
      px(math.clamp(unit.px(18), unit.vw(4), unit.px(56))),
    ]),
  ],
  card: [
    inlineSize(math.min(unit.px(1700), unit.pct(100))),
    marginInline.auto,
    display.grid,
    gridTemplateColumns(tracks.list(tracks.minmax(unit.px(0), tracks.fr(1)))),
    alignItems.start,
    // Rows touch: the heading and the notices carry their own bottom margin.
    rowGap(unit.px(0)),
    columnGap(unit.px(28)),
    when(bp.wide, [
      gridTemplateColumns(
        tracks.list(
          tracks.minmax(unit.px(0), tracks.fr(1)),
          tracks.minmax(unit.px(320), unit.px(400)),
        ),
      ),
    ]),
  ],
  /** Spans both columns: the heading, the cluster notice, the member list. */
  fullRow: [spanAllColumns],
  heading: [
    display.flex,
    flexDirection.column,
    alignItems.stretch,
    gap(unit.px(24)),
    marginBlockEnd(unit.px(18)),
    when(bp.wide, [
      flexDirection.row,
      alignItems.flexStart,
      justifyContent.spaceBetween,
    ]),
  ],
  reason: [
    flex.none,
    alignSelf.flexStart,
    py(unit.px(6)),
    px(unit.px(10)),
    radius(radii.full),
    color(theme.warnText),
    bg(theme.warnBg),
  ],
  members: [
    marginBlockEnd(unit.px(14)),
    py(unit.px(12)),
    px(unit.px(16)),
    borderInlineStartWidth(lineWidth.thick),
    borderInlineStartStyle.solid,
    borderInlineStartColor(theme.accent),
    color(theme.textMuted),
  ],
  evidence: [minWidth(unit.px(0))],
  decision: [
    minWidth(unit.px(0)),
    display.grid,
    gap(unit.px(14)),
    p(unit.px(16)),
    ...hairline(theme.line),
    radius(unit.px(10)),
    bg(theme.surface),
    when(bp.wide, [position.sticky, top(unit.px(18))]),
  ],
});

/** The template and removal evidence. */
export const templateEvidence = craftStyles('reviewTemplateEvidence', {
  root: [
    display.grid,
    gap(unit.px(10)),
    p(unit.px(18)),
    ...hairline(theme.line),
    radius(unit.px(12)),
    bg(theme.surface),
    ...hideOn(
      reviewKind.visual,
      reviewKind['folder-layout'],
      reviewKind['eslint-disable'],
      reviewKind['architecture-waiver'],
    ),
  ],
  statement: [fontSize(unit.px(16))],
  effects: [marginBlockStart(unit.px(8)), paddingInlineStart(unit.px(24))],
  source: [display.grid, gap(unit.px(10))],
  sourceSection: [display.grid, gap(unit.px(5)), minWidth(unit.px(0))],
  sourceLocation: [fontFamily(monospaceStack), color(theme.textMuted)],
  sourceCode: [
    p(unit.px(12)),
    provides(scrollPort.inline),
    whiteSpace.pre,
    ...hairline(theme.line),
    radius(unit.px(8)),
    fontFamily(monospaceStack),
    fontSize(unit.px(12)),
    lineHeight(num(1.5)),
    bg(theme.surfaceSunken),
  ],
});

/** The visual evidence: toolbar, views, canvas, replay, picture, diff. */
export const imageEvidence = craftStyles('reviewVisualEvidence', {
  toolbar: [
    display.flex,
    flexDirection.column,
    alignItems.stretch,
    gap(unit.px(16)),
    marginBlockEnd(unit.px(10)),
    ...hideOn(
      reviewKind.template,
      reviewKind.removal,
      reviewKind['folder-layout'],
      reviewKind['eslint-disable'],
      reviewKind['architecture-waiver'],
    ),
    when(bp.wide, [
      flexDirection.row,
      flexWrap.wrap,
      alignItems.center,
      justifyContent.spaceBetween,
    ]),
  ],
  metadata: [display.flex, flexWrap.wrap, gap(unit.px(6))],
  views: [display.flex, flexWrap.wrap, alignItems.center, gap(unit.px(10))],
  fieldLabel: [
    fontSize(unit.px(11)),
    fontWeight(num(700)),
    letterSpacing(unit.em(0.14)),
    textTransform.uppercase,
    color(theme.textDim),
  ],
  toggle: [
    display.inlineFlex,
    p(unit.px(3)),
    ...hairline(theme.lineStrong),
    radius(unit.px(8)),
    bg(theme.surfaceRaised),
  ],
  toggleButton: [
    py(unit.px(5)),
    px(unit.px(12)),
    whiteSpace.nowrap,
    ...hairline(transparent),
    radius(unit.px(6)),
    color(theme.textMuted),
    bg(transparent),
    when(interaction.hover, [color(theme.text)]),
    when(ariaPressed.pressed, [
      borderColor(theme.accentBorder),
      fontWeight(num(600)),
      color(theme.accentText),
      bg(theme.accentBg),
    ]),
    when(interaction.disabled, [color(theme.textDim)]),
  ],
  overlayToggle: [
    py(unit.px(6)),
    px(unit.px(12)),
    whiteSpace.nowrap,
    ...hairline(theme.lineStrong),
    radius(unit.px(8)),
    color(theme.textMuted),
    bg(theme.surfaceRaised),
    when(ariaPressed.pressed, [
      borderColor(theme.warnBorder),
      color(theme.warnText),
      bg(theme.warnBg),
    ]),
  ],
  help: [marginBlockEnd(unit.px(10)), color(theme.textDim)],
  canvas: [
    minBlockSize(unit.px(300)),
    maxBlockSize(unit.vh(68)),
    ...hairline(theme.lineStrong),
    radius(unit.px(10)),
    bg(theme.surfaceSunken),
    // The checkerboard a transparent capture is judged on.
    bgImage(
      gradient.repeatingConic([
        [theme.checker, unit.pct(0), unit.pct(25)],
        [transparent, unit.pct(0), unit.pct(50)],
      ]),
    ),
    bgSize(unit.px(20), unit.px(20)),
    // Both axes: at actual size a capture is wider than the column.
    provides(scrollPort.block),
    provides(scrollPort.inline),
    // The rows stretch, so the empty-state message centres on its auto margins.
    display.grid,
    alignItems.start,
    justifyItems.center,
    p(unit.px(18)),
    when(bp.wide, [minBlockSize(unit.px(420)), p(unit.px(32))]),
  ],
  /** The visual-test detail: a canvas that fills the column. */
  detailCanvas: [
    inlineSize(unit.pct(100)),
    minBlockSize(unit.px(260)),
    maxBlockSize(unit.vh(70)),
    ...hairline(theme.lineStrong),
    radius(unit.px(10)),
    bg(theme.surfaceSunken),
    display.grid,
    placeItems.center,
    p(unit.px(32)),
  ],
  picture: [
    display.block,
    blockSize.auto,
    bg(reviewUi.surface.frame),
    shadow({ y: unit.px(12), blur: unit.px(40), color: theme.shadow }),
    when(zoomMode.fit, [
      maxInlineSize(unit.pct(100)),
      maxBlockSize(math.max(unit.px(200), unit.vh(60))),
      inlineSize.auto,
    ]),
    when(zoomMode.actual, [maxInlineSize.none]),
  ],
  caption: [
    position.sticky,
    left(unit.px(0)),
    alignSelf.end,
    marginBlockStart(unit.px(18)),
    py(unit.px(5)),
    px(unit.px(8)),
    radius(unit.px(5)),
    fontSize(unit.px(12)),
    color(theme.textDim),
    bg(theme.caption),
  ],
  noImage: [marginInline.auto, marginBlock.auto, color(theme.textDim)],
  replayHolder: [
    position.relative,
    display.block,
    maxInlineSize(unit.pct(100)),
    clipOverflow.block,
    clipOverflow.inline,
    ...hairline(theme.lineStrong),
    radius(unit.px(8)),
  ],
  replayScale: [position.relative, transformOrigin.left],
  /** No border: it would be taken out of the captured viewport. */
  frame: [display.block, borderStyle.none, bg(reviewUi.surface.frame)],
  imageHolder: [
    position.relative,
    display.inlineBlock,
    maxInlineSize(unit.pct(100)),
    lineHeight(num(0)),
    provides(scrollPort.block),
  ],
  /** Where the viewport ended; everything outside it is dimmed. */
  fold: [
    position.absolute,
    ...placed,
    pointerEvents.none,
    borderWidth(lineWidth.thick),
    borderStyle.dashed,
    borderColor(theme.accentLink),
    shadow({
      y: unit.px(0),
      blur: unit.px(0),
      spread: unit.px(9999),
      color: reviewUi.effect.fold,
    }),
    pseudo.after([
      pseudo.content.text(cssString('on screen at capture')),
      position.absolute,
      right(unit.px(4)),
      bottom(unit.px(4)),
      py(unit.px(2)),
      px(unit.px(6)),
      radius(unit.px(4)),
      fontFamily(reviewFont),
      fontSize(unit.px(11)),
      fontWeight(num(600)),
      lineHeight(num(1.4)),
      color(theme.accentText),
      bg(theme.accentBg),
    ]),
  ],
  band: [position.absolute, ...placed, pointerEvents.none, zIndex(int(2))],
  diff: [
    marginBlockStart(unit.px(18)),
    py(unit.px(16)),
    px(unit.px(18)),
    ...hairline(theme.lineStrong),
    radius(unit.px(9)),
    bg(theme.surface),
    ...hideOn(
      reviewKind.template,
      reviewKind.removal,
      reviewKind['folder-layout'],
      reviewKind['eslint-disable'],
      reviewKind['architecture-waiver'],
    ),
  ],
  diffLine: [fontFamily(monospaceStack), color(theme.accentText)],
});

/** The decision column: previous rejection, the reason, the actions. */
export const decisionColumn = craftStyles('reviewDecisionColumn', {
  previousRejection: [
    py(unit.px(16)),
    px(unit.px(18)),
    ...hairline(theme.dangerBorder),
    borderInlineStartWidth(unit.px(4)),
    borderInlineStartColor(theme.danger),
    radius(unit.px(9)),
    color(theme.dangerTextHover),
    bg(theme.dangerBg),
  ],
  previousRejectionTitle: [color(theme.dangerText)],
  previousRejectionBody: [whiteSpace.preWrap],
  panel: [
    p(unit.px(12)),
    ...hairline(theme.lineStrong),
    radius(unit.px(10)),
    bg(theme.scrim),
    backdropBlur(unit.px(14)),
  ],
  fieldRow: [
    display.flex,
    alignItems.baseline,
    justifyContent.spaceBetween,
    gap(unit.px(10)),
    marginBlockEnd(unit.px(6)),
  ],
  label: [display.block, fontWeight(num(700))],
  selectionTag: [
    py(unit.px(2)),
    px(unit.px(8)),
    ...hairline(theme.accentBorder),
    radius(radii.full),
    fontSize(unit.px(11)),
    fontWeight(num(600)),
    whiteSpace.nowrap,
    color(theme.accentText),
    bg(theme.accentBg),
  ],
  help: [display.block, marginBlockStart(unit.px(5)), color(theme.textDim)],
  error: [
    display.block,
    marginBlockStart(unit.px(5)),
    color(theme.dangerHover),
  ],
  retirement: [
    display.grid,
    gridTemplateColumns(tracks.list(tracks.fr(1), 'auto')),
    gap(unit.px(8)),
    alignItems.end,
    marginBlockStart(unit.px(9)),
  ],
  /** The reason's label spans the row; the select and the button share one. */
  retirementLabel: [spanAllColumns],
  actions: [
    marginBlockStart(unit.px(9)),
    display.grid,
    gridTemplateColumns(tracks.equal(2)),
    gap(unit.px(8)),
    ...hideOn(reviewKind.removal),
    when(bp.wide, [display.flex, justifyContent.flexEnd, flexWrap.wrap]),
  ],
  /** A disabled decision stays opaque, so its hint stays readable. */
  decisionButton: [
    when(interaction.disabled, [
      opacity(num(1)),
      borderColor(theme.line),
      color(theme.textDim),
      bg(theme.surfaceSunken),
    ]),
  ],
});

/** The regeneration and iteration dialogs. */
export const dialog = craftStyles('reviewDialog', {
  backdrop: [
    position.fixed,
    zIndex(int(1000)),
    inset(unit.px(0)),
    display.grid,
    placeItems.center,
    p(unit.px(24)),
    bg(theme.backdrop),
    backdropBlur(unit.px(4)),
  ],
  root: [
    display.grid,
    gap(unit.px(12)),
    inlineSize(math.min(unit.px(760), unit.pct(100))),
    maxBlockSize(math.min(unit.px(760), unit.vh(90))),
    provides(scrollPort.block),
    p(unit.px(24)),
    ...hairline(theme.lineStrong),
    radius(unit.px(14)),
    color(theme.text),
    bg(theme.surfaceRaised),
    shadow({ y: unit.px(24), blur: unit.px(70), color: theme.shadowStrong }),
  ],
  narrow: [inlineSize(math.min(unit.px(560), unit.pct(100)))],
  title: [fontSize(unit.px(22)), color(theme.textBright)],
  body: [color(theme.textMuted)],
  consequences: [
    display.grid,
    gap(unit.px(9)),
    paddingInlineStart(unit.px(22)),
    color(theme.textMuted),
  ],
  actions: [
    display.flex,
    flexWrap.wrap,
    justifyContent.flexEnd,
    gap(unit.px(10)),
  ],
  button: [
    py(unit.px(9)),
    px(unit.px(14)),
    ...hairline(theme.lineStrong),
    radius(unit.px(7)),
    color(theme.text),
    bg(theme.surfaceSunken),
    when(interaction.hover, [borderColor(theme.accentHover)]),
    when(actionTone.primary, [
      borderColor(theme.accent),
      color(theme.onAccent),
      bg(theme.accentActive),
    ]),
  ],
  status: [
    py(unit.px(10)),
    px(unit.px(12)),
    radius(unit.px(7)),
    color(theme.accentText),
    bg(theme.accentBg),
  ],
  prompt: [
    inlineSize(unit.pct(100)),
    minBlockSize(unit.px(250)),
    resize.vertical,
    p(unit.px(10)),
    ...hairline(theme.accentBorder),
    radius(unit.px(7)),
    fontFamily(monospaceStack),
    fontSize(unit.px(12)),
    lineHeight(num(1.4)),
    color(theme.text),
    bg(theme.surfaceSunken),
  ],
  copy: [
    py(unit.px(7)),
    px(unit.px(9)),
    ...hairline(theme.accentBorder),
    radius(unit.px(6)),
    fontWeight(num(650)),
    color(theme.accentText),
    bg(theme.surface),
  ],
});
