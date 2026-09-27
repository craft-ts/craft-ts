import { describe, expect, it } from 'vitest';
import {
  registeredAtoms,
  registeredFonts,
  registeredGlobalRules,
} from '@craft-ts/style';
import { fontHeadTags, renderCss, renderHeadTags } from '@craft-ts/style/vite';

// #region font
import { defineFont, googleFont } from '@craft-ts/style';

export const bodyFont = defineFont('body', {
  family: 'Chivo',
  source: googleFont({ weights: [400, 600, 700] }),
  display: 'swap',
  fallback: 'system-ui',
});
// #endregion font

// #region globals
import {
  color,
  craftBase,
  craftGlobalStyles,
  darkOf,
  definePalette,
  fontFamily,
  scheme,
  set,
  when,
} from '@craft-ts/style';

export const brand = definePalette('brand', {
  accent: { primary: { light: '#1b5fa1', dark: '#6fb2f0' } },
  text: { strong: { light: '#111318', dark: '#f2f4f8' } },
});

craftGlobalStyles('app', {
  // The foundation's focus ring and form accent, in the app's colours.
  root: [
    set(craftBase.focusRing, brand.accent.primary),
    set(craftBase.accent, brand.accent.primary),
    when(scheme.dark, [
      set(craftBase.focusRing, darkOf(brand.accent.primary)),
      set(craftBase.accent, darkOf(brand.accent.primary)),
    ]),
  ],
  elements: {
    body: [fontFamily(bodyFont), color(brand.text.strong)],
  },
});
// #endregion globals

describe('guide/style/foundation.md', () => {
  it('gives the font token the family stack', () => {
    expect(bodyFont.css).toBe('"Chivo", system-ui');
  });

  it('links the font from <head> instead of an @import', () => {
    expect(renderHeadTags(fontHeadTags(registeredFonts()))).toContain(
      'family=Chivo:wght@400;600;700&amp;display=swap',
    );
  });

  it('writes the app layer after the foundation', () => {
    const css = renderCss(registeredAtoms(), [], {
      reset: true,
      base: true,
      globals: registeredGlobalRules(),
      fonts: registeredFonts(),
    });
    expect(css).toContain('body{font-family:"Chivo", system-ui}');
    expect(css.indexOf('@layer craft.base{')).toBeLessThan(
      css.indexOf('@layer craft.global{'),
    );
  });
});
