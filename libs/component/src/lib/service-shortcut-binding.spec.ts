// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { craftService, state } from '@craft-ts/core';
import { button, div, p, span } from './hyperscript';
import { craftComponent } from './component';
import type { Input } from './types';
import { renderCraftComponent } from './testing';

const { ShortcutView, provideShortcutView } = craftService(
  { name: 'shortcutView', providedIn: 'toProvide' },
  function* () {
    yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
    }));
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

const { ChildStore, provideChildStore } = craftService(
  { name: 'ChildStore', providedIn: 'toProvide' },
  function* () {
    yield* state('counter', 0, ({ update }) => ({
      increment: () => update((value) => value + 1),
      reset: () => update(() => 0),
    }));
  },
);

const { DeepView, provideDeepView } = craftService(
  { name: 'deepView', providedIn: 'toProvide' },
  function* () {
    yield* ChildStore();
  },
);

const Reader = craftComponent(
  'Reader',
  {},
  (_inputs: { readonly value: Input<number> }) =>
    span('ReaderValue', {}, function* () {
      return (yield* _inputs.value()) + 100;
    }),
);

const Deep = craftComponent(
  'Deep',
  { providers: [provideDeepView(), provideChildStore()] },
  () =>
    div([
      p(DeepView.childStore.counter),
      Reader({ value: DeepView.childStore.counter }),
      button('inc', { click: DeepView.childStore.counter.increment }, '+'),
      button(
        'reset',
        {
          *click() {
            // No argument: the method is called, it is not handed back.
            yield* DeepView.childStore.counter.reset();
          },
        },
        '0',
      ),
    ]),
);

describe('un raccourci de service plus profond que deux niveaux', () => {
  it('rend la valeur, la passe en input et exécute les méthodes', async () => {
    const rendered = await renderCraftComponent(Deep as never);
    const buttons = rendered.element.querySelectorAll('button');

    expect(rendered.element.querySelector('p')?.textContent).toBe('0');
    expect(
      rendered.element.querySelector('[data-craft-name="ReaderValue"], span')
        ?.textContent,
    ).toBe('100');

    (buttons[0] as HTMLButtonElement).click();
    await rendered.flush();
    expect(rendered.element.querySelector('p')?.textContent).toBe('1');
    expect(rendered.element.querySelector('span')?.textContent).toBe('101');

    (buttons[1] as HTMLButtonElement).click();
    await rendered.flush();
    expect(rendered.element.querySelector('p')?.textContent).toBe('0');

    rendered.destroy();
  });
});
