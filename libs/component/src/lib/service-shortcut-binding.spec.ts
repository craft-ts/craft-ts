// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { craftService, state } from '@craft-ts/core';
import { button, div, p, span } from './hyperscript';
import { craftComponent } from './component';
import { renderCraftComponent } from './testing';

const { ShortcutView, provideShortcutView } = craftService(
  { name: 'shortcutView', providedIn: 'toProvide' },
  function* () {
    const counter = yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
    return { counter };
  },
);

// Le composant n'atteint son service que par ses bindings : pas de `yield*`,
// pas de déclaration intermédiaire.
const Shortcut = craftComponent(
  'Shortcut',
  { providers: [provideShortcutView()] },
  () =>
    div([
      p(ShortcutView.counter),
      span({ title: ShortcutView.counter }, 'titre'),
      button('inc', { click: ShortcutView.counter.increment }, '+'),
    ]),
);

describe('un raccourci de service lié au point d usage', () => {
  it('rend la valeur du membre, pas sa référence', async () => {
    const rendered = await renderCraftComponent(Shortcut as never);

    expect(rendered.element.querySelector('p')?.textContent).toBe('0');
    expect(rendered.element.querySelector('span')?.getAttribute('title')).toBe(
      '0',
    );

    rendered.destroy();
  });

  it('exécute la méthode que le binding désigne, et le rendu suit', async () => {
    const rendered = await renderCraftComponent(Shortcut as never);

    (rendered.element.querySelector('button') as HTMLButtonElement).click();
    await rendered.flush();

    expect(rendered.element.querySelector('p')?.textContent).toBe('1');
    expect(rendered.element.querySelector('span')?.getAttribute('title')).toBe(
      '1',
    );

    rendered.destroy();
  });
});
