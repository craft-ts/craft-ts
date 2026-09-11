// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { craftComponent } from '../component';
import { div } from '../hyperscript';
import { renderCraftComponent } from '../testing';
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
      () => div({ class: 'context-target' }, 'Target'),
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
      '.context-target',
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
    });
    rendered.destroy();
    target?.dispatchEvent(new MouseEvent('contextmenu'));
    expect(controller.open).toHaveBeenCalledOnce();
  });
});
