import { describe, expect, it } from 'vitest';
import {
  applyCraftPageActions,
  collectCraftPageControls,
} from './dev-tools-page-actor';

function page(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

describe('page actor', () => {
  it('reads named controls and hides the value of sensitive ones', () => {
    const root = page(`
      <label for="email">E-mail</label>
      <input id="email" data-craft-name="sign-in-email" value="camille@shop.test">
      <input type="password" data-craft-name="sign-in-password" value="hunter2">
      <input data-craft-name="sms-code" autocomplete="one-time-code" value="123456">
      <button data-craft-name="sign-in-submit">Se connecter</button>
    `);

    const controls = collectCraftPageControls(root);

    expect(controls).toEqual([
      expect.objectContaining({ id: 'sign-in-email', name: 'E-mail', value: 'camille@shop.test' }),
      expect.objectContaining({ id: 'sign-in-password', sensitive: true }),
      expect.objectContaining({ id: 'sms-code', sensitive: true }),
      expect.objectContaining({ id: 'sign-in-submit', role: 'button', name: 'Se connecter' }),
    ]);
    expect(JSON.stringify(controls)).not.toContain('hunter2');
    expect(JSON.stringify(controls)).not.toContain('123456');
  });

  it('fills and clicks, but leaves a sensitive field to the person', async () => {
    const root = page(`
      <input data-craft-name="name">
      <input type="password" data-craft-name="password">
      <button data-craft-name="save">Enregistrer</button>
    `);
    let clicks = 0;
    root.querySelector('button')!.addEventListener('click', () => clicks++);

    await expect(
      applyCraftPageActions(root, [{ id: 'name', fill: 'Flat white' }, { id: 'save' }], async () => undefined),
    ).resolves.toEqual({});
    expect(root.querySelector<HTMLInputElement>('[data-craft-name=name]')!.value).toBe('Flat white');
    expect(clicks).toBe(1);

    const refused = await applyCraftPageActions(root, [{ id: 'password', fill: 'x' }], async () => undefined);
    expect(refused.error).toContain('sensitive');
    expect(root.querySelector<HTMLInputElement>('[data-craft-name=password]')!.value).toBe('');
  });

  it('navigates inside the app for goto and stops at the first failure', async () => {
    const root = page('<button data-craft-name="a">A</button><button data-craft-name="a">A</button>');
    const visited: string[] = [];

    const result = await applyCraftPageActions(
      root,
      [{ goto: 'http://localhost:4300/admin?tab=products' }, { id: 'a' }, { goto: '/never' }],
      async (url) => visited.push(url),
    );

    expect(visited).toEqual(['/admin?tab=products']);
    expect(result.error).toContain('ambiguous');
  });
});
