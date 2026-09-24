/**
 * The view-transitions demo: a gallery of tiles and the hero each one morphs
 * into.
 *
 * Two values are per photo, so both are variables written at runtime with
 * `assign(...)`: the artwork (`vtPhoto.art`, a gradient) and the
 * `view-transition-name` that pairs a tile with its hero (`vtPhoto.name`).
 * The gradients are typed — `photoArt(id)` — rather than CSS strings carried
 * in the photo data.
 */
import {
  aspectRatio,
  alignItems,
  bg,
  bgImage,
  blockSize,
  color,
  craftStyles,
  cssVars,
  definePalette,
  display,
  font,
  fontSize,
  fontWeight,
  gap,
  gradient,
  gridTemplateColumns,
  ident,
  inlineSize,
  kind,
  listStyleType,
  marginBlockEnd,
  num,
  objectFit,
  p,
  placeItems,
  radius,
  shadow,
  space,
  text,
  textDecorationLine,
  tracks,
  unit,
  viewTransitionName,
  when,
  at,
  defineBreakpoints,
  clipOverflow,
  type ImageValue,
} from '@craft-ts/style';

const art = definePalette('vtPhotos', {
  surface: {
    auroraA: { light: '#0f2027', dark: '#0f2027' },
    auroraB: { light: '#2c5364', dark: '#2c5364' },
    auroraC: { light: '#00c9a7', dark: '#00c9a7' },
    emberA: { light: '#ff512f', dark: '#ff512f' },
    emberB: { light: '#dd2476', dark: '#dd2476' },
    emberC: { light: '#ff8a00', dark: '#ff8a00' },
    tideA: { light: '#2193b0', dark: '#2193b0' },
    tideB: { light: '#6dd5ed', dark: '#6dd5ed' },
    tideC: { light: '#1a2980', dark: '#1a2980' },
    bloomA: { light: '#f857a6', dark: '#f857a6' },
    bloomB: { light: '#ff5858', dark: '#ff5858' },
    bloomC: { light: '#b5ec8e', dark: '#b5ec8e' },
    duneA: { light: '#f7971e', dark: '#f7971e' },
    duneB: { light: '#ffd200', dark: '#ffd200' },
    duneC: { light: '#f4a261', dark: '#f4a261' },
    nebulaA: { light: '#654ea3', dark: '#654ea3' },
    nebulaB: { light: '#eaafc8', dark: '#eaafc8' },
    nebulaC: { light: '#7f7fd5', dark: '#7f7fd5' },
    placeholder: { light: '#e2e8f0', dark: '#e2e8f0' },
  },
  text: {
    muted: { light: '#64748b', dark: '#64748b' },
    link: { light: '#2563eb', dark: '#2563eb' },
  },
  effect: {
    tile: { light: '#0f172a2e', dark: '#0f172a2e' },
    hero: { light: '#0f172a40', dark: '#0f172a40' },
  },
});

const s = art.surface;
const diagonal = unit.deg(135);

const ART: Readonly<Record<string, ImageValue>> = {
  aurora: gradient.linear(diagonal, [s.auroraA, s.auroraB, s.auroraC]),
  ember: gradient.linear(diagonal, [s.emberA, s.emberB, s.emberC]),
  tide: gradient.linear(diagonal, [s.tideA, s.tideB, s.tideC]),
  bloom: gradient.linear(diagonal, [s.bloomA, s.bloomB, s.bloomC]),
  dune: gradient.linear(diagonal, [s.duneA, s.duneB, s.duneC]),
  nebula: gradient.linear(diagonal, [s.nebulaA, s.nebulaB, s.nebulaC]),
};

const PLACEHOLDER = gradient.linear(diagonal, [s.placeholder, s.placeholder]);

/** The artwork of a photo, or a neutral placeholder for an unknown id. */
export const photoArt = (id: string): ImageValue => ART[id] ?? PLACEHOLDER;

/** The shared-element name that pairs a tile with its hero. */
export const photoTransitionName = (id: string) => ident(`photo-${id}`);

export const vtPhoto = cssVars('vtPhoto', {
  art: kind.image(PLACEHOLDER),
  name: kind.ident(ident('vt-photo')),
});

const bp = defineBreakpoints({ wide: at.minInlineSize(unit.px(720)) });

const artwork = [
  display.grid,
  placeItems.center,
  aspectRatio(num(4 / 3)),
  bg(s.placeholder),
  bgImage(vtPhoto.art),
  viewTransitionName(vtPhoto.name),
];

export const vt = craftStyles('viewTransitions', {
  intro: [display.grid, gap(space(2)), marginBlockEnd(space(6))],
  grid: [
    display.grid,
    gridTemplateColumns(tracks.autoFill(unit.px(200))),
    gap(space(5)),
    p(space(0)),
    listStyleType.none,
  ],
  tile: [
    display.grid,
    gap(space(3)),
    textDecorationLine.none,
    color(art.text.muted),
  ],
  art: [
    ...artwork,
    radius(unit.px(16)),
    shadow({ y: unit.px(12), blur: unit.px(30), color: art.effect.tile }),
  ],
  emoji: [fontSize(unit.rem(3))],
  meta: [display.grid, gap(space(1))],
  title: [fontWeight(num(700))],
  subtitle: [font(text.sm), color(art.text.muted)],
  back: [
    display.inlineBlock,
    marginBlockEnd(space(6)),
    fontWeight(num(600)),
    textDecorationLine.none,
    color(art.text.link),
  ],
  detail: [
    display.grid,
    gap(space(6)),
    when(bp.wide, [
      alignItems.center,
      gridTemplateColumns(
        tracks.list(tracks.minmax(space(0), unit.px(380)), tracks.fr(1)),
      ),
    ]),
  ],
  hero: [
    ...artwork,
    clipOverflow.block,
    clipOverflow.inline,
    radius(unit.px(24)),
    shadow({ y: unit.px(24), blur: unit.px(60), color: art.effect.hero }),
  ],
  heroImage: [
    inlineSize(unit.pct(100)),
    blockSize(unit.pct(100)),
    objectFit.cover,
  ],
  heroEmoji: [fontSize(unit.rem(6))],
  body: [display.grid, gap(space(3))],
  bar: [
    display.block,
    blockSize(space(4)),
    radius(unit.rem(0.5)),
    bg(s.placeholder),
  ],
});
