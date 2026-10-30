// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { craftComponent } from '../component';
import { mountCraftComponent } from '../bridge';
import { button, div, input, span } from '../hyperscript';
import { renderCraftComponent } from '../testing';
import {
  createEnvironmentInjector,
  Injector,
  runInInjectionContext,
} from '../host-runtime';
import {
  craftService,
  ɵgetCraftRootDefaultProviders,
  ɵinjectSendContextSession,
  ɵregisterCraftReplayTarget,
} from '@craft-ts/core';
import { AiContextMenu } from './ai-context-menu';
import {
  provideAiContextMenuController,
  provideCraftDebugSessionCapture,
  provideSendContextToAi,
  ɵserializeReplayArgument,
} from './send-context-to-ai';
import {
  provideSendContextChatComponent,
  provideSendContextUiRenderer,
} from './send-context-ui.tokens';
import type { Provider } from '../host-runtime';
import { registeredClasses } from '@craft-ts/style';
import { aiLauncher, aiMenu, aiTheme } from './ai-overlay.style';

/** A sheet class's declarations, as `conditions property: value` lines. */
const declarationsOf = (className: string): string[] =>
  (
    registeredClasses().find((entry) => entry.className === className)?.rules ??
    []
  ).map(
    (rule) =>
      `${rule.conditions.map((point) => `${point.axis}:${point.point}`).join('|')}${rule.pseudoElement ? `::${rule.pseudoElement}` : ''} ${rule.property}: ${rule.value}`,
  );

