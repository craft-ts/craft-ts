/**
 * The Effect demo's whole styling: the font, the document, the shell, and one
 * sheet every example shares.
 *
 * Each example used to repeat the same card in its own `styles`, with its own
 * hue. The card is written once here; the hue is a state axis on the card
 * root (`data-exampleTint`) that sets the card's theme variables, and every
 * piece inside reads those variables.
 */
import {
  alignItems,
  ariaCurrent,
  ariaPressed,
  animate,
  bg,
  blockSize,
  borderColor,
  borderInlineStartColor,
  borderInlineStartStyle,
  borderInlineStartWidth,
  borderStyle,
  borderTopColor,
  borderWidth,
  color,
  craftGlobalStyles,
  craftStyles,
  cssVars,
  cursor,
  defineFont,
  definePalette,
  defineStateAxis,
  display,
  easing,
  flex,
  flexDirection,
  flexShrink,
  flexWrap,
  font,
  fontFamily,
  fontSize,
  fontWeight,
  gap,
  googleFont,
  gridTemplateColumns,
  inlineSize,
  interaction,
  keyframes,
  kind,
  letterSpacing,
  lineHeight,
  lineWidth,
  marginBlock,
  marginBlockEnd,
  marginBlockStart,
  marginInline,
  maxInlineSize,
  minBlockSize,
  minHeight,
  minWidth,
  monospaceStack,
  num,
  opacity,
  p,
  paddingBlockEnd,
  paddingBlockStart,
  placeItems,
  px,
  py,
  radii,
  radius,
  rotate,
  set,
  space,
  text,
  textDecorationLine,
  textTransform,
  tracks,
  unit,
  when,
} from '@craft-ts/style';

const chivo = defineFont('effectDemoBody', {
  family: 'Chivo',
  source: googleFont({ weights: [400, 600, 700] }),
  display: 'swap',
  fallback: 'sans-serif',
});

const base = definePalette('effectDemo', {
  surface: {
    page: { light: '#f8fafc', dark: '#f8fafc' },
    raised: { light: '#ffffff', dark: '#ffffff' },
    navHover: { light: '#f1f5f9', dark: '#f1f5f9' },
  },
  text: {
    strong: { light: '#0f172a', dark: '#0f172a' },
    body: { light: '#1e293b', dark: '#1e293b' },
    muted: { light: '#64748b', dark: '#64748b' },
    hint: { light: '#475569', dark: '#475569' },
    done: { light: '#94a3b8', dark: '#94a3b8' },
    onControl: { light: '#ffffff', dark: '#ffffff' },
  },
  border: {
    nav: { light: '#cbd5e1', dark: '#cbd5e1' },
  },
});

/** The palette of one tint. Every tint has the same shape. */
const tint = (name: string, spec: TintSpec) => definePalette(name, spec);

type TintSpec = {
  readonly surface: Readonly<
    Record<'card' | 'chip' | 'callout', { light: string; dark: string }>
  >;
  readonly text: Readonly<
    Record<
      'ink' | 'heading' | 'intro' | 'control' | 'note',
      { light: string; dark: string }
    >
  >;
  readonly border: Readonly<
    Record<
      'card' | 'panel' | 'control' | 'callout',
      { light: string; dark: string }
    >
  >;
};

const same = (value: string) => ({ light: value, dark: value });

const slate = tint('effectTintSlate', {
  surface: {
    card: same('#f8fafc'),
    chip: same('#eef2f7'),
    callout: same('#fffbeb'),
  },
  text: {
    ink: same('#1e293b'),
    heading: same('#0f172a'),
    intro: same('#475569'),
    control: same('#334155'),
    note: same('#78350f'),
  },
  border: {
    card: same('#e2e8f0'),
    panel: same('#e2e8f0'),
    control: same('#cbd5e1'),
    callout: same('#f59e0b'),
  },
});

