import { describe, expect, it } from 'vitest';
import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  contrastRatio,
} from '@craft-ts/dev-tools/contrast';
import { bp, herbier } from './herbier.style.ts';

type Side = 'light' | 'dark';
type Token = { readonly css: string; readonly dark: string };

const sideOf = (token: Token, side: Side) =>
  side === 'light' ? token.css : token.dark;

const ratio = (foreground: Token, background: Token, side: Side): number =>
  contrastRatio(sideOf(foreground, side), sideOf(background, side)) ?? 0;

const sides: readonly Side[] = ['light', 'dark'];
const tones = ['info', 'tip', 'important', 'warning', 'danger'] as const;

/** `contrast.ts` exports 4.5 and 3; the 3:1 bar of a control outline is the second. */
const AA_NON_TEXT = AA_LARGE_TEXT;

describe('Herbier palette, WCAG AA text contrast', () => {
  it.each(sides)(
    'keeps body, muted, subtle and link text readable on every page surface (%s)',
    (side) => {
      const surfaces = ['page', 'raised', 'selected'] as const;
      for (const surface of surfaces) {
        for (const ink of ['strong', 'body', 'muted', 'subtle', 'link'] as const) {
          expect(
            ratio(herbier.text[ink], herbier.surface[surface], side),
            `text.${ink} on surface.${surface} (${side})`,
          ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        }
      }
    },
  );

  it.each(sides)(
    'keeps text readable on the hover and pressed fills of the sage controls (%s)',
    (side) => {
      // Which ink sits on which fill is what the mock-up draws: a tonal button
      // is `link` on sage, hovered and pressed; a nav row is `muted` or `body`
      // on `navHover`; nothing sets muted text on the pressed fill.
      const pairs = [
        ['body', 'selectedHover'],
        ['muted', 'selectedHover'],
        ['link', 'selectedHover'],
        ['body', 'selectedActive'],
        ['link', 'selectedActive'],
        ['body', 'navHover'],
        ['muted', 'navHover'],
        ['link', 'navHover'],
      ] as const;
      for (const [ink, fill] of pairs) {
        expect(
          ratio(herbier.text[ink], herbier.surface[fill], side),
          `text.${ink} on surface.${fill} (${side})`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    },
  );

  it.each(sides)(
    'keeps the caption and the body readable on every tone (%s)',
    (side) => {
      for (const tone of tones) {
        expect(
          ratio(herbier.text[tone], herbier.surface[tone], side),
          `text.${tone} (caption) on surface.${tone} (${side})`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        expect(
          ratio(herbier.text.strong, herbier.surface[tone], side),
          `text.strong on surface.${tone} (${side})`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    },
  );

  it.each(sides)('keeps the label of every solid button readable (%s)', (side) => {
    const fills = [
      'action',
      'actionHover',
      'actionActive',
      'danger',
      'dangerHover',
      'dangerActive',
    ] as const;
    for (const fill of fills) {
      expect(
        ratio(herbier.accent.onAction, herbier.accent[fill], side),
        `accent.onAction on accent.${fill} (${side})`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it.each(sides)(
    'keeps the outline of a field and of a secondary button visible at 3:1 (%s)',
    (side) => {
      for (const surface of ['page', 'raised'] as const) {
        expect(
          ratio(herbier.border.strong, herbier.surface[surface], side),
          `border.strong on surface.${surface} (${side})`,
        ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
    },
  );

  it.each(sides)(
    'keeps the action colour usable as a focus ring and an accent on the page (%s)',
    (side) => {
      for (const surface of ['page', 'raised'] as const) {
        expect(
          ratio(herbier.accent.action, herbier.surface[surface], side),
          `accent.action on surface.${surface} (${side})`,
        ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
    },
  );

  it('keeps every syntax colour readable on the code surface and on every marked line', () => {
    const inks = [
      'codePlain',
      'codeKeyword',
      'codeFunction',
      'codeString',
      'codeNumber',
      'codeType',
      'codeComment',
      'codePunctuation',
    ] as const;
    const surfaces = [
      'code',
      'codeHighlight',
      'codeAdd',
      'codeRemove',
      'codeWarning',
    ] as const;

    for (const side of sides) {
      for (const surface of surfaces) {
        for (const ink of inks) {
          expect(
            ratio(herbier.text[ink], herbier.surface[surface], side),
            `text.${ink} on surface.${surface} (${side})`,
          ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        }
      }
    }
  });

  it('keeps the gutter glyph of each mark readable on its own line colour', () => {
    const marks = ['codeHighlight', 'codeAdd', 'codeRemove', 'codeWarning'] as const;

    for (const side of sides) {
      for (const mark of marks) {
        expect(
          ratio(herbier.text[mark], herbier.surface[mark], side),
          `glyph ${mark} on its line (${side})`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    }
  });

  it.each(sides)('keeps every colour of the logo visible on the page, at 3:1 (%s)', (side) => {
    for (const stop of ['a1', 'a2', 'b1', 'b2', 'b3', 'c1', 'c2'] as const) {
      for (const surface of ['page', 'raised'] as const) {
        expect(
          ratio(herbier.logo[stop], herbier.surface[surface], side),
          `logo.${stop} on surface.${surface} (${side})`,
        ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      }
    }
  });

  it('keeps the code surface dark in both themes', () => {
    for (const side of sides) {
      expect(
        ratio(herbier.text.codePlain, herbier.surface.code, side),
        `codePlain on code (${side})`,
      ).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('breakpoints', () => {
  it('sort alphabetically in the order of their width, because the emitter does', () => {
    // Conditional atoms are emitted by class name, and the class name carries the
    // breakpoint's name. If the names did not sort like the widths, a wide rule
    // would be overridden by a narrow one that sets the same property.
    const names = Object.keys(bp);
    const byWidth = [...names].sort(
      (left, right) =>
        Number.parseFloat(bp[left as keyof typeof bp].open.replace(/[^0-9.]/g, '')) -
        Number.parseFloat(bp[right as keyof typeof bp].open.replace(/[^0-9.]/g, '')),
    );
    const byName = [...names].sort((left, right) => left.localeCompare(right));
    expect(byName).toEqual(byWidth);
  });
});