describe('provideSendContextToAi', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('marks non-serializable invocation arguments as unsupported', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    expect(ɵserializeReplayArgument(() => undefined)).toEqual({
      $craftReplayUnsupported: 'function',
    });
    expect(ɵserializeReplayArgument(circular)).toEqual({
      self: { $craftReplayUnsupported: 'circular-reference' },
    });
    expect(ɵserializeReplayArgument(undefined)).toEqual({
      $craftReplayUndefined: true,
    });
    expect(ɵserializeReplayArgument({ id: 3, active: false })).toEqual({
      id: 3,
      active: false,
    });
    expect(ɵserializeReplayArgument(-0)).toEqual({ $craftReplayNumber: '-0' });
    expect(ɵserializeReplayArgument(12n)).toEqual({ $craftReplayBigInt: '12' });
  });

  it('stores event targets as opaque Craft identities without row selectors', () => {
    const target = document.createElement('button');
    target.setAttribute('data-user-id', 'customer-private-id');
    document.body.append(target);
    const unregister = ɵregisterCraftReplayTarget(target, [
      'UserList',
      'item:customer-private-id',
      'remove',
    ]);
    const event = new MouseEvent('click', { bubbles: true, clientX: 20 });
    target.dispatchEvent(event);

    const serialized = ɵserializeReplayArgument(event);
    expect(serialized).toMatchObject({
      $craftReplayEvent: {
        type: 'click',
        replayTarget: {
          runtimeId: expect.any(String),
          componentPath: [expect.any(String)],
          localTargetPath: [],
        },
      },
    });
    expect(JSON.stringify(serialized)).not.toContain('customer-private-id');
    unregister();
  });

  it('waits for Record when automatic recording is disabled', () => {
    const parent = createEnvironmentInjector(
      [
        ...ɵgetCraftRootDefaultProviders(),
        ...provideSendContextToAi({ recording: false }),
      ],
      Injector.NULL,
      'SendContextRecordingDisabledTestRoot',
    );
    const session = runInInjectionContext(parent, () =>
      ɵinjectSendContextSession(),
    );
    expect(session?.activeClip).toBeUndefined();
    session?.capture('custom', 'emitted', { name: 'before-record' });
    expect(session?.events).toEqual([]);
    session?.startRecord();
    session?.capture('custom', 'emitted', { name: 'after-record' });
    expect(session?.events.map((event) => event.name)).toEqual([
      'after-record',
    ]);
    parent.destroy();
  });

  it('starts an application session when automatic recording is enabled', () => {
    const parent = createEnvironmentInjector(
      [
        ...ɵgetCraftRootDefaultProviders(),
        ...provideSendContextToAi({ recording: true }),
      ],
      Injector.NULL,
      'SendContextRecordingEnabledTestRoot',
    );
    const session = runInInjectionContext(parent, () =>
      ɵinjectSendContextSession(),
    );
    expect(session?.activeClip?.label).toBe('Application session');
    session?.capture('custom', 'emitted', { name: 'during-startup-session' });
    expect(session?.events.map((event) => event.name)).toEqual([
      'during-startup-session',
    ]);
    parent.destroy();
  });

  it('records the page scroll position with each replayable click', async () => {
    const scrollX = vi.spyOn(window, 'scrollX', 'get').mockReturnValue(23);
    const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(640);
    const component = craftComponent('ScrolledClickCapture', {}, function* () {
      return div({ id: 'scroll-pane' }, [
        button({ click: () => undefined }, 'Save'),
      ]);
    });
    const rendered = await renderCraftComponent(component, {
      providers: [...provideSendContextToAi({ recording: true })] as never,
    });

    const scroller =
      rendered.nativeElement.querySelector<HTMLElement>('#scroll-pane');
    if (scroller) {
      scroller.scrollLeft = 9;
      scroller.scrollTop = 321;
    }
    rendered.nativeElement.querySelector('button')?.click();
    const session = runInInjectionContext(rendered.injector, () =>
      ɵinjectSendContextSession(),
    );

    try {
      expect(
        session?.events.find((event) => event.kind === 'dom')?.payload,
      ).toMatchObject({
        scrollX: 23,
        scrollY: 640,
        scrollAncestors: [
          {
            selector: '#scroll-pane',
            scrollLeft: 9,
            scrollTop: 321,
          },
        ],
      });
    } finally {
      rendered.destroy();
      scrollX.mockRestore();
      scrollY.mockRestore();
    }
  });

  it('omits form values by default and records only explicitly opted-in fields', async () => {
    const component = craftComponent('PrivateInputCapture', {}, function* () {
      return div([
        input({
          id: 'private-field',
          value: 'not recorded',
          input: () => undefined,
        }),
        input({
          id: 'replay-field',
          value: 'initial',
          'data-debug-session-capture-value': 'true',
          input: () => undefined,
        }),
        input({
          id: 'password-field',
          type: 'password',
          value: 'never recorded',
          'data-debug-session-capture-value': 'true',
          input: () => undefined,
        }),
      ]);
    });
    const rendered = await renderCraftComponent(component, {
      providers: [...provideCraftDebugSessionCapture()] as never,
    });
    const session = runInInjectionContext(rendered.injector, () =>
      ɵinjectSendContextSession(),
    );
    const privateField =
      rendered.nativeElement.querySelector<HTMLInputElement>('#private-field')!;
    const replayField =
      rendered.nativeElement.querySelector<HTMLInputElement>('#replay-field')!;
    const passwordField =
      rendered.nativeElement.querySelector<HTMLInputElement>(
        '#password-field',
      )!;

    privateField.value = 'private value';
    privateField.dispatchEvent(new Event('input', { bubbles: true }));
    replayField.value = 'replay this';
    replayField.dispatchEvent(new Event('input', { bubbles: true }));
    passwordField.value = 'password value';
    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
    const values = session?.events
      .filter((event) => event.kind === 'dom')
      .map((event) => (event.payload as Record<string, unknown>)['value']);

    try {
      expect(values).toEqual([undefined, 'replay this', undefined]);
    } finally {
      rendered.destroy();
    }
  });

  it('opens the AI context menu from the component host context', async () => {
    const { ContextHostView, provideContextHostView } = craftService(
      { name: 'contextHostView', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    const controller = { open: vi.fn() };
    const component = craftComponent(
      'ContextHost',
      { providers: [provideContextHostView()] },
      function* () {
        yield* ContextHostView();
        return div({ class: 'context-target' }, [
          span({ class: 'nested-target' }, 'Target'),
        ]);
      },
    );
    const rendered = await renderCraftComponent(component, {
      providers: [
        ...provideSendContextToAi({ recording: true }),
        provideAiContextMenuController(controller),
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
    const {
      ContextHostWithDefaultAiView,
      provideContextHostWithDefaultAiView,
    } = craftService(
      { name: 'contextHostWithDefaultAiView', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    const component = craftComponent(
      'ContextHostWithDefaultAi',
      { providers: [provideContextHostWithDefaultAiView()] },
      function* () {
        yield* ContextHostWithDefaultAiView();
        return div({}, 'content');
      },
    );

    const parent = createEnvironmentInjector(
      [
        ...ɵgetCraftRootDefaultProviders(),
        ...provideSendContextToAi({ recording: true }),
      ],
      Injector.NULL,
      'SendContextAiTestRoot',
    );
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = mountCraftComponent(component, host, parent);

    expect(
      document.querySelector('[aria-label="Open the AI Report chat"]'),
    ).not.toBeNull();
    mounted.destroy();
    host.remove();
    parent.destroy();
  });

  it('opens the chat from the launcher even without a prior right-click', async () => {
    const { ContextHostWithLauncherView, provideContextHostWithLauncherView } =
      craftService(
        { name: 'contextHostWithLauncherView', providedIn: 'toProvide' },
        function* () {
          // Nothing to expose.
        },
      );

    const component = craftComponent(
      'ContextHostWithLauncher',
      { providers: [provideContextHostWithLauncherView()] },
      function* () {
        yield* ContextHostWithLauncherView();
        return div({}, 'content');
      },
    );

    const parent = createEnvironmentInjector(
      [
        ...ɵgetCraftRootDefaultProviders(),
        ...provideSendContextToAi({
          recording: true,
          theme: {
            light: { bg: 'var(--app-surface)', accent: { css: '#765432' } },
          },
        }),
      ],
      Injector.NULL,
      'SendContextAiLauncherRoot',
    );
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = mountCraftComponent(component, host, parent);

    const launcher = document.querySelector<HTMLButtonElement>(
      '[aria-label="Open the AI Report chat"]',
    );
    // The overlay host turns pointer events off so the app stays usable; the
    // button has to turn them back on or the click never lands.
    expect(launcher?.parentElement?.className).toContain(aiLauncher.root);
    expect(
      launcher?.parentElement?.style.getPropertyValue('--craft-ai-accent'),
    ).toBe('#765432');
    expect(declarationsOf(aiLauncher.root)).toContain(' pointer-events: auto');

    expect(
      document.querySelector('[aria-label="Send context to AI"]'),
    ).toBeNull();
    const floating = launcher!.closest<HTMLElement>('[data-ai-launcher]')!;
    floating.getBoundingClientRect = () =>
      ({ left: 500, top: 300, width: 180, height: 40 }) as DOMRect;
    const handle = document.querySelector<HTMLButtonElement>(
      '[data-craft-name="aiMoveLauncher"]',
    )!;
    for (const [type, x, y] of [
      ['pointerdown', 600, 320],
      ['pointermove', 500, 380],
      ['pointerup', 500, 380],
    ] as const) {
      handle.dispatchEvent(
        Object.assign(
          new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }),
          { pointerId: 1 },
        ),
      );
    }
    const movedRight = floating.style.getPropertyValue(
      '--craft-ai-launcher-right',
    );
    expect(movedRight).not.toBe('');
    launcher?.click();
    expect(
      document.querySelector('[aria-label="Send context to AI"]'),
    ).not.toBeNull();
    const chatRoot = document
      .querySelector('[data-craft-ai-overlay]')
      ?.getElementsByClassName(aiTheme.root)[0] as HTMLElement | undefined;
    expect(chatRoot?.style.getPropertyValue('--craft-ai-bg')).toBe(
      'var(--app-surface)',
    );
    // The chat takes over the corner, so the launcher steps aside.
    expect(
      document.querySelector('[aria-label="Open the AI Report chat"]'),
    ).toBeNull();

    document
      .querySelector<HTMLButtonElement>('[data-craft-name="aiChatClose"]')
      ?.click();
    expect(
      document.querySelector('[aria-label="Send context to AI"]'),
    ).toBeNull();
    expect(
      document.querySelector('[aria-label="Open the AI Report chat"]'),
    ).not.toBeNull();

    const remounted =
      document.querySelector<HTMLElement>('[data-ai-launcher]')!;
    const overlay = remounted.closest<HTMLElement>('[data-craft-ai-overlay]')!;
    expect(overlay.style.getPropertyValue('--craft-ai-launcher-right')).toBe(
      movedRight,
    );
    remounted
      .querySelector('[data-craft-name="aiMoveLauncher"]')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(overlay.style.getPropertyValue('--craft-ai-launcher-right')).toBe(
      '',
    );

    mounted.destroy();
    host.remove();
    parent.destroy();
  });

  it.each(['context menu', 'picker'])(
    'preserves the draft and sends both targets when adding through the %s',
    async (selection) => {
      const {
        ContextHostWithMultipleTargetsView,
        provideContextHostWithMultipleTargetsView,
      } = craftService(
        { name: 'contextHostWithMultipleTargetsView', providedIn: 'toProvide' },
        function* () {
          // Nothing to expose.
        },
      );

      const component = craftComponent(
        `ContextHostWithMultipleTargets${selection === 'picker' ? 'Picker' : 'Menu'}`,
        { providers: [provideContextHostWithMultipleTargetsView()] },
        function* () {
          yield* ContextHostWithMultipleTargetsView();
          return div({}, [
            span({ class: 'first-target' }, 'First target'),
            span({ class: 'second-target' }, 'Second target'),
          ]);
        },
      );

      const parent = createEnvironmentInjector(
        [
          ...ɵgetCraftRootDefaultProviders(),
          ...provideSendContextToAi({ recording: true }),
        ],
        Injector.NULL,
        'SendContextAiPersistenceRoot',
      );
      const host = document.createElement('div');
      document.body.append(host);
      const mounted = mountCraftComponent(component, host, parent);

      const firstTarget = host.querySelector<HTMLElement>('.first-target');
      const secondTarget = host.querySelector<HTMLElement>('.second-target');
      firstTarget?.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          clientX: 120,
          clientY: 80,
        }),
      );
      document
        .querySelector<HTMLButtonElement>('[data-craft-name="aiSendToIa"]')
        ?.click();

      const instruction = document.querySelector<HTMLTextAreaElement>(
        '#craft-ai-chat-instruction',
      );
      expect(instruction).not.toBeNull();
      instruction!.value = 'Keep this instruction';
      instruction!.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();

      const applicationClick = vi.fn();
      secondTarget?.addEventListener('click', applicationClick);
      if (selection === 'picker') {
        const pick = document.querySelector<HTMLButtonElement>(
          '[data-craft-name="aiPickTarget"]',
        )!;
        pick.click();
        expect(pick.textContent).toContain('Cancel selection');
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
        expect(document.querySelector('#craft-ai-chat-instruction')).toBe(
          instruction,
        );
        pick.click();
        secondTarget?.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true }),
        );
        expect(document.querySelector('#craft-ai-chat-instruction')).toBe(
          instruction,
        );
        secondTarget?.click();
        expect(applicationClick).not.toHaveBeenCalled();
      } else {
        secondTarget?.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            button: 2,
            pointerId: 2,
            clientX: 180,
            clientY: 120,
          }),
        );
        secondTarget?.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            clientX: 180,
            clientY: 120,
          }),
        );
        document
          .querySelector<HTMLButtonElement>('[data-craft-name="aiSendToIa"]')
          ?.click();
      }

      await Promise.resolve();

      expect(
        document.querySelector<HTMLTextAreaElement>(
          '#craft-ai-chat-instruction',
        )?.value,
      ).toBe('Keep this instruction');
      expect(
        document.querySelector('[aria-label="Selected elements"]')?.textContent,
      ).toContain('First target');
      expect(
        document.querySelector('[aria-label="Selected elements"]')?.textContent,
      ).toContain('Second target');
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
      document
        .querySelector<HTMLButtonElement>('[data-craft-name="aiCopyPrompt"]')!
        .click();
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      expect(writeText.mock.calls[0][0]).toContain(
        '# Instruction\nKeep this instruction',
      );
      expect(writeText.mock.calls[0][0]).toContain('# Selected elements (2)');
      expect(writeText.mock.calls[0][0]).toContain('First target');
      expect(writeText.mock.calls[0][0]).toContain('Second target');

      mounted.destroy();
      host.remove();
      parent.destroy();
    },
  );

  it('styles the menu from its sheet, positioned by typed variables', async () => {
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

    const menu = rendered.nativeElement.querySelector(
      '[role="menu"]',
    ) as HTMLElement;

    expect(menu.className).toBe(`${aiTheme.root} ${aiMenu.root}`);
    expect(menu.querySelector('[role="menuitem"]')?.className).toBe(
      aiMenu.item,
    );
    expect(declarationsOf(aiMenu.item)).toContain(
      ' color: var(--craft-ai-text)',
    );
    expect(declarationsOf(aiTheme.root)).toEqual(
      expect.arrayContaining(['scheme:dark --craft-ai-bg: #1f2937']),
    );
    expect(menu.style.getPropertyValue('--craftAiMenu-x')).toBe('120px');
    expect(menu.style.getPropertyValue('--craftAiMenu-y')).toBe('80px');

    rendered.destroy();
  });

  it('keeps renderer and chat replacement helpers typed and distinct', () => {
    const { CustomSendContextUiView, provideCustomSendContextUiView } =
      craftService(
        { name: 'customSendContextUiView', providedIn: 'toProvide' },
        function* () {
          // Nothing to expose.
        },
      );

    const custom = craftComponent(
      'CustomSendContextUi',
      { providers: [provideCustomSendContextUiView()] },
      function* () {
        yield* CustomSendContextUiView();
        return div({}, 'custom');
      },
    );

    const rendererProvider: Provider = provideSendContextUiRenderer(
      () => custom,
    );
    const chatProvider: Provider = provideSendContextChatComponent(
      () => custom,
    );

    expect(rendererProvider).not.toEqual(chatProvider);
  });
});
