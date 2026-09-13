// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSendContextSession,
  provideCraftTemporalRuntime,
  VirtualCraftTemporalRuntime,
  type SendContextSession,
  type SendContextTarget,
} from '@craft-ts/core';
import { renderCraftComponent } from '../testing';
import { AiSendContextChat } from './ai-send-context-chat';
import type { SendContextUiContext } from './send-context-ui.tokens';

function createUiContext(
  session: SendContextSession,
  targets: SendContextTarget[],
): SendContextUiContext {
  return {
    session,
    get events() {
      return session.events;
    },
    get clips() {
      return session.clips;
    },
    get targets() {
      return targets;
    },
    get recording() {
      return session.activeClip !== undefined;
    },
    payload: {
      hostName: 'DemoComponent',
      tagList: ['component:DemoComponent#1'],
      coords: { x: 12, y: 24 },
      outerHTML: '<section id="host"></section>',
      snapshot: [],
    },
    captureElement: undefined,
    chatSections: [],
    chatActions: [],
    exportSections: [],
    addTarget: (target) => {
      targets.push(target);
    },
    removeTarget: (target) => {
      targets.splice(targets.indexOf(target), 1);
    },
    selectClip: () => undefined,
    close: () => undefined,
  };
}

async function renderChat(uiContext: SendContextUiContext) {
  return renderCraftComponent(AiSendContextChat, {
    providers: [
      provideCraftTemporalRuntime(new VirtualCraftTemporalRuntime()),
    ] as never,
    props: {
      context: function* () {
        return uiContext;
      },
      onClose: vi.fn(),
    } as never,
  });
}

