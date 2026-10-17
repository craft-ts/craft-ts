import { describe, expect, it } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import { DocBadge, type BadgeTone } from './badge.ts';
import { DocIcon, ICON_NAMES } from '../icon/icon.ts';
import { registeredAtoms } from '@craft-ts/style';
import { renderCss } from '@craft-ts/style/vite';

const reader =
  <T>(value: T) =>
  function* () {
    return value;
  };

describe('DocBadge', () => {
  it.each(['info', 'tip', 'important', 'warning', 'danger'] as const)(
    'writes its word and its %s tone',
    async (tone: BadgeTone) => {
      const rendered = await renderCraftComponent(DocBadge as never, {
        props: { tone: reader(tone), label: reader('Beta') } as never,
      });
      const root = rendered.element.firstElementChild as HTMLElement;

      expect(root.getAttribute('data-tone')).toBe(tone);
      expect(root.textContent).toBe('Beta');
      rendered.destroy();
    },
  );
});

describe('DocIcon', () => {
  it('is hidden from assistive technology, and one rule draws each glyph', async () => {
    const rendered = await renderCraftComponent(DocIcon as never, {
      props: { name: reader('leaf'), size: reader('lg') } as never,
    });
    const root = rendered.element.firstElementChild as HTMLElement;
    expect(root.getAttribute('aria-hidden')).toBe('true');
    expect(root.getAttribute('data-icon')).toBe('leaf');
    rendered.destroy();

    const sheet = renderCss(registeredAtoms(), [], {});
    for (const name of ICON_NAMES) {
      expect(sheet, `mask rule for ${name}`).toContain(`[data-icon='${name}']`);
    }
    expect(sheet).toContain('mask-image:url("data:image/svg+xml,');
  });

  it('ships the sixteen glyphs of the mock-up', () => {
    for (const name of [
      'leaf', 'spruce', 'sprout', 'relief', 'compass', 'search', 'copy', 'link',
      'check', 'info', 'warning', 'close', 'next', 'sun', 'moon', 'menu',
    ]) {
      expect(ICON_NAMES).toContain(name);
    }
  });
});
