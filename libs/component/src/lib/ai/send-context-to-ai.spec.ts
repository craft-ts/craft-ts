// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { craftComponent } from '../component';
import { mountCraftComponent } from '../bridge';
import { div, span } from '../hyperscript';
import { renderCraftComponent } from '../testing';
import { createEnvironmentInjector, Injector } from '../host-runtime';
import { ɵgetCraftRootDefaultProviders } from '@craft-ts/core';
import { AiContextMenu } from './ai-context-menu';
import {
  AI_CONTEXT_MENU_CONTROLLER,
  provideSendContextToAi,
} from './send-context-to-ai';
import {
  provideSendContextChatComponent,
  provideSendContextUiRenderer,
  SEND_CONTEXT_CHAT_COMPONENT,
  SEND_CONTEXT_UI_RENDERER,
} from './send-context-ui.tokens';
import type { Provider } from '../host-runtime';

describe('provideSendContextToAi', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('opens the AI context menu from the component host context', async () => {
    const controller = { open: vi.fn() };
    const component = craftComponent(
      'ContextHost',
      {},
      () => ({}),
      () =>
        div({ class: 'context-target' }, [
          span({ class: 'nested-target' }, 'Target'),
        ]),
    );
    const rendered = await renderCraftComponent(component, {
      providers: [
        ...provideSendContextToAi(),
        {
          provide: AI_CONTEXT_MENU_CONTROLLER,
          useValue: controller,
        },
      ] as never,
    });

    const target =
      rendered.nativeElement.querySelector<HTMLElement>('.nested-target');
    target?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 120,
        clientY: 80,
      }),
    );

    expect(controller.open).toHaveBeenCalledOnce();
    expect(controller.open.mock.calls[0][0]).toMatchObject({
      hostName: 'ContextHost',
      tagList: [expect.stringContaining('component:ContextHost#')],
      coords: { x: 120, y: 80 },
      clickedElement: {
        tagName: 'span',
        textContent: 'Target',
        outerHTML: expect.stringContaining('nested-target'),
      },
    });
    rendered.destroy();
    target?.dispatchEvent(new MouseEvent('contextmenu'));
    expect(controller.open).toHaveBeenCalledOnce();
  });

  it('mounts the default launcher without re-entering the controller factory', async () => {
    const component = craftComponent(
      'ContextHostWithDefaultAi',
      {},
      () => ({}),
      () => div({}, 'content'),
    );

    const parent = createEnvironmentInjector(
      [...ɵgetCraftRootDefaultProviders(), ...provideSendContextToAi()],
      Injector.NULL,
      'SendContextAiTestRoot',
    );
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = mountCraftComponent(component, host, parent);

    expect(
      document.querySelector('[aria-label="Open AI context chat"]'),
    ).not.toBeNull();
    mounted.destroy();
    host.remove();
    parent.destroy();
  });

  it('opens the chat from the launcher even without a prior right-click', async () => {
    const component = craftComponent(
      'ContextHostWithLauncher',
      {},
      () => ({}),
      () => div({}, 'content'),
    );

    const parent = createEnvironmentInjector(
      [...ɵgetCraftRootDefaultProviders(), ...provideSendContextToAi()],
      Injector.NULL,
      'SendContextAiLauncherRoot',
    );
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = mountCraftComponent(component, host, parent);

    const launcher = document.querySelector<HTMLButtonElement>(
      '[aria-label="Open AI context chat"]',
    );
    // The overlay host turns pointer events off so the app stays usable; the
    // button has to turn them back on or the click never lands.
    const launcherSheet = Array.from(
      document.querySelectorAll<HTMLStyleElement>('style[data-craft-sheet]'),
    ).find((style) => style.textContent?.includes('craft-ai-launcher'));
    expect(launcherSheet?.textContent).toContain('pointer-events: auto');

    expect(
      document.querySelector('[aria-label="Send context to AI"]'),
    ).toBeNull();
    launcher?.click();
    expect(
      document.querySelector('[aria-label="Send context to AI"]'),
    ).not.toBeNull();
    // The chat takes over the corner, so the launcher steps aside.
    expect(
      document.querySelector('[aria-label="Open AI context chat"]'),
    ).toBeNull();

    document
      .querySelector<HTMLButtonElement>('[data-craft-name="aiChatClose"]')
      ?.click();
    expect(
      document.querySelector('[aria-label="Send context to AI"]'),
    ).toBeNull();
    expect(
      document.querySelector('[aria-label="Open AI context chat"]'),
    ).not.toBeNull();

    mounted.destroy();
    host.remove();
    parent.destroy();
  });

  it('scopes overlay styles to the component root', async () => {
    const rendered = await renderCraftComponent(AiContextMenu, {
      props: {
        x: function* () {
          return 120;
        },
        y: function* () {
          return 80;
        },
        onSelect: () => undefined,
        onDismiss: () => undefined,
      } as never,
    });

    const sheet = Array.from(
      document.querySelectorAll<HTMLStyleElement>('style[data-craft-sheet]'),
    ).find((style) => style.textContent?.includes('AiContextMenu'));
    const menu = rendered.nativeElement.querySelector(
      '.craft-ai-menu',
    ) as HTMLElement;

    expect(sheet?.textContent).toContain(':scope {');
    expect(sheet?.textContent).toContain(':scope .craft-ai-menu-item');
    const menuItemRule =
      sheet?.textContent?.match(
        /:scope \.craft-ai-menu-item\s*\{[^}]*\}/,
      )?.[0] ?? '';
    expect(menuItemRule).toContain('color: var(--craft-ai-text)');
    expect(sheet?.textContent).toContain(
      '@media (prefers-color-scheme: dark)',
    );
    expect(menu.style.left).toBe('120px');
    expect(menu.style.top).toBe('80px');

    rendered.destroy();
  });

  it('keeps renderer and chat replacement helpers typed and distinct', () => {
    const custom = craftComponent(
      'CustomSendContextUi',
      {},
      () => ({}),
      () => div({}, 'custom'),
    );

    const rendererProvider: Provider = provideSendContextUiRenderer(
      () => custom,
    );
    const chatProvider: Provider = provideSendContextChatComponent(
      () => custom,
    );

    expect((rendererProvider as { provide: unknown }).provide).toBe(
      SEND_CONTEXT_UI_RENDERER,
    );
    expect((chatProvider as { provide: unknown }).provide).toBe(
      SEND_CONTEXT_CHAT_COMPONENT,
    );
  });
});