const tints = {
  blue: tint('effectTintBlue', {
    surface: {
      card: same('#eff6ff'),
      chip: same('#dbeafe'),
      callout: same('#eff6ff'),
    },
    text: {
      ink: same('#1e293b'),
      heading: same('#172554'),
      intro: same('#334155'),
      control: same('#1e3a8a'),
      note: same('#475569'),
    },
    border: {
      card: same('#dbeafe'),
      panel: same('#bfdbfe'),
      control: same('#93c5fd'),
      callout: same('#3b82f6'),
    },
  }),
  violet: tint('effectTintViolet', {
    surface: {
      card: same('#f5f3ff'),
      chip: same('#ede9fe'),
      callout: same('#f5f3ff'),
    },
    text: {
      ink: same('#312e81'),
      heading: same('#2e1065'),
      intro: same('#4338ca'),
      control: same('#5b21b6'),
      note: same('#4c1d95'),
    },
    border: {
      card: same('#ede9fe'),
      panel: same('#ddd6fe'),
      control: same('#c4b5fd'),
      callout: same('#8b5cf6'),
    },
  }),
  sky: tint('effectTintSky', {
    surface: {
      card: same('#f0f9ff'),
      chip: same('#e0f2fe'),
      callout: same('#f0f9ff'),
    },
    text: {
      ink: same('#0f172a'),
      heading: same('#0c4a6e'),
      intro: same('#334155'),
      control: same('#0c4a6e'),
      note: same('#475569'),
    },
    border: {
      card: same('#bae6fd'),
      panel: same('#bae6fd'),
      control: same('#7dd3fc'),
      callout: same('#0ea5e9'),
    },
  }),
  slate,
  teal: tint('effectTintTeal', {
    surface: {
      card: same('#f0fdfa'),
      chip: same('#ccfbf1'),
      callout: same('#f0fdfa'),
    },
    text: {
      ink: same('#134e4a'),
      heading: same('#042f2e'),
      intro: same('#115e59'),
      control: same('#0f766e'),
      note: same('#115e59'),
    },
    border: {
      card: same('#ccfbf1'),
      panel: same('#99f6e4'),
      control: same('#5eead4'),
      callout: same('#14b8a6'),
    },
  }),
  green: tint('effectTintGreen', {
    surface: {
      card: same('#f0fdf4'),
      chip: same('#dcfce7'),
      callout: same('#f0fdf4'),
    },
    text: {
      ink: same('#14532d'),
      heading: same('#14532d'),
      intro: same('#166534'),
      control: same('#166534'),
      note: same('#166534'),
    },
    border: {
      card: same('#dcfce7'),
      panel: same('#bbf7d0'),
      control: same('#86efac'),
      callout: same('#22c55e'),
    },
  }),
};

const themed = { inherits: true };

/** The card's theme. Its initial values are the neutral (slate) tint. */
const card = cssVars('effectCard', {
  surface: kind.color(slate.surface.card, themed),
  chip: kind.color(slate.surface.chip, themed),
  calloutSurface: kind.color(slate.surface.callout, themed),
  ink: kind.color(slate.text.ink, themed),
  heading: kind.color(slate.text.heading, themed),
  intro: kind.color(slate.text.intro, themed),
  control: kind.color(slate.text.control, themed),
  note: kind.color(slate.text.note, themed),
  border: kind.color(slate.border.card, themed),
  panelBorder: kind.color(slate.border.panel, themed),
  controlBorder: kind.color(slate.border.control, themed),
  calloutBorder: kind.color(slate.border.callout, themed),
});

const theme = (t: typeof slate) => [
  set(card.surface, t.surface.card),
  set(card.chip, t.surface.chip),
  set(card.calloutSurface, t.surface.callout),
  set(card.ink, t.text.ink),
  set(card.heading, t.text.heading),
  set(card.intro, t.text.intro),
  set(card.control, t.text.control),
  set(card.note, t.text.note),
  set(card.border, t.border.card),
  set(card.panelBorder, t.border.panel),
  set(card.controlBorder, t.border.control),
  set(card.calloutBorder, t.border.callout),
];

craftGlobalStyles('effectDemo', {
  elements: {
    html: [minHeight(unit.pct(100))],
    body: [
      minHeight(unit.pct(100)),
      fontFamily(chivo),
      bg(base.surface.page),
      color(base.text.body),
    ],
  },
});

const hairline = (tint: Parameters<typeof borderColor>[0]) => [
  borderWidth(lineWidth.hairline),
  borderStyle.solid,
  borderColor(tint),
];

export const shell = craftStyles('effectShell', {
  root: [display.block, minBlockSize(unit.vh(100))],
  header: [px(space(8)), paddingBlockStart(space(6))],
  title: [font(text.xl), fontWeight(num(700)), color(base.text.strong)],
  tagline: [marginBlockStart(space(1)), font(text.sm), color(base.text.muted)],
  nav: [display.flex, flexWrap.wrap, gap(space(2)), py(space(4)), px(space(8))],
  navLink: [
    py(space(2)),
    px(space(3)),
    ...hairline(base.border.nav),
    radius(radii.full),
    font(text.sm),
    textDecorationLine.none,
    color(base.text.hint),
    bg(base.surface.raised),
    when(interaction.hover, [
      color(base.text.strong),
      bg(base.surface.navHover),
    ]),
    when(ariaCurrent.page, [
      color(base.text.strong),
      bg(base.surface.navHover),
    ]),
  ],
  content: [px(space(4)), paddingBlockEnd(space(8))],
});

/** The hue of an example card. Drives `data-exampleTint` on its root. */
export const exampleTint = defineStateAxis('exampleTint', [
  'blue',
  'violet',
  'sky',
  'teal',
  'green',
]);

/** A note set apart as a callout (an accent rule on its start edge). */
export const noteKind = defineStateAxis('exampleNote', ['callout']);

/** A square stepper button, or an icon-only one with no chrome. */
export const buttonKind = defineStateAxis('exampleButton', ['square', 'ghost']);

/** A todo that is done. Drives `data-exampleTodo` on its title. */
export const todoState = defineStateAxis('exampleTodo', ['done']);

const spin = keyframes('effectDemoSpin', { to: [rotate(unit.deg(360))] });

