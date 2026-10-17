/**
 * The shared look of the demo examples.
 *
 * The examples used to ship one stylesheet each — query, mutation, the table
 * demos, the full demo — and the `craft/` and `primitives/` variants of the
 * same example carried two copies of it. They share this sheet instead: a card,
 * the text inside it, controls, a data table, pagination and form fields.
 * What only one example has (the pixel grid, the task board) stays in that
 * example's own sheet, next to it.
 *
 * It is written on the Herbier theme (`../../herbier`): every colour is a
 * `theme` variable, so an example follows the page's light or dark side and its
 * season without knowing about either. The buttons, the badges and the fields
 * are the design system's own sheets (`buttonUi`, `badgeUi`).
 *
 * Variants are state axes, set as `data-*` attributes on the element:
 * `data-exampleCard` (the dark card of the mutation demos), `data-exampleText`
 * (muted, error, success), `data-exampleAlert` and `data-exampleField`.
 */
import {
  alignContent,
  at,
  alignItems,
  alignSelf,
  animate,
  bg,
  blockSize,
  borderBlockEndColor,
  borderBlockEndStyle,
  borderBlockEndWidth,
  borderCollapse,
  borderColor,
  borderInlineStartColor,
  borderInlineStartStyle,
  borderInlineStartWidth,
  borderStyle,
  borderTopColor,
  borderWidth,
  color,
  craftStyles,
  cursor,
  defineBreakpoints,
  defineStateAxis,
  display,
  easing,
  flex,
  gridTemplateColumns,
  flexDirection,
  flexWrap,
  font,
  fontFamily,
  fontSize,
  fontWeight,
  gap,
  inlineSize,
  interaction,
  justifyContent,
  keyframes,
  letterSpacing,
  lineHeight,
  lineWidth,
  listStyleType,
  marginBlockStart,
  marginInline,
  math,
  maxInlineSize,
  minBlockSize,
  minWidth,
  num,
  opacity,
  p,
  paddingInlineStart,
  provides,
  px,
  py,
  radii,
  radius,
  rotate,
  scrollPort,
  shadow,
  space,
  tracks,
  text,
  textAlign,
  textDecorationLine,
  unit,
  when,
  whiteSpace,
} from '@craft-ts/style';
import {
  bp,
  displayFont,
  herbier,
  monoFont,
  sansFont,
  paintDark,
  theme,
  weight,
} from '@craft-ts/ui/style';

/** The dark card of the mutation demos. Drives `data-exampleCard`. */
export const cardTone = defineStateAxis('exampleCard', ['dark']);

/** How serious an alert is. Drives `data-exampleAlert`. */
export const alertTone = defineStateAxis('exampleAlert', [
  'warning',
  'danger',
  'success',
]);

/** A field that takes the whole row. Drives `data-exampleField`. */
export const fieldWidth = defineStateAxis('exampleField', ['wide']);

/** A line of text with a meaning. Drives `data-exampleText`. */
export const textTone = defineStateAxis('exampleText', [
  'muted',
  'error',
  'success',
  'done',
]);


const hairline = (tint: Parameters<typeof borderColor>[0]) => [
  borderWidth(lineWidth.hairline),
  borderStyle.solid,
  borderColor(tint),
];

const split_bp = defineBreakpoints({ wide: at.minInlineSize(unit.rem(48)) });

const spin = keyframes('exampleSpin', { to: [rotate(unit.deg(360))] });

/** What a form control of the examples looks like: the design system's field. */
const control = [
  py(space(2)),
  px(space(3)),
  ...hairline(theme.lineStrong),
  radius(radii.md),
  fontFamily(sansFont),
  ...font(text.sm),
  color(theme.ink),
  bg(theme.raised),
  when(interaction.hover, [borderColor(theme.ink)]),
  when(interaction.focus, [borderColor(theme.action)]),
  when(interaction.disabled, [cursor.notAllowed, opacity(num(0.5))]),
];

