import { describe, expect, it } from 'vitest';
import { content, renderCraftComponent } from '@craft-ts/component';
import {
  registeredAtoms,
  registeredFonts,
  registeredGlobalRules,
  registeredKeyframes,
} from '@craft-ts/style';
import { renderCss } from '@craft-ts/style/vite';
import { DocCallout, calloutCaption, type CalloutTone } from './callout.ts';

const render = (tone: CalloutTone, custom?: string) =>
  renderCraftComponent(DocCallout as never, {
    props: {
      // An input is a yieldable reader: a generator function, as in the demos.
      tone: function* () {
        return tone;
      },
      caption: function* () {
        return calloutCaption(tone, custom);
      },
      body: content(() => 'The dependency graph is visible to the compiler.'),
    } as never,
  });

describe('DocCallout', () => {
  it.each(['info', 'tip', 'warning', 'danger', 'important'] as const)(
    'carries the %s tone as one attribute, never as a built class',
    async (tone) => {
      const rendered = await render(tone);
      const root = rendered.element.firstElementChild as HTMLElement;

      expect(root.getAttribute('data-tone')).toBe(tone);
      expect(root.getAttribute('role')).toBe('note');
      // One static class: what makes the set of states enumerable.
      expect(root.className.split(/\s+/).filter(Boolean).length).toBeGreaterThan(
        0,
      );
      rendered.destroy();
    },
  );

  it('names the callout after its tone, or after what the page wrote', async () => {
    const plain = await render('tip');
    expect(plain.element.textContent).toContain('TIP');
    plain.destroy();

    const custom = await render('tip', '  Remember this ');
    expect(custom.element.textContent).toContain('Remember this');
    expect(custom.element.textContent).not.toContain('TIP');
    custom.destroy();
  });

  it('renders its body slot', async () => {
    const rendered = await render('danger');
    expect(rendered.element.textContent).toContain(
      'The dependency graph is visible to the compiler.',
    );
    rendered.destroy();
  });

  it('emits a rule for every tone and a dark side for the theme', () => {
    const css = renderCss(registeredAtoms(), [], {
      reset: true,
      base: true,
      globals: registeredGlobalRules(),
      fonts: registeredFonts(),
      keyframes: registeredKeyframes(),
    });

    for (const tone of ['tip', 'warning', 'danger', 'important'] as const) {
      expect(css).toContain(`[data-tone='${tone}']`);
    }
    // Follows the user agent, and can be forced either way.
    expect(css).toContain('prefers-color-scheme');
    expect(css).toContain("[data-mode='dark']");
    expect(css).toContain("[data-mode='light']");
    expect(css).toContain('@keyframes herbierArrive');
  });
});