export const example = craftStyles('effectExample', {
  card: [
    display.block,
    maxInlineSize(unit.rem(55)),
    marginInline.auto,
    marginBlock(space(8)),
    p(space(6)),
    ...hairline(card.border),
    radius(radii.xl),
    color(card.ink),
    bg(card.surface),
    when(exampleTint.blue, theme(tints.blue)),
    when(exampleTint.violet, theme(tints.violet)),
    when(exampleTint.sky, theme(tints.sky)),
    when(exampleTint.teal, theme(tints.teal)),
    when(exampleTint.green, theme(tints.green)),
  ],
  title: [
    marginBlockEnd(space(2)),
    font(text.xl),
    fontWeight(num(700)),
    color(card.heading),
  ],
  intro: [marginBlockEnd(space(5)), lineHeight(num(1.55)), color(card.intro)],
  actions: [
    display.flex,
    flexWrap.wrap,
    alignItems.center,
    gap(space(2)),
    marginBlockEnd(space(5)),
  ],
  button: [
    py(space(2)),
    px(space(4)),
    ...hairline(card.controlBorder),
    radius(radii.md),
    cursor.pointer,
    color(card.control),
    bg(base.surface.raised),
    when(interaction.hover, [bg(card.chip)]),
    when(ariaPressed.pressed, [
      color(base.text.onControl),
      borderColor(card.control),
      bg(card.control),
    ]),
    when(buttonKind.square, [
      display.grid,
      placeItems.center,
      inlineSize(unit.rem(2.25)),
      blockSize(unit.rem(2.25)),
      font(text.lg),
    ]),
    when(buttonKind.ghost, [borderStyle.none, bg(base.surface.raised)]),
    when(interaction.disabled, [cursor.wait, opacity(num(0.6))]),
  ],
  panel: [
    p(space(4)),
    ...hairline(card.panelBorder),
    radius(radii.lg),
    bg(base.surface.raised),
  ],
  panels: [
    display.grid,
    gap(space(4)),
    gridTemplateColumns(tracks.autoFit(unit.px(240))),
  ],
  panelTitle: [
    marginBlockEnd(space(3)),
    font(text.xs),
    fontWeight(num(600)),
    letterSpacing(unit.em(0.08)),
    textTransform.uppercase,
    color(base.text.muted),
  ],
  row: [marginBlock(space(2)), lineHeight(num(1.5))],
  result: [font(text.lg), fontWeight(num(600)), color(card.heading)],
  hint: [marginBlockStart(space(2)), font(text.xs), color(base.text.hint)],
  qty: [minWidth(unit.rem(6)), font(text.sm), color(card.control)],
  note: [
    marginBlockStart(space(5)),
    font(text.sm),
    lineHeight(num(1.6)),
    color(card.note),
    when(noteKind.callout, [
      py(space(4)),
      px(space(4)),
      borderInlineStartWidth(unit.px(3)),
      borderInlineStartStyle.solid,
      borderInlineStartColor(card.calloutBorder),
      radius(radii.lg),
      bg(card.calloutSurface),
    ]),
  ],
  mono: [
    px(space(1)),
    radius(radii.sm),
    fontSize(unit.rem(0.8)),
    fontFamily(monospaceStack),
    bg(card.chip),
  ],
  receipt: [
    display.grid,
    gap(space(2)),
    p(space(4)),
    ...hairline(card.panelBorder),
    radius(radii.lg),
    bg(base.surface.raised),
  ],
  receiptTitle: [font(text.lg), fontWeight(num(700)), color(card.heading)],
  receiptText: [color(card.intro)],
  loading: [
    display.flex,
    alignItems.center,
    gap(space(2)),
    minBlockSize(space(8)),
    color(card.control),
  ],
  spinner: [
    flexShrink(num(0)),
    inlineSize(unit.rem(0.8)),
    blockSize(unit.rem(0.8)),
    borderWidth(lineWidth.thick),
    borderStyle.solid,
    borderColor(card.panelBorder),
    borderTopColor(card.control),
    radius(radii.full),
    animate(spin, {
      duration: unit.ms(700),
      easing: easing.linear,
      iterations: 'infinite',
    }),
  ],
  addForm: [display.flex, gap(space(2)), marginBlockEnd(space(5))],
  input: [
    flex(num(1)),
    minWidth(space(0)),
    py(space(2)),
    px(space(3)),
    ...hairline(card.controlBorder),
    radius(radii.md),
    bg(base.surface.raised),
  ],
  status: [marginBlockEnd(space(3)), font(text.sm), color(base.text.muted)],
  list: [display.flex, flexDirection.column, gap(space(2))],
  todo: [
    display.flex,
    alignItems.center,
    gap(space(3)),
    py(space(3)),
    px(space(3)),
    ...hairline(card.panelBorder),
    radius(radii.lg),
    bg(base.surface.raised),
  ],
  todoTitle: [
    flex(num(1)),
    when(todoState.done, [
      color(base.text.done),
      textDecorationLine.lineThrough,
    ]),
  ],
});