export const example = craftStyles('example', {
  /** A full-width area, for the dashboards (table, sidebar). */
  page: [
    display.grid,
    alignContent.start,
    gap(space(5)),
    minBlockSize(unit.pct(100)),
    color(theme.ink),
    bg(theme.surface),
  ],
  /** The card an example sits in. */
  card: [
    display.grid,
    gap(space(4)),
    inlineSize(math.min(unit.pct(100), unit.rem(46))),
    marginInline.auto,
    marginBlockStart(space(1)),
    p(math.clamp(unit.rem(1.125), unit.vw(4.5), unit.rem(2))),
    ...hairline(theme.line),
    radius(radii.lg),
    color(theme.ink),
    bg(theme.raised),
    shadow({ y: unit.rem(0.5), blur: unit.rem(1.5), color: theme.shadow }),
    when(bp.medium, [marginBlockStart(space(5)), gap(space(5))]),
    // The dark card is the system's other side, painted on this subtree: its
    // children keep reading `theme`, and none of them mentions the tone.
    when(cardTone.dark, paintDark),
    when(cardTone.dark, [inlineSize(math.min(unit.pct(100), unit.px(420)))]),
  ],
  /** A wide panel with no card chrome of its own, for the table demos. */
  panel: [
    inlineSize(unit.pct(100)),
    maxInlineSize(unit.px(900)),
    marginInline.auto,
    p(space(4)),
    ...hairline(theme.line),
    radius(radii.lg),
    bg(theme.raised),
    when(bp.medium, [p(space(6))]),
  ],
  title: [
    display.flex,
    alignItems.center,
    gap(space(2)),
    fontFamily(displayFont),
    fontSize(math.clamp(unit.rem(1.5), unit.vw(6.5), unit.rem(1.75))),
    fontWeight(weight.medium),
    lineHeight(num(1.2)),
    flexWrap.wrap,
  ],
  subtitle: [
    fontFamily(displayFont),
    ...font(text.lg),
    fontWeight(weight.medium),
  ],
  text: [
    lineHeight(num(1.5)),
    when(textTone.muted, [color(theme.inkMuted)]),
    when(textTone.error, [color(theme.dangerInk)]),
    when(textTone.success, [color(theme.tipInk)]),
  ],
  row: [display.flex, flexWrap.wrap, alignItems.center, gap(space(2))],
  /** A row of controls in a tinted band. */
  toolbar: [
    display.flex,
    flexWrap.wrap,
    alignItems.center,
    gap(space(3)),
    py(space(3)),
    px(space(4)),
    ...hairline(theme.line),
    radius(radii.lg),
    bg(theme.navHover),
  ],
  stack: [display.grid, gap(space(3))],
  result: [
    p(math.clamp(unit.rem(1), unit.vw(3), unit.rem(1.5))),
    ...hairline(theme.line),
    radius(radii.md),
    ...font(text.base),
    fontWeight(weight.bold),
    bg(theme.navHover),
  ],
  /** A console: the code surface is dark in both themes. */
  code: [
    marginBlockStart(space(4)),
    py(space(4)),
    px(space(4)),
    provides(scrollPort.inline),
    radius(radii.md),
    fontFamily(monoFont),
    ...font(text.sm),
    fontWeight(weight.regular),
    whiteSpace.preWrap,
    color(herbier.text.codePlain),
    bg(theme.code),
  ],
  note: [
    py(space(3)),
    px(space(4)),
    borderInlineStartWidth(unit.px(3)),
    borderInlineStartStyle.solid,
    borderInlineStartColor(theme.decor),
    radius(radii.md),
    ...font(text.sm),
    color(theme.inkMuted),
    bg(theme.navHover),
  ],
  actions: [
    display.flex,
    flexWrap.wrap,
    alignItems.center,
    justifyContent.flexEnd,
    gap(space(3)),
  ],
  label: [
    fontFamily(sansFont),
    ...font(text.sm),
    fontWeight(weight.semibold),
    color(theme.inkMuted),
  ],
  input: [
    inlineSize(unit.pct(100)),
    maxInlineSize(unit.px(300)),
    minWidth(space(0)),
    ...control,
    when(fieldWidth.wide, [maxInlineSize.none]),
  ],
  select: [...control, fontWeight(weight.medium), cursor.pointer],
  table: [inlineSize(unit.pct(100)), borderCollapse.collapse, ...font(text.sm)],
  tableRow: [when(interaction.hover, [bg(theme.navHover)])],
  emptyCell: [p(space(8)), textAlign.center],
  th: [
    py(space(3)),
    px(space(3)),
    textAlign.start,
    borderBlockEndWidth(lineWidth.hairline),
    borderBlockEndStyle.solid,
    borderBlockEndColor(theme.line),
    fontWeight(weight.semibold),
    color(theme.inkMuted),
    bg(theme.navHover),
  ],
  td: [
    py(space(3)),
    px(space(3)),
    textAlign.start,
    borderBlockEndWidth(lineWidth.hairline),
    borderBlockEndStyle.solid,
    borderBlockEndColor(theme.line),
  ],
  pagination: [
    display.flex,
    flexWrap.wrap,
    alignItems.center,
    justifyContent.spaceBetween,
    gap(space(2)),
    marginBlockStart(space(4)),
  ],
  currentPage: [
    alignSelf.center,
    fontWeight(weight.semibold),
    color(theme.inkMuted),
  ],
  list: [display.grid, gap(space(2)), p(space(0)), listStyleType.none],
  item: [
    display.flex,
    alignItems.center,
    justifyContent.spaceBetween,
    gap(space(3)),
    py(space(3)),
    px(space(4)),
    ...hairline(theme.line),
    radius(radii.md),
    bg(theme.raised),
  ],
  /** The label of a list item; `data-exampleText="done"` strikes it through. */
  itemTitle: [
    flex(num(1)),
    when(textTone.done, [
      color(theme.inkSubtle),
      textDecorationLine.lineThrough,
    ]),
  ],
  error: [
    py(space(3)),
    px(space(4)),
    ...hairline(theme.dangerBorder),
    radius(radii.md),
    color(theme.dangerInk),
    bg(theme.dangerSurface),
  ],
  hint: [...font(text.xs), color(theme.inkMuted)],
  spinner: [
    display.inlineBlock,
    inlineSize(space(4)),
    blockSize(space(4)),
    borderWidth(lineWidth.thick),
    borderStyle.solid,
    borderColor(theme.line),
    borderTopColor(theme.action),
    radius(radii.full),
    animate(spin, {
      duration: unit.ms(800),
      easing: easing.linear,
      iterations: 'infinite',
    }),
  ],
  sidebar: [inlineSize(unit.px(300)), flex(num(0))],
  /** An error screen or a warning block. */
  alert: [
    display.grid,
    gap(space(3)),
    p(space(8)),
    ...hairline(theme.line),
    radius(radii.md),
    bg(theme.navHover),
    when(alertTone.warning, [
      borderColor(theme.warningBorder),
      color(theme.warningInk),
      bg(theme.warningSurface),
    ]),
    when(alertTone.danger, [
      borderColor(theme.dangerBorder),
      color(theme.dangerInk),
      bg(theme.dangerSurface),
    ]),
    when(alertTone.success, [
      borderColor(theme.tipBorder),
      color(theme.tipInk),
      bg(theme.tipSurface),
    ]),
  ],
  hero: [
    display.grid,
    gap(space(2)),
    p(space(6)),
    radius(radii.xl),
    color(herbier.text.codePlain),
    bg(theme.code),
  ],
  split: [
    display.grid,
    gap(space(5)),
    gridTemplateColumns(tracks.list(tracks.minmax(space(0), tracks.fr(1)))),
    when(split_bp.wide, [
      gridTemplateColumns(
        tracks.list(
          tracks.minmax(space(0), tracks.fr(1.2)),
          tracks.minmax(space(0), tracks.fr(1)),
        ),
      ),
    ]),
  ],
  tealCard: [
    display.grid,
    gap(space(3)),
    p(space(6)),
    ...hairline(theme.tipBorder),
    radius(radii.xl),
    bg(theme.tipSurface),
  ],
  centered: [
    display.flex,
    flexDirection.column,
    alignItems.center,
    gap(space(4)),
    p(space(8)),
  ],
  bigValue: [
    fontFamily(displayFont),
    fontSize(unit.rem(3)),
    fontWeight(weight.medium),
  ],
  box: [
    display.grid,
    gap(space(1)),
    p(space(3)),
    ...hairline(theme.line),
    radius(radii.md),
    bg(theme.navHover),
  ],
  tiles: [
    display.grid,
    gridTemplateColumns(tracks.autoFit(unit.rem(10))),
    gap(space(3)),
  ],
  definitions: [
    display.grid,
    gridTemplateColumns(tracks.list('auto', tracks.fr(1))),
    gap(space(2)),
  ],
  term: [fontWeight(weight.semibold), color(theme.ink)],
  definition: [color(theme.inkMuted)],
  columns: [display.flex, flexDirection.column, gap(space(6))],
  fieldset: [display.grid, gap(space(2)), paddingInlineStart(space(0))],
  mono: [fontFamily(monoFont), ...font(text.sm), letterSpacing(unit.em(0))],
});
