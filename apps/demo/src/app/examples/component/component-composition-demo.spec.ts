// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import { componentCompositionDemo } from './component-composition-demo';

// Le composant n'atteint son service que par ses bindings : ce test vérifie
// que le clic passe bien par le raccourci et que le rendu suit.
describe('componentCompositionDemo', () => {
  it('bascule l accès depuis le binding de son service', async () => {
    const rendered = await renderCraftComponent(
      componentCompositionDemo as never,
    );

    const initial = rendered.element.textContent ?? '';

    (
      rendered.element.querySelector(
        '.component-demo__access-toggle',
      ) as HTMLButtonElement
    ).click();
    await rendered.flush();

    expect(initial).not.toContain('Private data');
    expect(rendered.element.textContent).toContain('Private data: accessible');

    rendered.destroy();
  });
});
