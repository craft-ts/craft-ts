import { describe, expect, it } from 'vitest';
import {
  AA_NORMAL_TEXT,
  contrastRatio,
} from '@craft-ts/dev-tools/contrast';
import { herbier } from './herbier.style.ts';

type Side = 'light' | 'dark';

const sideOf = (token: { readonly css: string; readonly dark: string }, side: Side) =>
  side === 'light' ? token.css : token.dark;

const ratio = (
  foreground: { readonly css: string; readonly dark: string },
  background: { readonly css: string; readonly dark: string },
  side: Side,
): number =>
  contrastRatio(sideOf(foreground, side), sideOf(background, side)) ?? 0;

const sides: readonly Side[] = ['light', 'dark'];
const tones = ['info', 'tip', 'warning', 'danger', 'important'] as const;
const pages = ['page', 'raised', 'sunken'] as const;

describe('Herbier palette, WCAG AA text contrast', () => {
  it.each(sides)(
    'keeps body, strong, muted and link text readable on every page surface (%s)',
    (side) => {
      for (const surface of pages) {
        for (const ink of ['body', 'strong', 'muted', 'link'] as const) {
          expect(
            ratio(herbier.text[ink], herbier.surface[surface], side),
            `text.${ink} on surface.${surface} (${side})`,
          ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        }
      }
    },
  );

  it.each(sides)(
    'keeps the caption and the body readable on every callout tone (%s)',
    (side) => {
      for (const tone of tones) {
        expect(
          ratio(herbier.text[tone], herbier.surface[tone], side),
          `text.${tone} (caption) on surface.${tone} (${side})`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
        expect(
          ratio(herbier.text.body, herbier.surface[tone], side),
          `text.body on surface.${tone} (${side})`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    },
  );

  it.each(sides)('keeps the action colour usable as a link on the page (%s)', (side) => {
    expect(
      ratio(herbier.accent.action, herbier.surface.page, side),
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

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
      'codeBar',
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
    const pairs = [
      ['codeAdd', 'codeAdd'],
      ['codeRemove', 'codeRemove'],
      ['codeWarning', 'codeWarning'],
    ] as const;

    for (const [border, surface] of pairs) {
      expect(
        ratio(herbier.border[border], herbier.surface[surface], 'dark'),
        `glyph ${border} on ${surface}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });
});
