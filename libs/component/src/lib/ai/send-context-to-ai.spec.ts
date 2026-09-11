// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { craftComponent } from '../component';
import { div, span } from '../hyperscript';
import { renderCraftComponent } from '../testing';
import { AiContextMenu } from './ai-context-menu';
import {
  AI_CONTEXT_MENU_CONTROLLER,
  provideSendContextToAi,
} from './send-context-to-ai';

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

    const target = rendered.nativeElement.querySelector<HTMLElement>(
      '.nested-target',
    );
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
    expect(menu.style.left).toBe('120px');
    expect(menu.style.top).toBe('80px');

    rendered.destroy();
  });
});