describe('AiSendContextChat', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.replaceChildren();
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders captured elements and events as text, never [object Object]', async () => {
    const session = createSendContextSession();
    session.capture('http', 'succeeded', { name: 'getUser' });
    const rendered = await renderChat(
      createUiContext(session, [
        {
          tagName: 'button',
          textContent: 'Demo',
          outerHTML: '<button>Demo</button>',
        },
        { tagName: 'div', selector: '.card' },
      ]),
    );

    const text = rendered.nativeElement.textContent ?? '';
    expect(text).not.toContain('[object Object]');
    expect(text).toContain('Selected elements (2)');
    expect(text).toContain('<button> Demo');
    expect(text).toContain('.card');
    expect(text).toContain('Timeline (1)');
    expect(text).toContain('http · getUser');
    expect(text).toContain('succeeded');

    rendered.destroy();
    session.destroy();
  });

  it('copies a prompt built from the instruction and the checked sections', async () => {
    const session = createSendContextSession();
    session.capture('dom', 'emitted', { name: 'click' });
    const rendered = await renderChat(
      createUiContext(session, [
        {
          tagName: 'button',
          textContent: 'Demo',
          outerHTML: '<button>Demo</button>',
        },
      ]),
    );

    const copy = rendered.nativeElement.querySelector(
      '[data-craft-name="aiCopyPrompt"]',
    ) as HTMLButtonElement;
    expect(copy.disabled).toBe(false);

    const instruction = rendered.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    instruction.value = 'Explain this button';
    instruction.dispatchEvent(new Event('input', { bubbles: true }));
    await rendered.flush();
    expect(copy.disabled).toBe(false);

    copy.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await rendered.flush();
    expect(writeText).toHaveBeenCalledOnce();
    const prompt = writeText.mock.calls[0][0] as string;
    expect(prompt).toContain('# Instruction\nExplain this button');
    expect(prompt).toContain('# Selected elements (1)');
    expect(prompt).toContain('- hostName: DemoComponent');
    expect(prompt).toContain('dom emitted · click');

    rendered.destroy();
    session.destroy();
  });

  it('copies the selected context without an instruction', async () => {
    const session = createSendContextSession();
    const rendered = await renderChat(
      createUiContext(session, [
        {
          tagName: 'button',
          textContent: 'Demo',
          outerHTML: '<button>Demo</button>',
        },
      ]),
    );

    const copy = rendered.nativeElement.querySelector(
      '[data-craft-name="aiCopyPrompt"]',
    ) as HTMLButtonElement;
    expect(copy.disabled).toBe(false);

    copy.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await rendered.flush();

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('# Selected elements (1)');
    expect(writeText.mock.calls[0][0]).toContain('# Component information');

    rendered.destroy();
    session.destroy();
  });

  it('drops a section from the prompt when its checkbox is unchecked', async () => {
    const session = createSendContextSession();
    const rendered = await renderChat(createUiContext(session, []));

    const instruction = rendered.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    instruction.value = 'Only the instruction';
    instruction.dispatchEvent(new Event('input', { bubbles: true }));

    const componentOption = rendered.nativeElement.querySelector(
      '[data-craft-name="aiIncludeComponent"]',
    ) as HTMLInputElement;
    expect(componentOption.checked).toBe(true);
    componentOption.checked = false;
    componentOption.dispatchEvent(new Event('change', { bubbles: true }));
    await rendered.flush();

    (
      rendered.nativeElement.querySelector(
        '[data-craft-name="aiCopyPrompt"]',
      ) as HTMLButtonElement
    ).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await rendered.flush();
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).not.toContain('# Component information');

    rendered.destroy();
    session.destroy();
  });

  it('closes on an outside press, but not on a press in the context menu', async () => {
    const session = createSendContextSession();
    const onClose = vi.fn();
    const rendered = await renderCraftComponent(AiSendContextChat, {
      providers: [
        provideCraftTemporalRuntime(new VirtualCraftTemporalRuntime()),
      ] as never,
      props: {
        context: function* () {
          return createUiContext(session, []);
        },
        onClose,
      } as never,
    });
    const press = (element: Element) =>
      element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    const inside = rendered.nativeElement.querySelector(
      '.craft-ai-chat',
    ) as HTMLElement;
    press(inside);
    expect(onClose).not.toHaveBeenCalled();

    const menuOverlay = document.createElement('div');
    menuOverlay.dataset['craftAiOverlay'] = 'true';
    const menuItem = document.createElement('button');
    menuOverlay.append(menuItem);
    document.body.append(menuOverlay);
    press(menuItem);
    expect(onClose).not.toHaveBeenCalled();

    const outside = document.createElement('div');
    document.body.append(outside);
    press(outside);
    expect(onClose).toHaveBeenCalledOnce();

    rendered.destroy();
    session.destroy();
  });

  it('moves the panel when the header is dragged, and resets on double-click', async () => {
    const session = createSendContextSession();
    const rendered = await renderChat(createUiContext(session, []));

    const panel = rendered.nativeElement.querySelector(
      '.craft-ai-chat',
    ) as HTMLElement;
    const handle = rendered.nativeElement.querySelector(
      '.craft-ai-chat-header',
    ) as HTMLElement;
    // jsdom has no layout engine, so the panel reports a zero-sized rect;
    // pin a plausible one so the off-screen clamp has something to work with.
    panel.getBoundingClientRect = () =>
      ({ left: 500, top: 300, width: 460, height: 200 }) as DOMRect;
    handle.setPointerCapture = vi.fn();
    handle.releasePointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);

    const pointer = (type: string, x: number, y: number) =>
      handle.dispatchEvent(
        Object.assign(
          new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
          { pointerId: 1 },
        ),
      );

    pointer('pointerdown', 600, 320);
    pointer('pointermove', 500, 380);
    pointer('pointerup', 500, 380);
    await rendered.flush();
    expect(panel.style.transform).toBe('translate(-100px, 60px)');

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await rendered.flush();
    expect(panel.style.transform).toBe('');

    rendered.destroy();
    session.destroy();
  });

  it('keeps its own overlay events out of the timeline and the prompt', async () => {
    const session = createSendContextSession();
    session.capture('dom', 'emitted', { name: 'userCard:button:remove:click' });
    session.capture('dom', 'emitted', {
      name: 'AiSendContextChat:header:pointerdown',
    });
    session.capture('dom', 'emitted', {
      name: 'AiSendContextLauncher:button:aiContextLauncher:click',
    });
    const rendered = await renderChat(createUiContext(session, []));

    const text = rendered.nativeElement.textContent ?? '';
    expect(text).toContain('Timeline (1)');
    expect(text).toContain('dom · userCard:button:remove:click');
    expect(text).not.toContain('AiSendContextChat');
    expect(text).not.toContain('AiSendContextLauncher');

    const instruction = rendered.nativeElement.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    instruction.value = 'What happened?';
    instruction.dispatchEvent(new Event('input', { bubbles: true }));
    await rendered.flush();
    (
      rendered.nativeElement.querySelector(
        '[data-craft-name="aiCopyPrompt"]',
      ) as HTMLButtonElement
    ).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await rendered.flush();

    const prompt = writeText.mock.calls[0][0] as string;
    expect(prompt).toContain('# Timeline (1 events)');
    expect(prompt).not.toContain('AiSendContextChat');

    rendered.destroy();
    session.destroy();
  });

  it('toggles recording from the timeline header', async () => {
    const session = createSendContextSession();
    const rendered = await renderChat(createUiContext(session, []));

    const record = rendered.nativeElement.querySelector(
      '[data-craft-name="aiToggleRecord"]',
    ) as HTMLButtonElement;
    expect(record.textContent).toContain('Record');

    record.click();
    expect(session.activeClip).toBeDefined();

    rendered.destroy();
    session.destroy();
  });
});
