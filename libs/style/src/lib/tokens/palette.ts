/**
 * The palette.
 *
 * A token carries **both** of its values and its role. `palette.surface.raised`
 * is a value, not a string, and dark mode is not a second file to keep in sync
 * by hand — the emitter reads the `dark` side off the same token.
 *
 * The role is what later makes `defineAxis(..., { writes: onlyVarsOfKind(color) })`
 * meaningful, and what lets the graph answer "which surfaces does this token
 * paint?" without parsing CSS.
 */
import type { ColorRole, ColorValue } from './units';

export interface PaletteEntry {
  readonly light: string;
  readonly dark: string;
}

const swatch = (light: string, dark: string, role: ColorRole): ColorValue =>
  ({ css: light, dark, role, unproven: '' }) as ColorValue;

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

export function definePalette<const Spec extends PaletteSpec>(
  spec: Spec,
): Palette<Spec> {
  return Object.fromEntries(
    Object.entries(spec).map(([group, tokens]) => [
      group,
      Object.fromEntries(
        Object.entries(tokens).map(([name, pair]) => [
          name,
          swatch(pair.light, pair.dark, ROLE_OF_GROUP[group] ?? 'none'),
        ]),
      ),
    ]),
  ) as Palette<Spec>;
}

/**
 * The dark side of a token, as a value.
 *
 * A token carries both of its values; this is how a sheet reaches the other
 * one. Written once, at the theme level — `when(scheme.dark, [set(theme.ink,
 * darkOf(palette.text.strong))])` — rather than at every use site, which is
 * what keeps dark mode from becoming a second design system to maintain.
 *
 * The role travels with it: the dark side of a surface is still a surface.
 */
export const darkOf = (token: ColorValue): ColorValue =>
  ({
    css: token.dark,
    dark: token.dark,
    role: token.role,
    unproven: token.unproven,
  }) as ColorValue;

export const palette = definePalette({
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
