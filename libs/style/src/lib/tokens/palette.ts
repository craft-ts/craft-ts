/**
 * The palette.
 *
 * A token carries **both** of its values, its role, and — since the contrast
 * analysis — where it came from. `palette.surface.raised` is a value, not a
 * string, and dark mode is not a second file to keep in sync by hand: the
 * emitter reads the `dark` side off the same token.
 *
 * The role is what later makes `defineAxis(..., { writes: onlyVarsOfKind(color) })`
 * meaningful, and what lets the graph answer "which surfaces does this token
 * paint?" without parsing CSS. The provenance is what lets a contrast failure
 * say `ui.text.onAccent on ui.accent.warning` instead of `#0b0d11 on #735000`
 * — the first names a decision, the second names two strings.
 */
import type { ColorProvenance, ColorRole, ColorValue } from './units.ts';

export interface PaletteEntry {
  readonly light: string;
  readonly dark: string;
}

/**
 * The name an unnamed palette reports.
 *
 * Deliberately not a plausible identifier: a report saying
 * `(unnamed).accent.warning` is a prompt to name the palette, whereas
 * `palette.accent.warning` would read as a real path and send someone looking
 * for a `palette` export that may not be the one in play.
 */
export const ANONYMOUS_PALETTE = '(unnamed)';

const swatch = (
  light: string,
  dark: string,
  role: ColorRole,
  provenance: ColorProvenance,
): ColorValue =>
  ({ css: light, dark, role, unproven: '', provenance }) as ColorValue;

export type PaletteSpec = Readonly<
  Record<string, Readonly<Record<string, PaletteEntry>>>
>;

export type Palette<Spec extends PaletteSpec> = {
  readonly [Group in keyof Spec]: {
    readonly [Token in keyof Spec[Group]]: ColorValue;
  };
};

/**
 * Roles are derived from the group name rather than repeated on every entry:
 * a token in `surface` paints a surface. A group the map does not know gets
 * `'none'`, which is honest — it says the role is unknown instead of guessing.
 */
const ROLE_OF_GROUP: Readonly<Record<string, ColorRole>> = {
  surface: 'surface',
  text: 'text',
  border: 'border',
  accent: 'accent',
};

function build<Spec extends PaletteSpec>(
  name: string,
  spec: Spec,
): Palette<Spec> {
  return Object.fromEntries(
    Object.entries(spec).map(([group, tokens]) => [
      group,
      Object.fromEntries(
        Object.entries(tokens).map(([token, pair]) => {
          const role = ROLE_OF_GROUP[group] ?? 'none';
          return [
            token,
            swatch(pair.light, pair.dark, role, {
              palette: name,
              group,
              token,
              role,
              light: pair.light,
              dark: pair.dark,
              side: 'light',
            }),
          ];
        }),
      ),
    ]),
  ) as Palette<Spec>;
}

/**
 * `definePalette('ui', spec)` — named, and `definePalette(spec)` — not.
 *
 * The overload is additive rather than a breaking change of the signature:
 * every existing call keeps compiling and keeps working. What it loses is
 * precision in the report, and only there — an unnamed palette still carries
 * its group, its token and both of its sides, so a diagnostic can still say
 * `(unnamed).accent.warning` and point at the right entry. The name is what
 * turns that into a path someone can search for.
 */
export function definePalette<const Spec extends PaletteSpec>(
  name: string,
  spec: Spec,
): Palette<Spec>;
export function definePalette<const Spec extends PaletteSpec>(
  spec: Spec,
): Palette<Spec>;
export function definePalette<const Spec extends PaletteSpec>(
  nameOrSpec: string | Spec,
  maybeSpec?: Spec,
): Palette<Spec> {
  return typeof nameOrSpec === 'string'
    ? build(nameOrSpec, maybeSpec as Spec)
    : build(ANONYMOUS_PALETTE, nameOrSpec);
}

/**
 * The dark side of a token, as a value.
 *
 * A token carries both of its values; this is how a sheet reaches the other
 * one. Written once, at the theme level — `when(scheme.dark, [set(theme.ink,
 * darkOf(palette.text.strong))])` — rather than at every use site, which is
 * what keeps dark mode from becoming a second design system to maintain.
 *
 * The role travels with it: the dark side of a surface is still a surface. So
 * does the provenance, with its `side` flipped — a dark-mode contrast failure
 * must still name the token, and must not name the light value as the culprit.
 */
export const darkOf = (token: ColorValue): ColorValue =>
  ({
    css: token.dark,
    dark: token.dark,
    role: token.role,
    unproven: token.unproven,
    ...(token.provenance
      ? { provenance: { ...token.provenance, side: 'dark' as const } }
      : {}),
  }) as ColorValue;

export const palette = definePalette('palette', {
  surface: {
    page: { light: '#ffffff', dark: '#0b0d11' },
    raised: { light: '#f6f7f9', dark: '#151922' },
    sunken: { light: '#eceef2', dark: '#0f131a' },
  },
  text: {
    strong: { light: '#111318', dark: '#f2f4f8' },
    muted: { light: '#5b6472', dark: '#98a2b3' },
    inverted: { light: '#ffffff', dark: '#0b0d11' },
  },
  border: {
    subtle: { light: '#e3e6ea', dark: '#232936' },
    strong: { light: '#c3c9d2', dark: '#39414f' },
  },
  accent: {
    info: { light: '#1b5fa1', dark: '#6fb2f0' },
    success: { light: '#0f7b4f', dark: '#3ddc97' },
    warning: { light: '#8a5a00', dark: '#f5b544' },
    danger: { light: '#a11b1b', dark: '#ff6b6b' },
    neutral: { light: '#4a5568', dark: '#a6b0c0' },
  },
});
