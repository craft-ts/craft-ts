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
import { registeredClasses } from '@craft-ts/style';
import { aiTheme } from './ai-overlay.style';
import { aiChat } from './ai-send-context-chat.style';

/** A sheet class's declarations, as `conditions property: value` lines. */
const declarationsOf = (className: string): string[] =>
  (
    registeredClasses().find((entry) => entry.className === className)?.rules ??
    []
  ).map(
    (rule) =>
      `${rule.conditions.map((point) => `${point.axis}:${point.point}`).join('|')}${rule.pseudoElement ? `::${rule.pseudoElement}` : ''} ${rule.property}: ${rule.value}`,
  );

function createUiContext(
  session: SendContextSession,
  targets: SendContextTarget[],
  endpoint?: string,
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
    endpoint,
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
    vi.unstubAllGlobals();
  });

  it('keeps the panel controls readable when the host app styles native controls', async () => {
    const rendered = await renderChat(
      createUiContext(createSendContextSession(), []),
    );
    // Every native control carries a sheet class that sets its own colours
    // from the overlay theme — which has a dark side.
    const textarea = rendered.nativeElement.querySelector('textarea');
    const buttons = [...rendered.nativeElement.querySelectorAll('button')];
    expect(textarea?.className).toBe(aiChat.textarea);
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.className).toMatch(
        new RegExp(`${aiChat.button}|${aiChat.close}|${aiChat.targetRemove}`),
      );
    }
    expect(declarationsOf(aiChat.textarea)).toEqual(
      expect.arrayContaining([
        ' color: var(--craft-ai-text)',
        ' background-color: var(--craft-ai-control-bg)',
      ]),
    );
    expect(declarationsOf(aiChat.button)).toContain(
      ' color: var(--craft-ai-text)',
    );
    expect(declarationsOf(aiTheme.root)).toEqual(
      expect.arrayContaining(['scheme:dark --craft-ai-text: #f9fafb']),
    );

    rendered.destroy();
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

  it('keeps Copy prompt when no webhook endpoint is configured', async () => {
    const rendered = await renderChat(
      createUiContext(createSendContextSession(), []),
    );

    expect(
      rendered.nativeElement.querySelector('[data-craft-name="aiCopyPrompt"]'),
    ).not.toBeNull();
    expect(
      rendered.nativeElement.querySelector('[data-craft-name="aiSendContext"]'),
    ).toBeNull();

    rendered.destroy();
  });

  it.each([200, 202, 204])(
    'sends the same versioned payload for HTTP %s',
    async (status) => {
      const session = createSendContextSession();
      session.capture('http', 'succeeded', { name: 'getUser' });
      const fetchMock = vi.fn(
        (_input: RequestInfo | URL, _init?: RequestInit) =>
          Promise.resolve(
            new Response(status === 204 ? null : JSON.stringify({ ok: true }), {
              status,
            }),
          ),
      );
      vi.stubGlobal('fetch', fetchMock);
      const rendered = await renderChat(
        createUiContext(
          session,
          [{ tagName: 'button', textContent: 'Demo' }],
          'https://agent.example.test/hooks/context',
        ),
      );

      rendered.nativeElement
        .querySelector<HTMLButtonElement>('[data-craft-name="aiSendContext"]')
        ?.click();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      await rendered.flush();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://agent.example.test/hooks/context',
        expect.objectContaining({ method: 'POST' }),
      );
      const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const body = JSON.parse(String(request.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        version: 1,
        instruction: '',
        selectedElements: [{ tagName: 'button', textContent: 'Demo' }],
        events: [expect.objectContaining({ name: 'getUser' })],
        snapshot: [],
        captures: {},
      });
      expect(body.prompt).toContain('# Selected elements (1)');
      expect(body.prompt).toContain('http succeeded · getUser');
      expect(body.component).toMatchObject({ hostName: 'DemoComponent' });
      expect(rendered.nativeElement.textContent).toContain(
        'Context sent to the webhook',
      );
      expect(writeText).not.toHaveBeenCalled();

      rendered.nativeElement
        .querySelector<HTMLButtonElement>(
          '[data-craft-name="aiCopyWebhookPrompt"]',
        )
        ?.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      // The performance section is live: the copy also reports the send.
      const withoutDiagnostics = (prompt: unknown) =>
        String(prompt).split('\n\n# Send Context performance diagnostics')[0];
      expect(withoutDiagnostics(writeText.mock.calls[0]?.[0])).toBe(
        withoutDiagnostics(body.prompt),
      );
      expect(body.prompt).toContain('# Send Context performance diagnostics');

      rendered.destroy();
      session.destroy();
    },
  );

  it.each([400, 503])(
    'offers Retry and Copy payload after HTTP %s without copying automatically',
    async (status) => {
      const session = createSendContextSession();
      const fetchMock =
        vi.fn<
          (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
        >();
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'unavailable' }), { status }),
      );
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', fetchMock);
      const rendered = await renderChat(
        createUiContext(
          session,
          [{ tagName: 'button', textContent: 'Demo' }],
          'https://agent.example.test/hooks/context',
        ),
      );

      rendered.nativeElement
        .querySelector<HTMLButtonElement>('[data-craft-name="aiSendContext"]')
        ?.click();
      await vi.waitFor(() =>
        expect(rendered.nativeElement.textContent).toContain(`HTTP ${status}`),
      );
      expect(writeText).not.toHaveBeenCalled();

      const firstBody = JSON.parse(
        String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
      );
      rendered.nativeElement
        .querySelector<HTMLButtonElement>('[data-craft-name="aiCopyPayload"]')
        ?.click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      expect(JSON.parse(writeText.mock.calls[0]?.[0] as string)).toEqual(
        firstBody,
      );

      rendered.nativeElement
        .querySelector<HTMLButtonElement>('[data-craft-name="aiRetrySend"]')
        ?.click();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      const retryBody = JSON.parse(
        String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
      );
      expect(retryBody).toEqual(firstBody);

      rendered.destroy();
      session.destroy();
    },
  );

  it('reports a network failure and never copies without an explicit action', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const rendered = await renderChat(
      createUiContext(
        createSendContextSession(),
        [],
        'https://agent.example.test/hooks/context',
      ),
    );

    rendered.nativeElement
      .querySelector<HTMLButtonElement>('[data-craft-name="aiSendContext"]')
      ?.click();
    await vi.waitFor(() =>
      expect(rendered.nativeElement.textContent).toContain('unreachable'),
    );
    expect(writeText).not.toHaveBeenCalled();

    rendered.destroy();
  });

  it('reports a webhook timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_input: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const rendered = await renderChat(
      createUiContext(
        createSendContextSession(),
        [],
        'https://agent.example.test/hooks/context',
      ),
    );

    rendered.nativeElement
      .querySelector<HTMLButtonElement>('[data-craft-name="aiSendContext"]')
      ?.click();
    await vi.advanceTimersByTimeAsync(10_000);
    await rendered.flush();

    expect(rendered.nativeElement.textContent).toContain('timed out');
    expect(writeText).not.toHaveBeenCalled();
    rendered.destroy();
    vi.useRealTimers();
  });

  it('excludes previous webhook calls from the next payload timeline', async () => {
    const endpoint = 'https://agent.example.test/hooks/context';
    const session = createSendContextSession();
    session.capture('http', 'started', {
      name: 'POST',
      operationId: 'webhook-1',
      payload: { method: 'POST', url: endpoint },
    });
    session.capture('http', 'succeeded', {
      name: 'POST',
      operationId: 'webhook-1',
    });
    session.capture('http', 'succeeded', {
      name: 'POST',
      operationId: 'application-1',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const rendered = await renderChat(createUiContext(session, [], endpoint));

    rendered.nativeElement
      .querySelector<HTMLButtonElement>('[data-craft-name="aiSendContext"]')
      ?.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    ) as { events: Array<{ operationId?: string }> };
    expect(body.events.map((event) => event.operationId)).toEqual([
      'application-1',
    ]);

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
      '[role="dialog"]',
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
      '[role="dialog"]',
    ) as HTMLElement;
    const handle = panel.querySelector('header') as HTMLElement;
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
    // The offset is written to typed variables the sheet reads.
    expect(panel.style.getPropertyValue('--craftAiChat-x')).toBe('-100px');
    expect(panel.style.getPropertyValue('--craftAiChat-y')).toBe('60px');

    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await rendered.flush();
    expect(panel.style.getPropertyValue('--craftAiChat-x')).toBe('0px');
    expect(panel.style.getPropertyValue('--craftAiChat-y')).toBe('0px');

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
