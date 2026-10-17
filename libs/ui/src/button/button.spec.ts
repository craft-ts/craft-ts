import { describe, expect, it, vi } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component';
import {
  registeredAtoms,
  registeredFonts,
  registeredGlobalRules,
  registeredKeyframes,
} from '@craft-ts/style';
import { renderCss } from '@craft-ts/style/vite';
import { DocButton, DocIconButton, type ButtonVariant } from './button.ts';

const reader =
  <T>(value: T) =>
  function* () {
    return value;
  };

const renderButton = (
  variant: ButtonVariant,
  extra: { disabled?: boolean; loading?: boolean; press?: () => void } = {},
) =>
  renderCraftComponent(DocButton as never, {
    props: {
      label: reader('Save'),
      variant: reader(variant),
      disabled: reader(extra.disabled ?? false),
      loading: reader(extra.loading ?? false),
      press: (extra.press ?? (() => undefined)) as never,
    } as never,
  });

const css = () =>
  renderCss(registeredAtoms(), [], {
    reset: true,
    base: true,
    globals: registeredGlobalRules(),
    fonts: registeredFonts(),
    keyframes: registeredKeyframes(),
  });

describe('DocButton', () => {
  it.each(['primary', 'tonal', 'secondary', 'danger', 'link'] as const)(
    'carries the %s variant as one attribute, never as a built class',
    async (variant) => {
      const rendered = await renderButton(variant);
      const root = rendered.element.querySelector('button') as HTMLButtonElement;

      expect(root.getAttribute('data-variant')).toBe(variant);
      expect(root.getAttribute('type')).toBe('button');
      expect(root.textContent).toContain('Save');
      rendered.destroy();
    },
  );

  it('presses, unless it is busy or disabled', async () => {
    const press = vi.fn();
    const idle = await renderButton('primary', { press });
    (idle.element.querySelector('button') as HTMLButtonElement).click();
    await idle.flush();
    expect(press).toHaveBeenCalledTimes(1);
    idle.destroy();

    const busy = await renderButton('primary', { press, loading: true });
    const busyButton = busy.element.querySelector('button') as HTMLButtonElement;
    busyButton.click();
    await busy.flush();
    expect(press).toHaveBeenCalledTimes(1);
    expect(busyButton.getAttribute('aria-busy')).toBe('true');
    expect(busyButton.getAttribute('data-loading')).toBe('true');
    busy.destroy();

    const off = await renderButton('primary', { press, disabled: true });
    const offButton = off.element.querySelector('button') as HTMLButtonElement;
    expect(offButton.disabled).toBe(true);
    offButton.click();
    await off.flush();
    expect(press).toHaveBeenCalledTimes(1);
    off.destroy();
  });

  it('emits the variants, their hover and pressed fills, the disabled look and the spinner', () => {
    const sheet = css();

    for (const variant of ['primary', 'tonal', 'secondary', 'danger', 'link']) {
      expect(sheet).toContain(`[data-variant='${variant}']`);
    }
    expect(sheet).toContain(':hover');
    expect(sheet).toContain(':active');
    expect(sheet).toContain(':disabled');
    expect(sheet).toContain("[data-loading='true']");
    expect(sheet).toContain('@keyframes herbierSpin');
    // The pressed state moves the box by a pixel, with no transform.
    expect(sheet).toContain('inset-block-start:1px');
  });
});

describe('DocIconButton', () => {
  it('names itself from its label, since it has no visible text', async () => {
    const rendered = await renderCraftComponent(DocIconButton as never, {
      props: {
        label: reader('Copy code'),
        icon: reader('copy'),
        disabled: reader(false),
        press: (() => undefined) as never,
      } as never,
    });
    const button = rendered.element.querySelector('button') as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toBe('Copy code');
    expect(button.querySelector('[data-icon="copy"]')).not.toBeNull();
    rendered.destroy();
  });
});
