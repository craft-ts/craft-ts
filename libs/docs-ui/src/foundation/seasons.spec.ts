import { describe, expect, it } from 'vitest';
import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  contrastRatio,
} from '@craft-ts/dev-tools/contrast';
import { herbier } from './herbier.style.ts';
import { autumn, spring, summer, winter } from './seasons.style.ts';

type Side = 'light' | 'dark';
type Token = { readonly css: string; readonly dark: string };

const sideOf = (token: Token, side: Side) =>
  side === 'light' ? token.css : token.dark;

const ratio = (foreground: Token, background: Token, side: Side): number =>
  contrastRatio(sideOf(foreground, side), sideOf(background, side)) ?? 0;

const sides: readonly Side[] = ['light', 'dark'];
const seasons = { spring, summer, autumn, winter } as const;
const cases = Object.entries(seasons).flatMap(([name, palette]) =>
  sides.map((side) => [name, palette, side] as const),
);

/** The 3:1 bar of a control outline and of a focus ring. */
const AA_NON_TEXT = AA_LARGE_TEXT;

describe.each(cases)('the %s palette (%s side), WCAG AA', (_name, palette, side) => {
  it('keeps body, muted, subtle and link text readable on every page surface', () => {
    for (const surface of ['page', 'raised', 'selected'] as const) {
      for (const ink of ['strong', 'body', 'muted', 'subtle', 'link'] as const) {
        expect(
          ratio(palette.text[ink], palette.surface[surface], side),
          `text.${ink} on surface.${surface}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    }
  });

  it('keeps text readable on the hover and pressed fills of the sage controls', () => {
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
        ratio(palette.text[ink], palette.surface[fill], side),
        `text.${ink} on surface.${fill}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('keeps the tip callout readable', () => {
    expect(ratio(palette.text.tip, palette.surface.tip, side)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
    expect(ratio(palette.text.strong, palette.surface.tip, side)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  it('keeps the label of the solid button readable in every state', () => {
    for (const fill of ['action', 'actionHover', 'actionActive'] as const) {
      expect(
        ratio(palette.accent.onAction, palette.accent[fill], side),
        `accent.onAction on accent.${fill}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('keeps the outline of a field and the action colour visible at 3:1', () => {
    for (const surface of ['page', 'raised'] as const) {
      expect(
        ratio(palette.border.strong, palette.surface[surface], side),
        `border.strong on surface.${surface}`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(
        ratio(palette.accent.action, palette.surface[surface], side),
        `accent.action on surface.${surface}`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('keeps every syntax colour readable on the code surface of the season', () => {
    // The ink of the code is the one of Herbier, whatever the season: only the
    // paper behind it changes, so every season has to leave it readable.
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
    const surfaces = ['code', 'codeHighlight', 'codeAdd', 'codeRemove', 'codeWarning'] as const;
    for (const surface of surfaces) {
      for (const ink of inks) {
        expect(
          ratio(herbier.text[ink], palette.surface[surface], side),
          `text.${ink} on surface.${surface}`,
        ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      }
    }
  });

  it('keeps the gutter glyph of each mark readable on the line of the season', () => {
    for (const mark of ['codeHighlight', 'codeAdd', 'codeRemove', 'codeWarning'] as const) {
      expect(
        ratio(herbier.text[mark], palette.surface[mark], side),
        `glyph ${mark}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });

  it('keeps every colour of the logo visible against the page of the season, at 3:1', () => {
    for (const stop of ['a1', 'a2', 'b1', 'b2', 'b3', 'c1', 'c2'] as const) {
      expect(
        ratio(palette.logo[stop], palette.surface.page, side),
        `logo.${stop} on surface.page`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });

  it('keeps the fixed tones readable on the page of the season', () => {
    // The info, important, warning and danger callouts draw their own surface, but
    // they sit on the page: the border between them is not what carries them, the
    // ink on their own surface is, and that does not depend on the season.
    for (const tone of ['info', 'important', 'warning', 'danger'] as const) {
      expect(
        ratio(herbier.text[tone], herbier.surface[tone], side),
        `text.${tone} on surface.${tone}`,
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });
});
