/**
 * The vocabulary that replaces an app's hand-written `styles.css`: the global
 * foundation (reset, base, `craftGlobalStyles`), fonts, pseudo-elements,
 * keyframes and transitions.
 *
 * Falsifiability checks (run by hand when this file was written):
 * - drop the `!important` in `globalRuleText` and "neutralises every
 *   animation under reduced motion, important" goes red;
 * - append the pseudo-element before the conditions in `wrapRule` and "puts
 *   the pseudo-element after every condition" goes red;
 * - remove `& RequiresContent<Items>` from `pseudo.before` and the
 *   `@ts-expect-error` below becomes an unused directive (typecheck red).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { defineStateAxis, interaction, scheme } from '../lib/axes/index.ts';
import {
  craftStyles,
  registeredAtoms,
  registeredClasses,
  resetStyleRegistry,
  when,
} from '../lib/styles.ts';
import { resetCssVarRegistry, set } from '../lib/css-vars.ts';
import {
  bg,
  color,
  display,
  fontFamily,
  opacity,
  p,
  prop,
  rotate,
  maxInlineSize,
  gridTemplateColumns,
} from '../lib/props/index.ts';
import { palette } from '../lib/tokens/palette.ts';
import { space } from '../lib/tokens/scales.ts';
import { cssString, ident, num, unit } from '../lib/tokens/units.ts';
import { pseudo } from '../lib/pseudo.ts';
import {
  animate,
  easing,
  keyframes,
  registeredKeyframes,
  resetKeyframesRegistry,
  transitions,
} from '../lib/animation.ts';
import {
  defineFont,
  fallbackOverrides,
  googleFont,
  localFont,
  monospaceStack,
  systemFontStack,
  registeredFonts,
  resetFontRegistry,
} from '../lib/font.ts';
import {
  craftBase,
  craftGlobalStyles,
  registeredGlobalRules,
  resetGlobalRegistry,
} from '../lib/global/index.ts';
import {
  UnknownCssError,
  fontHeadTags,
  renderCss,
  renderHeadTags,
  styleDump,
  validateFoundation,
  validateAtoms,
} from './emit.ts';
import { declaration } from '../lib/props/factory.ts';
import {
  backdropBlur,
  bgImage,
  bgPosition,
  bgSize,
  gradient,
  math,
  shadow,
  tracks,
} from '../lib/values.ts';

const tone = defineStateAxis('tone', ['danger']);

beforeEach(() => {
  resetStyleRegistry();
  resetCssVarRegistry();
  resetKeyframesRegistry();
  resetFontRegistry();
  resetGlobalRegistry();
});

const cssWith = (options: { reset?: boolean; base?: boolean } = {}) =>
  renderCss(registeredAtoms(), [], {
    ...options,
    globals: registeredGlobalRules(),
    keyframes: registeredKeyframes(),
    fonts: registeredFonts(),
  });

describe('the foundation craft-ts ships', () => {
  it('emits the reset in craft.reset only when asked', () => {
    expect(cssWith()).not.toContain('@layer craft.reset{');
    const css = cssWith({ reset: true });
    expect(css).toContain(
      '@layer craft.reset{*,*::before,*::after{box-sizing:border-box}',
    );
    expect(css).toContain('input,button,textarea,select{font:inherit}');
    expect(css).toContain('h1,h2,h3,h4,h5,h6{text-wrap:balance}');
    expect(css).toContain('html{-webkit-text-size-adjust:none}');
    // A class that sets display must not un-hide a `hidden` element.
    expect(css).toContain(
      "[hidden]:not([hidden='until-found']){display:none !important}",
    );
  });

  it('neutralises every animation under reduced motion, important', () => {
    const css = cssWith({ base: true });
    expect(css).toContain(
      '@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms !important}}',
    );
    expect(css).toContain(
      '@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}}',
    );
  });

  it('draws the focus ring and the selection from theme variables', () => {
    const css = cssWith({ base: true });
    expect(css).toContain(
      ':focus-visible{outline-color:var(--craft-focusRing)}',
    );
    expect(css).toContain(
      '::selection{background-color:var(--craft-selectionBg)}',
    );
    // Registered, so a colour cannot be assigned a length.
    expect(css).toContain('@property --craft-focusRing { syntax: "<color>"');
    expect(css).toContain(
      '@media (prefers-color-scheme: dark){:root{color-scheme:dark}}',
    );
  });

  it('keeps the base layer before the app, and the app before components', () => {
    craftGlobalStyles('app', { elements: { body: [p(space(0))] } });
    craftStyles('card', { root: [p(space(4))] });
    const css = cssWith({ reset: true, base: true });
    const at = (layer: string) => css.indexOf(`@layer ${layer}{`);
    expect(at('craft.reset')).toBeLessThan(at('craft.base'));
    expect(at('craft.base')).toBeLessThan(at('craft.global'));
    expect(at('craft.global')).toBeLessThan(at('craft.components'));
  });
});

describe('craftGlobalStyles', () => {
  it('writes the theme on :root and element defaults, in craft.global', () => {
    const body = defineFont('body', {
      family: 'Chivo',
      source: googleFont({ weights: [400, 700] }),
      fallback: 'system-ui',
    });
    craftGlobalStyles('app', {
      root: [
        set(craftBase.focusRing, palette.accent.danger),
        when(tone.danger, [set(craftBase.accent, palette.accent.danger)]),
      ],
      elements: { body: [fontFamily(body)], a: [color(palette.accent.info)] },
    });
    const css = cssWith();
    expect(css).toContain(
      '@layer craft.global{:root{--craft-focusRing:#a11b1b}:root[data-tone=\'danger\']{--craft-accent:#a11b1b}body{font-family:"Chivo", system-ui}a{color:#1b5fa1}}',
    );
  });

  it('refuses a selector that is not a tag name', () => {
    expect(() =>
      craftGlobalStyles('app', {
        elements: { '.card': [p(space(1))] } as never,
      }),
    ).toThrow(/not a tag name/);
  });

  it('refuses two declarations under one prefix', () => {
    craftGlobalStyles('app', {});
    expect(() => craftGlobalStyles('app', {})).toThrow(/already declared/);
  });

  it('is covered by the last net, like a sheet', () => {
    craftGlobalStyles('app', {
      elements: { body: [declaration('zoom-level', '2')] },
    });
    expect(() =>
      validateFoundation({ globals: registeredGlobalRules() }),
    ).toThrow(UnknownCssError);
  });
});

describe('pseudo-elements', () => {
  it('puts the pseudo-element after every condition', () => {
    craftStyles('chip', {
      root: [
        pseudo.before([
          pseudo.content.empty,
          display.block,
          when(tone.danger, [bg(palette.accent.danger)]),
        ]),
        when(interaction.hover, [
          pseudo.after([pseudo.content.text(cssString('→'))]),
        ]),
      ],
    });
    const css = cssWith();
    expect(css).toMatch(/\.[\w-]+::before\{content:""\}/);
    expect(css).toMatch(
      /\.[\w-]+\[data-tone='danger'\]::before\{background-color:#a11b1b\}/,
    );
    expect(css).toMatch(/\.[\w-]+:hover::after\{content:"→"\}/);
  });

  it('keeps ::before and the element apart in the cascade of one class', () => {
    const chip = craftStyles('chip', {
      root: [
        display.flex,
        pseudo.before([pseudo.content.empty, display.block]),
      ],
    });
    // Both `display` declarations survive: they do not compete.
    expect(chip.root.split(' ')).toHaveLength(3);
    expect(
      styleDump(registeredClasses(), registeredAtoms(), []).atoms.filter(
        (atom) => atom.pseudoElement === 'before',
      ),
    ).toHaveLength(2);
  });

  it('reads the axes crossed inside a pseudo-element into the contract', () => {
    craftStyles('chip', {
      root: [
        pseudo.before([
          pseudo.content.none,
          when(scheme.dark, [opacity(num(0.5))]),
        ]),
      ],
    });
    expect(registeredClasses()[0]?.axes).toEqual({ scheme: ['dark'] });
  });

  it('builds counters and refuses nesting', () => {
    craftStyles('list', {
      item: [pseudo.marker([color(palette.text.muted)])],
      step: [pseudo.before([pseudo.content.counter(ident('step'))])],
    });
    expect(cssWith()).toContain('{content:counter(step)}');
    expect(() =>
      craftStyles('bad', {
        root: [
          pseudo.placeholder([
            pseudo.selection([color(palette.text.muted)]),
          ] as never),
        ],
      }),
    ).toThrow(/nested inside/);
  });

  it('refuses a generated pseudo-element without content, at compile time', () => {
    // @ts-expect-error — ::before without content is never generated.
    pseudo.before([display.block]);
    // A content under a condition does not count: the base scenario has none.
    // @ts-expect-error — same reason.
    pseudo.after([when(tone.danger, [pseudo.content.empty])]);
  });
});

describe('keyframes, animate and transitions', () => {
  it('emits @keyframes in craft.components and plays it by token', () => {
    const spin = keyframes('spin', {
      from: [rotate(unit.deg(0))],
      to: [rotate(unit.deg(360))],
    });
    craftStyles('spinner', {
      root: [
        ...animate(spin, {
          duration: unit.ms(800),
          easing: easing.linear,
          iterations: 'infinite',
        }),
      ],
    });
    const css = cssWith();
    expect(css).toContain(
      '@layer craft.components{@keyframes spin{from{rotate:0deg}to{rotate:360deg}}',
    );
    expect(css).toContain('{animation-name:spin}');
    expect(css).toContain('{animation-iteration-count:infinite}');
  });

  it('refuses a step that is not a keyframe selector, and a second name', () => {
    expect(() =>
      keyframes('fade', { '150%': [opacity(num(0))] } as never),
    ).toThrow(/percentage/);
    keyframes('fade', { to: [opacity(num(0))] });
    expect(() => keyframes('fade', { to: [opacity(num(1))] })).toThrow(
      /already declared/,
    );
  });

  it('names the transitioned properties from the table', () => {
    craftStyles('button', {
      root: [
        ...transitions([prop.backgroundColor, prop.color], {
          duration: unit.ms(150),
          easing: easing.cubicBezier(0.2, 0, 0, 1),
        }),
      ],
    });
    const css = cssWith();
    expect(css).toContain('{transition-property:background-color, color}');
    expect(css).toContain(
      '{transition-timing-function:cubic-bezier(0.2, 0, 0, 1)}',
    );
    expect(() => easing.cubicBezier(1.2, 0, 0, 1)).toThrow(/outside/);
  });
});

describe('isolated sheets', () => {
  it('emits them after every layer, and never shares their atoms', () => {
    const app = craftStyles('card', { root: [display.flex] });
    const overlay = craftStyles(
      'overlay',
      { root: [display.flex, when(tone.danger, [display.grid])] },
      { isolated: true },
    );
    // Same declaration, two atoms: the application's stays in its layer.
    expect(overlay.root).not.toContain(app.root);
    expect(overlay.root.startsWith('i-')).toBe(true);

    const css = cssWith();
    const layered = css.lastIndexOf('@layer craft.');
    const isolatedBase = css.indexOf(`.${overlay.root.split(' ')[0]}{`);
    expect(isolatedBase).toBeGreaterThan(layered);
    // Outside any layer: after the last layer block closes.
    expect(css.slice(isolatedBase)).not.toContain('@layer');
    // The variant comes after the base it overrides.
    expect(css.indexOf("[data-tone='danger']{display:grid}")).toBeGreaterThan(
      isolatedBase,
    );
  });
});

describe('value constructors', () => {
  it('builds shadows, math functions and grid tracks from typed values', () => {
    expect(
      shadow({ y: unit.px(20), blur: unit.px(50), color: palette.text.strong }),
    ).toMatchObject({ property: 'box-shadow', value: '0 20px 50px #111318' });
    expect(math.min(unit.px(560), unit.pct(100)).css).toBe('min(560px, 100%)');
    expect(math.clamp(unit.rem(1), unit.vw(4), unit.rem(3)).css).toBe(
      'clamp(1rem, 4vw, 3rem)',
    );
    expect(tracks.autoFit(unit.px(170)).css).toBe(
      'repeat(auto-fit, minmax(170px, 1fr))',
    );
    expect(tracks.list(unit.rem(2), tracks.fr(1), 'auto').css).toBe(
      '2rem 1fr auto',
    );
    expect(
      tracks.list(tracks.minmax(unit.px(0), tracks.fr(0.9)), 'auto').css,
    ).toBe('minmax(0px, 0.9fr) auto');
    expect(
      gradient.linear(unit.deg(135), [
        palette.text.strong,
        palette.surface.page,
      ]).css,
    ).toMatch(/^linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
    expect(
      bgImage(gradient.radial([palette.text.strong, palette.surface.page])),
    ).toMatchObject({ property: 'background-image' });
    expect(
      gradient.repeatingConic([
        [palette.text.strong, unit.pct(0), unit.pct(25)],
        [palette.surface.page, unit.pct(0), unit.pct(50)],
      ]).css,
    ).toMatch(
      /^repeating-conic-gradient\(#[0-9a-f]{6} 0% 25%, #[0-9a-f]{6} 0% 50%\)$/,
    );
    expect(bgSize(unit.px(20), unit.px(20))).toMatchObject({
      value: '20px 20px',
    });
    expect(bgPosition(unit.px(1), unit.px(0))).toMatchObject({
      value: '1px 0px',
    });
    expect(backdropBlur(unit.px(4))).toMatchObject({
      property: 'backdrop-filter',
      value: 'blur(4px)',
    });
    craftStyles('canvas', {
      root: [
        bgImage(
          gradient.repeatingConic([
            [palette.text.strong, unit.pct(0), unit.pct(25)],
            [palette.surface.page, unit.pct(0), unit.pct(50)],
          ]),
        ),
        bgSize(unit.px(20), unit.px(20)),
        bgPosition(unit.px(1), unit.px(0)),
        backdropBlur(unit.px(4)),
      ],
    });
    expect(() => validateAtoms(registeredAtoms())).not.toThrow();
    const _gradientIsNotAColor = () => {
      // @ts-expect-error a gradient is an image, not a colour
      color(gradient.radial([palette.text.strong, palette.surface.page]));
    };
    expect(_gradientIsNotAColor).toBeTypeOf('function');
    const _rejected = () => {
      // @ts-expect-error a flex value is a track size, not a length
      maxInlineSize(tracks.fr(1));
    };
    expect(_rejected).toBeTypeOf('function');
    craftStyles('panel', {
      root: [
        shadow({
          y: unit.px(8),
          blur: unit.px(24),
          color: palette.text.strong,
        }),
        maxInlineSize(math.min(unit.px(560), unit.pct(100))),
        gridTemplateColumns(tracks.autoFit(unit.px(170))),
      ],
    });
    // The emitter's last net accepts them: every property is in the vocabulary.
    expect(() => validateAtoms(registeredAtoms())).not.toThrow();
  });
});

describe('fonts', () => {
  it('links Google Fonts from <head>, preconnected, instead of @import', () => {
    defineFont('body', {
      family: 'Chivo',
      source: googleFont({ weights: [700, 400] }),
      fallback: 'system-ui',
    });
    const html = renderHeadTags(fontHeadTags(registeredFonts()));
    expect(html).toBe(
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
        '<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;700&amp;display=swap">' +
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chivo:wght@400;700&amp;display=swap">',
    );
    expect(cssWith()).not.toContain('@import');
  });

  it('emits @font-face for local files and preloads the woff2', () => {
    const mono = defineFont('mono', {
      family: 'Iosevka',
      source: localFont({
        files: [{ url: '/fonts/iosevka.woff2', weight: [100, 900] }],
      }),
      display: 'optional',
      fallback: 'ui-monospace',
    });
    expect(mono.css).toBe('"Iosevka", ui-monospace');
    expect(cssWith()).toContain(
      '@font-face{font-family:"Iosevka";src:url("/fonts/iosevka.woff2") format("woff2");font-display:optional;font-weight:100 900}',
    );
    expect(fontHeadTags(registeredFonts())[0]?.attrs).toMatchObject({
      rel: 'preload',
      as: 'font',
      href: '/fonts/iosevka.woff2',
    });
  });

  it('computes a metric-adjusted fallback face', () => {
    // Arial against itself: nothing to adjust.
    expect(
      fallbackOverrides('Same', {
        metrics: {
          unitsPerEm: 2048,
          ascent: 1854,
          descent: -434,
          lineGap: 67,
          xWidthAvg: 904,
        },
      }),
    ).toMatchObject({ sizeAdjust: '100%', ascentOverride: '90.53%' });

    const body = defineFont('body', {
      family: 'Wide',
      source: googleFont({ weights: [400] }),
      fallback: 'sans-serif',
      adjustFallback: {
        metrics: {
          unitsPerEm: 1000,
          ascent: 950,
          descent: -250,
          lineGap: 0,
          xWidthAvg: 552,
        },
      },
    });
    expect(body.css).toBe('"Wide", "Wide Fallback", sans-serif');
    expect(cssWith()).toContain(
      '@font-face{font-family:"Wide Fallback";src:local("Arial");size-adjust:125.05%',
    );
  });

  it('builds a system font stack that always ends on a generic family', () => {
    expect(monospaceStack.css).toBe(
      'ui-monospace, "SFMono-Regular", "Menlo", "Consolas", monospace',
    );
    expect(() => systemFontStack(['Evil"}'], 'serif')).toThrow(/quote safely/);
  });

  it('refuses a family name it cannot quote safely', () => {
    expect(() =>
      defineFont('body', {
        family: 'Evil"}body{',
        source: googleFont({ weights: [400] }),
        fallback: 'serif',
      }),
    ).toThrow(/quote safely/);
  });
});
