import { describe, expect, it, vi } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import {
  registeredAtoms,
  registeredFonts,
  registeredGlobalRules,
  registeredKeyframes,
} from '@craft-ts/style';
import { renderCss } from '@craft-ts/style/vite';
import { DocField } from './field.ts';
import { DocSwitch } from '../switch/switch.ts';

const reader =
  <T>(value: T) =>
  function* () {
    return value;
  };

const css = () =>
  renderCss(registeredAtoms(), [], {
    reset: true,
    base: true,
    globals: registeredGlobalRules(),
    fonts: registeredFonts(),
    keyframes: registeredKeyframes(),
  });

const renderField = (
  extra: { hint?: string; invalid?: boolean; edit?: (value: string) => void } = {},
) =>
  renderCraftComponent(DocField as never, {
    props: {
      label: reader('Search the docs'),
      fieldId: reader('search'),
      value: reader(''),
      placeholder: reader('Type a word'),
      hint: reader(extra.hint ?? ''),
      invalid: reader(extra.invalid ?? false),
      disabled: reader(false),
      edit: (extra.edit ?? (() => undefined)) as never,
    } as never,
  });

describe('DocField', () => {
  it('ties the label, the control and the hint together', async () => {
    const rendered = await renderField({ hint: 'Two letters at least' });
    const label = rendered.element.querySelector('label') as HTMLLabelElement;
    const control = rendered.element.querySelector('input') as HTMLInputElement;
    const hint = rendered.element.querySelector('p') as HTMLElement;

    expect(label.getAttribute('for')).toBe('search');
    expect(control.id).toBe('search');
    expect(control.getAttribute('aria-describedby')).toBe(hint.id);
    expect(hint.textContent).toBe('Two letters at least');
    expect(control.placeholder).toBe('Type a word');
    rendered.destroy();
  });

  it('has no description to point at when there is no hint', async () => {
    const rendered = await renderField();
    const control = rendered.element.querySelector('input') as HTMLInputElement;
    expect(control.hasAttribute('aria-describedby')).toBe(false);
    expect(rendered.element.querySelector('p')).toBeNull();
    rendered.destroy();
  });

  it('announces a refused value', async () => {
    const rendered = await renderField({ invalid: true });
    const control = rendered.element.querySelector('input') as HTMLInputElement;
    expect(control.getAttribute('aria-invalid')).toBe('true');
    rendered.destroy();
  });

  it('reports what is typed', async () => {
    const edit = vi.fn();
    const rendered = await renderField({ edit });
    const control = rendered.element.querySelector('input') as HTMLInputElement;
    control.value = 'state';
    control.dispatchEvent(new Event('input', { bubbles: true }));
    await rendered.flush();
    expect(edit).toHaveBeenCalledWith('state');
    rendered.destroy();
  });

  it('reads hover, focus, invalid and disabled from axes, not from hand-written selectors', () => {
    const sheet = css();
    expect(sheet).toContain(':hover');
    expect(sheet).toContain(':focus');
    expect(sheet).toContain("[aria-invalid='true']");
    expect(sheet).toContain(':disabled');
    expect(sheet).toContain('::placeholder');
  });
});

describe('DocSwitch', () => {
  const renderSwitch = (on: boolean, toggle = vi.fn()) =>
    renderCraftComponent(DocSwitch as never, {
      props: {
        label: reader('Dark mode'),
        controlId: reader('mode'),
        on: reader(on),
        disabled: reader(false),
        toggle: toggle as never,
      } as never,
    });

  it('is a switch, named by its visible label, and says whether it is on', async () => {
    const off = await renderSwitch(false);
    const control = off.element.querySelector('button') as HTMLButtonElement;
    expect(control.getAttribute('role')).toBe('switch');
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(control.getAttribute('aria-labelledby')).toBe('mode-label');
    expect(off.element.querySelector('#mode-label')?.textContent).toBe('Dark mode');
    off.destroy();

    const on = await renderSwitch(true);
    expect(on.element.querySelector('button')?.getAttribute('aria-checked')).toBe('true');
    on.destroy();
  });

  it('asks for the opposite state when pressed', async () => {
    const toggle = vi.fn();
    const rendered = await renderSwitch(false, toggle);
    (rendered.element.querySelector('button') as HTMLButtonElement).click();
    await rendered.flush();
    expect(toggle).toHaveBeenCalledWith(true);
    rendered.destroy();
  });
});
