// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import {
  registeredAtoms,
  registeredFonts,
  registeredGlobalRules,
  registeredKeyframes,
} from '@craft-ts/style';
import { renderCss } from '@craft-ts/style/vite';
import { DocLogo } from './logo.ts';

afterEach(() => document.body.replaceChildren());

const css = () =>
  renderCss(registeredAtoms(), [], {
    reset: true,
    base: true,
    globals: registeredGlobalRules(),
    fonts: registeredFonts(),
    keyframes: registeredKeyframes(),
  } as never);

describe('DocLogo', () => {
  it('stacks the eight bands, then the shade and the light, hidden from assistive technology', async () => {
    const rendered = await renderCraftComponent(DocLogo as never);
    const root = rendered.element.firstElementChild as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect([...root.children].map((layer) => layer.getAttribute('data-part'))).toEqual([
      'r0',
      'r1',
      'r2',
      'r3',
      'r4',
      'r5',
      'r6',
      'r7',
      'shade',
      'light',
    ]);
    rendered.destroy();
  });

  it('paints each layer with the theme colours of the logo, so a season recolours it', async () => {
    await renderCraftComponent(DocLogo as never);
    const sheet = css();
    for (const stop of ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'Shade', 'Light']) {
      expect(sheet, stop).toContain(`var(--herbier-logo${stop})`);
    }
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      expect(sheet, season).toMatch(
        new RegExp(`:root\\[data-season='${season}'\\]\\{--herbier-logoR0:#`),
      );
    }
  });
});
