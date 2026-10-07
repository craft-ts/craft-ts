import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  button,
  content,
  craftComponent,
  div,
  p,
  renderCraftComponent,
} from '@craft-ts/component';
import {
  registeredAtoms,
  registeredFonts,
  registeredGlobalRules,
  registeredKeyframes,
} from '@craft-ts/style';
import { renderCss } from '@craft-ts/style/vite';
import { DocDialog } from '../dialog/dialog.ts';
import { dialogUi } from '../dialog/dialog.style.ts';
import { DocMenu } from '../menu/menu.ts';
import { DocTooltip } from '../menu/tooltip.ts';
import { DocToastQueue, DocToastRegion, provideDocToastQueue } from './toast.ts';
import { TOAST_MS } from './toast.style.ts';

afterEach(() => vi.useRealTimers());

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

describe('toasts', () => {
  const Host = craftComponent(
    'ToastHost',
    { providers: [provideDocToastQueue()] },
    function* () {
      const queue = yield* DocToastQueue();
      return div([
        button(
          'push',
          { type: 'button', click: () => queue.push('tip', 'Saved') },
          'push',
        ),
        DocToastRegion({}),
      ]);
    },
  );

  it('shows a pushed message in a polite region, and dismisses it on request', async () => {
    const rendered = await renderCraftComponent(Host as never);
    (rendered.element.querySelector('[type="button"]') as HTMLButtonElement).click();
    await rendered.flush();

    const region = rendered.element.querySelector('[aria-label="Notifications"]');
    expect(region?.textContent).toContain('Saved');
    expect(region?.querySelector('[aria-live="polite"]')).not.toBeNull();
    const toast = region?.querySelector('[data-tone="tip"]');
    expect(toast).not.toBeNull();

    (region?.querySelector('[aria-label="Dismiss notification"]') as HTMLButtonElement).click();
    await rendered.flush();
    expect(rendered.element.textContent).not.toContain('Saved');
    rendered.destroy();
  });

  it('leaves by itself once the line along its foot has run out', async () => {
    vi.useFakeTimers();
    const rendered = await renderCraftComponent(Host as never);
    (rendered.element.querySelector('[type="button"]') as HTMLButtonElement).click();
    await rendered.flush();
    expect(rendered.element.textContent).toContain('Saved');

    await vi.advanceTimersByTimeAsync(TOAST_MS + 50);
    await rendered.flush();
    expect(rendered.element.textContent).not.toContain('Saved');
    rendered.destroy();
  });

  it('emits its entrance, the running line and the tone rules', () => {
    const sheet = css();
    expect(sheet).toContain('@keyframes herbierToast');
    expect(sheet).toContain('@keyframes herbierToastLine');
    expect(sheet).toContain('animation-duration:8000ms');
  });
});

describe('DocDialog', () => {
  const renderDialog = (open: boolean, dismiss = vi.fn()) =>
    renderCraftComponent(DocDialog as never, {
      props: {
        heading: reader('Search'),
        dialogId: reader('search-dialog'),
        open: reader(open),
        body: content(() => p('Results appear here.')),
        dismiss: dismiss as never,
      } as never,
    });

  it('is a labelled modal dialog while open, and a closed one that keeps its content otherwise', async () => {
    const open = await renderDialog(true);
    const dialog = open.element.querySelector('dialog') as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute('aria-labelledby')).toBe('search-dialog-title');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(open.element.querySelector('#search-dialog-title')?.textContent).toBe('Search');
    expect(open.element.textContent).toContain('Results appear here.');
    open.destroy();

    const closed = await renderDialog(false);
    const shut = closed.element.querySelector('dialog') as HTMLDialogElement;
    expect(shut.hasAttribute('open')).toBe(false);
    // Mounted all along: what is inside is already there when it opens.
    expect(closed.element.textContent).toContain('Results appear here.');
    closed.destroy();
  });

  it('asks to be dismissed by its close button', async () => {
    const dismiss = vi.fn();
    const rendered = await renderDialog(true, dismiss);
    (rendered.element.querySelector('[aria-label="Close"]') as HTMLButtonElement).click();
    await rendered.flush();
    expect(dismiss).toHaveBeenCalled();
    rendered.destroy();
  });

  it('leaves its placement to the browser: a modal dialog is fixed in the top layer', () => {
    // `position: relative` would take it out of the top layer's centring and leave
    // it at the foot of the page, open and invisible.
    expect(dialogUi.root).not.toMatch(/position-(relative|absolute|static)/);
  });

  it('paints the scrim with the ink at 40 % opacity, no alpha colour', () => {
    const sheet = css();
    expect(sheet).toContain('::backdrop');
    expect(sheet).toMatch(/::backdrop\{opacity:0\.4\}/);
  });
});

describe('DocMenu', () => {
  const renderMenu = () =>
    renderCraftComponent(DocMenu as never, {
      props: {
        label: reader('Packages'),
        menuId: reader('packages'),
        items: reader([
          { label: '@craft-ts/core', href: '/core', hint: '' },
          { label: '@craft-ts/style', href: '/style', hint: 'npm' },
        ]),
      } as never,
    });

  it('opens on its button, says so, and closes on Escape', async () => {
    const rendered = await renderMenu();
    const trigger = rendered.element.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement;
    const panel = rendered.element.querySelector('[role="menu"]') as HTMLElement;

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('data-menu-state')).toBe('closed');

    trigger.click();
    await rendered.flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(panel.getAttribute('data-menu-state')).toBe('open');
    expect(
      [...panel.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
    ).toEqual(['@craft-ts/core', '@craft-ts/stylenpm']);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await rendered.flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    rendered.destroy();
  });

  it('closes on a press outside, and keeps itself open on a press inside', async () => {
    const rendered = await renderMenu();
    document.body.append(rendered.element);
    const trigger = rendered.element.querySelector('[aria-haspopup="menu"]') as HTMLButtonElement;
    trigger.click();
    await rendered.flush();

    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await rendered.flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await rendered.flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    rendered.destroy();
  });

  it('shows the panel from the menu-state axis', () => {
    expect(css()).toContain("[data-menu-state='open']");
  });
});

describe('DocTooltip', () => {
  it('wraps its control and carries a tooltip the control can be described by', async () => {
    const rendered = await renderCraftComponent(DocTooltip as never, {
      props: {
        tip: reader('Copy code'),
        tipId: reader('tip-copy'),
        body: content(() => button('x', { type: 'button', 'aria-describedby': 'tip-copy' }, 'Copy')),
      } as never,
    });
    const bubble = rendered.element.querySelector('[role="tooltip"]') as HTMLElement;
    expect(bubble.id).toBe('tip-copy');
    expect(bubble.textContent).toBe('Copy code');
    expect(rendered.element.querySelector('button')?.getAttribute('aria-describedby')).toBe(
      'tip-copy',
    );
    rendered.destroy();
  });

  it('is shown by hover or by keyboard focus inside, through one variable', () => {
    const sheet = css();
    expect(sheet).toContain(':has(:focus-visible)');
    expect(sheet).toContain('--docTooltip-show');
  });
});
