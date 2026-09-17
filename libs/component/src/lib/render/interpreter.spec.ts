// @vitest-environment jsdom
import {
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  inject,
  InjectionToken,
  Injector,
  createEnvironmentInjector,
  signal,
  ɵEffectScheduler,
  ɵINJECTOR_SCOPE,
} from '../host-runtime';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  craftComputed,
  CRAFT_NODE_EFFECT_FACTORY,
  craftNodeDirective,
  craftException,
  craftMethod,
  craftService,
  craftUse,
  HOST_TAG_LIST,
  insertDeepYieldable,
  mutation,
  markYieldableValue,
  overrideService,
  provideCraftDomEventHook,
  provideCraftLazyLoadRetry,
  provideCorrelationIdTracking,
  provideTemplateTrace,
  CORRELATION_ID_SERVICE,
  query,
  state,
  type CraftDomEvent,
} from '@craft-ts/core';
import { mountCraftComponent } from '../bridge';
import { craftComponent } from '../component';
import { craftDirective } from '../directive';
import { withHostProps } from '../composition';
import { content, renderContent } from '../project';
import { deferNode } from '../defer-node';
import { forNode } from '../for-node';
import {
  FOR_SCHEDULER,
  scheduleFor,
  type ForScheduler,
} from '../for-scheduling';
import { ifNode } from '../if-node';
import { catchNode } from '../catch-node';
import { a, button, div, h2, li, p, section, span, ul } from '../hyperscript';
import { craftTemplate, renderTemplate } from '../template';
import type { ContentSlot, RequiredContent } from '../types';
import type { HostRequiredLogic, HostTemplate, Input, Output } from '../types';
import { renderCraftComponent } from '../testing';
import { mountInterpretedComponent } from './interpreter';

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

async function observeChildListMutations(
  target: Node,
  update: () => void | Promise<void>,
): Promise<MutationRecord[]> {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => records.push(...batch));
  observer.observe(target, { childList: true, subtree: true });

  try {
    await update();
    await Promise.resolve();
    return records;
  } finally {
    observer.disconnect();
  }
}

function childListMutationNodes(records: readonly MutationRecord[]): Node[] {
  return records.flatMap((record) => [
    ...Array.from(record.addedNodes),
    ...Array.from(record.removedNodes),
  ]);
}

class VirtualForScheduler implements ForScheduler {
  private readonly tasks = new Set<{
    readonly task: () => void;
    cancelled: boolean;
  }>();

  schedule(task: () => void) {
    const queued = { task, cancelled: false };
    this.tasks.add(queued);
    return {
      cancel: () => {
        queued.cancelled = true;
        this.tasks.delete(queued);
      },
    };
  }

  flush(count = Infinity): void {
    let flushed = 0;
    while (this.tasks.size > 0 && flushed < count) {
      const queued = this.tasks.values().next().value as
        | { readonly task: () => void; cancelled: boolean }
        | undefined;
      if (!queued) return;
      this.tasks.delete(queued);
      if (!queued.cancelled) queued.task();
      flushed += 1;
    }
  }

  get pendingCount(): number {
    return this.tasks.size;
  }
}

describe('functional component interpreter', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('updates only the reactive text binding that consumed a changed signal', async () => {
    const first = signal('A');
    const second = signal('B');
    const firstBinding = vi.fn(() => first());
    const secondBinding = vi.fn(() => second());
    const template = vi.fn(() => div([p(firstBinding), p(secondBinding)]));
    const component = craftComponent('granularTextBindings', {}, template);
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    const paragraphs = Array.from(element.querySelectorAll('p'));
    expect(template).toHaveBeenCalledTimes(1);
    expect(firstBinding).toHaveBeenCalledTimes(1);
    expect(secondBinding).toHaveBeenCalledTimes(1);

    first.set('A2');
    await flush();

    expect(element.textContent).toBe('A2B');
    expect(template).toHaveBeenCalledTimes(1);
    expect(firstBinding).toHaveBeenCalledTimes(2);
    expect(secondBinding).toHaveBeenCalledTimes(1);
    expect(element.querySelectorAll('p')[0]).toBe(paragraphs[0]);
    expect(element.querySelectorAll('p')[1]).toBe(paragraphs[1]);
    destroy();
  });

  it('isolates attribute, class and style bindings on the same element', async () => {
    const title = signal('first');
    const active = signal(false);
    const color = signal('red');
    const titleBinding = vi.fn(() => title());
    const classBinding = vi.fn(() => ({ active: active() }));
    const styleBinding = vi.fn(() => ({ color: color() }));
    const template = vi.fn(() =>
      div(
        {
          title: titleBinding,
          class: classBinding,
          style: styleBinding,
        },
        'content',
      ),
    );
    const component = craftComponent('granularElementBindings', {}, template);
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    title.set('second');
    await flush();

    const rendered = element.querySelector('div')!;
    expect(rendered.title).toBe('second');
    expect(template).toHaveBeenCalledTimes(1);
    expect(titleBinding).toHaveBeenCalledTimes(2);
    expect(classBinding).toHaveBeenCalledTimes(1);
    expect(styleBinding).toHaveBeenCalledTimes(1);

    active.set(true);
    color.set('blue');
    await flush();

    expect(rendered.classList.contains('active')).toBe(true);
    expect(rendered.style.color).toBe('blue');
    expect(template).toHaveBeenCalledTimes(1);
    expect(titleBinding).toHaveBeenCalledTimes(2);
    expect(classBinding).toHaveBeenCalledTimes(2);
    expect(styleBinding).toHaveBeenCalledTimes(2);
    destroy();
  });

  it('updates reactive host props without rerunning the component template', async () => {
    const active = signal(false);
    const hostClass = vi.fn(() => ({ active: active() }));
    const template = vi.fn(() => p('content'));
    const component = craftComponent(
      'granularHostBindings',
      { host: { class: hostClass } },
      template,
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);
    expect(hostClass).toHaveBeenCalledTimes(2);

    active.set(true);
    await flush();

    expect(element.classList.contains('active')).toBe(true);
    expect(hostClass).toHaveBeenCalledTimes(4);
    expect(template).toHaveBeenCalledTimes(1);
    destroy();
  });

  // Angular's scheduler coalesced writes made in the same turn into a single
  // binding run. alien-signals notifies synchronously, so each write re-runs
  // the binding. Batching writes back into one run is a scheduler decision
  // tracked separately; what this spec pins is that the DOM lands on the last
  // value and that destruction stops the binding for good.
  it('re-runs a text binding per write and stops after destruction', async () => {
    const value = signal(0);
    const { CoalescedBindingView, provideCoalescedBindingView } = craftService(
      { name: 'coalescedBindingView', providedIn: 'toProvide' },
      () => ({}),
    );

    const binding = vi.fn(() => value());
    const component = craftComponent(
      'coalescedBinding',
      { providers: [provideCoalescedBindingView()] },
      function* () {
        yield* CoalescedBindingView();
        return p(binding);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    value.set(1);
    value.set(2);
    await flush();
    expect(element.textContent).toBe('2');
    expect(binding).toHaveBeenCalledTimes(3);

    destroy();
    value.set(3);
    await flush();
    expect(binding).toHaveBeenCalledTimes(3);
  });

  it('owns conditional bindings in the active branch effect', async () => {
    const visible = signal(true);
    const value = signal('shown');
    const binding = vi.fn(() => value());
    const branch = vi.fn(() => p(binding));
    const condition = markYieldableValue(() => visible(), 'visible');
    const template = vi.fn(() => ifNode(condition, branch));
    const component = craftComponent('granularConditional', {}, template);
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    value.set('updated');
    await flush();
    expect(element.textContent).toBe('updated');
    expect(template).toHaveBeenCalledTimes(1);
    expect(branch).toHaveBeenCalledTimes(1);

    visible.set(false);
    await flush();
    expect(element.textContent).toBe('');
    expect(template).toHaveBeenCalledTimes(1);
    expect(branch).toHaveBeenCalledTimes(1);

    value.set('detached');
    await flush();
    expect(binding).toHaveBeenCalledTimes(2);
    destroy();
  });

  it('keeps the active if branch mounted while its condition stays truthy', async () => {
    const conditionValue = signal(1);
    const { StableIfBranchView, provideStableIfBranchView } = craftService(
      { name: 'stableIfBranchView', providedIn: 'toProvide' },
      () => ({}),
    );

    const condition = markYieldableValue(() => conditionValue(), 'visible');
    const component = craftComponent(
      'stableIfBranch',
      { providers: [provideStableIfBranchView()] },
      function* () {
        yield* StableIfBranchView();
        return ifNode(condition, () => p('stable'));
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    const stableNode = element.querySelector('p');
    if (!stableNode) {
      throw new Error('Expected the active if branch to be rendered');
    }

    try {
      const records = await observeChildListMutations(element, async () => {
        conditionValue.set(2);
        await flush();
      });

      expect(element.querySelector('p')).toBe(stableNode);
      expect(childListMutationNodes(records)).not.toContain(stableNode);
    } finally {
      destroy();
    }
  });

  it('updates one keyed each item without evaluating its siblings', async () => {
    const items = [
      { id: 1, label: signal('one') },
      { id: 2, label: signal('two') },
    ];
    const bindings = items.map((item) => vi.fn(() => item.label()));
    const itemTemplate = vi.fn((item) =>
      li(function* () {
        return bindings[(yield* item()).id - 1]();
      }),
    );
    const template = vi.fn(() =>
      ul(forNode(items, { track: (item) => item.id }, itemTemplate)),
    );
    const component = craftComponent('granularEachBindings', {}, template);
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    const nodes = Array.from(element.querySelectorAll('li'));
    items[0].label.set('updated');
    await flush();

    expect(element.textContent).toBe('updatedtwo');
    expect(template).toHaveBeenCalledTimes(1);
    expect(itemTemplate).toHaveBeenCalledTimes(2);
    expect(bindings[0]).toHaveBeenCalledTimes(2);
    expect(bindings[1]).toHaveBeenCalledTimes(1);
    expect(element.querySelectorAll('li')[0]).toBe(nodes[0]);
    expect(element.querySelectorAll('li')[1]).toBe(nodes[1]);
    destroy();
  });

  it('does not reevaluate unchanged keyed items when the collection changes', async () => {
    const first = { id: 1, label: 'one' };
    const second = { id: 2, label: 'two' };
    const items = signal([first, second]);
    const itemTemplate = vi.fn((item, index: number) =>
      li(
        {
          'data-id': function* () {
            return (yield* item()).id;
          },
        },
        function* () {
          return `${index}:${(yield* item()).label}`;
        },
      ),
    );
    const { GranularEachCollectionView, provideGranularEachCollectionView } =
      craftService(
        { name: 'granularEachCollectionView', providedIn: 'toProvide' },
        () => ({ items }),
      );

    const component = craftComponent(
      'granularEachCollection',
      { providers: [provideGranularEachCollectionView()] },
      function* () {
        const { items } = yield* GranularEachCollectionView();
        return ul(forNode(items, { track: (item) => item.id }, itemTemplate));
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    const nodes = Array.from(element.querySelectorAll('li'));
    const updatedFirst = { ...first, label: 'updated' };
    itemTemplate.mockClear();

    items.set([updatedFirst, second]);
    await flush();

    expect(itemTemplate).toHaveBeenCalledOnce();
    expect(itemTemplate).toHaveBeenCalledOnce();
    expect(craftUse(itemTemplate.mock.calls[0][0]())).toEqual(updatedFirst);
    expect(itemTemplate.mock.calls[0][1]).toBe(0);
    expect(element.textContent).toBe('0:updated1:two');
    expect(element.querySelectorAll('li')[0]).toBe(nodes[0]);
    expect(element.querySelectorAll('li')[1]).toBe(nodes[1]);
    destroy();
  });

  it('does not move unchanged keyed DOM fragments', async () => {
    const first = { id: 1, label: 'one' };
    const second = { id: 2, label: 'two' };
    const { StableEachDomView, provideStableEachDomView } = craftService(
      { name: 'stableEachDomView', providedIn: 'toProvide' },
      () => ({ items }),
    );

    const items = signal([first, second]);
    const component = craftComponent(
      'stableEachDom',
      { providers: [provideStableEachDomView()] },
      function* () {
        const { items } = yield* StableEachDomView();
        return ul(
          forNode(items, { track: (item) => item.id }, (item) =>
            li(
              {
                'data-id': function* () {
                  return (yield* item()).id;
                },
              },
              function* () {
                return (yield* item()).label;
              },
            ),
          ),
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    const list = element.querySelector('ul');
    const rows = Array.from(element.querySelectorAll('li'));
    const unchangedRow = rows[1];

    if (!list) {
      throw new Error('Expected the keyed list to be rendered');
    }

    try {
      const records = await observeChildListMutations(list, async () => {
        items.set([{ ...first, label: 'updated' }, second]);
        await flush();
      });

      expect(element.textContent).toBe('updatedtwo');
      expect(element.querySelectorAll('li')[0]).toBe(rows[0]);
      expect(element.querySelectorAll('li')[1]).toBe(unchangedRow);
      expect(childListMutationNodes(records)).not.toContain(unchangedRow);
    } finally {
      destroy();
    }
  });

  it('traces a changed keyed item as a block update', async () => {
    const first = { id: 1, label: 'one' };
    const second = { id: 2, label: 'two' };
    const items = signal([first, second]);
    const traces: Array<{
      kind: string;
      phase: string;
      componentName?: string;
      name?: string;
      renderCount: number;
    }> = [];
    const { GranularEachTraceView, provideGranularEachTraceView } =
      craftService(
        { name: 'granularEachTraceView', providedIn: 'toProvide' },
        () => ({ items }),
      );

    const component = craftComponent(
      'granularEachTrace',
      {
        providers: [
          provideGranularEachTraceView(),
          provideTemplateTrace((context, next) => {
            traces.push({ ...context });
            return next();
          }),
        ],
      },
      function* () {
        const { items } = yield* GranularEachTraceView();
        return ul(
          forNode(items, { track: (item) => item.id }, (item) =>
            li(function* () {
              return (yield* item()).label;
            }),
          ),
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);
    traces.length = 0;

    items.set([{ ...first, label: 'updated' }, second]);
    await flush();

    expect(traces).toEqual([
      {
        kind: 'block',
        phase: 'update',
        componentName: 'granularEachTrace',
        name: 'for',
        renderCount: 2,
      },
    ]);
    destroy();
  });

  it('renders static nodes, listeners, classes and reactive signal reads', async () => {
    const { CounterView, provideCounterView } = craftService(
      { name: 'counterView', providedIn: 'toProvide' },
      () => ({ count }),
    );

    const count = signal(0);
    const counter = craftComponent(
      'counter',
      {
        providers: [provideCounterView()],
        host: { 'data-kind': 'counter' },
      },
      function* () {
        const { count } = yield* CounterView();
        return div({ class: ['counter', 'active'] }, [
          p({ class: { value: true } }, `Count: ${count()}`),
          button({ click: () => count.update((value) => value + 1) }, '+'),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(counter);

    expect(element.getAttribute('data-kind')).toBe('counter');
    expect(element.querySelector('.value')?.textContent).toBe('Count: 0');

    element.querySelector('button')?.click();
    await flush();
    expect(element.querySelector('.value')?.textContent).toBe('Count: 1');

    destroy();
    expect(element.textContent).toBe('');
  });

  it('keeps an inline click handler after the parent template re-renders', async () => {
    const revision = signal(0);
    const {
      InlineClickSurvivesRendersView,
      provideInlineClickSurvivesRendersView,
    } = craftService(
      { name: 'inlineClickSurvivesRendersView', providedIn: 'toProvide' },
      () => ({ revision, clicks }),
    );

    const clicks = signal(0);
    const widget = craftComponent(
      'inlineClickSurvivesRenders',
      { providers: [provideInlineClickSurvivesRendersView()] },
      function* () {
        const { revision, clicks } = yield* InlineClickSurvivesRendersView();
        return div([
          span(() => String(revision())),
          button(
            {
              class: 'toggle',
              click: function* () {
                clicks.update((value) => value + 1);
              },
            },
            () => `clicks:${clicks()} r:${revision()}`,
          ),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(widget);

    for (let index = 0; index < 12; index += 1) {
      revision.update((value) => value + 1);
      await flush();
    }

    element.querySelector('button')?.click();
    await flush();
    expect(clicks()).toBe(1);
    expect(element.querySelector('button')?.textContent).toContain('clicks:1');

    destroy();
  });

  it('traces component creation, initial render, updates and destruction', async () => {
    const count = signal(0);
    const traces: Array<{
      kind: string;
      phase: string;
      componentName?: string;
      name?: string;
      renderCount: number;
    }> = [];
    const { TemplateTraceCounterView, provideTemplateTraceCounterView } =
      craftService(
        { name: 'templateTraceCounterView', providedIn: 'toProvide' },
        () => ({ count }),
      );

    const counter = craftComponent(
      'templateTraceCounter',
      {
        providers: [
          provideTemplateTraceCounterView(),
          provideTemplateTrace((context, next) => {
            traces.push({ ...context });
            return next();
          }),
        ],
      },
      function* () {
        const { count } = yield* TemplateTraceCounterView();
        return p(String(count()));
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(counter);
    count.set(1);
    await flush();
    destroy();

    expect(traces).toEqual([
      {
        kind: 'component',
        phase: 'create',
        componentName: 'templateTraceCounter',
        renderCount: 0,
      },
      {
        kind: 'component',
        phase: 'initialRender',
        componentName: 'templateTraceCounter',
        name: 'templateTraceCounter',
        renderCount: 1,
      },
      {
        kind: 'component',
        phase: 'update',
        componentName: 'templateTraceCounter',
        name: 'templateTraceCounter',
        renderCount: 2,
      },
      {
        kind: 'component',
        phase: 'destroy',
        componentName: 'templateTraceCounter',
        renderCount: 2,
      },
    ]);
  });

  it('runs DOM event hooks in the component injector and exposes the binding location', async () => {
    const marker = new InjectionToken<string>('dom-event-hook-marker');
    const seen: string[] = [];
    const interactionNames: string[] = [];
    const interactionHook = (
      interaction: CraftDomEvent,
      next: () => unknown,
    ) => {
      interactionNames.push(interaction.interactionName);
      seen.push(`${interaction.eventName}:${inject(marker)}`);
      return next();
    };
    const { InteractionHookView, provideInteractionHookView } = craftService(
      { name: 'interactionHookView', providedIn: 'toProvide' },
      () => ({ clicked }),
    );

    const clicked = signal(0);
    const component = craftComponent(
      'interactionHookComponent',
      {
        providers: [
          provideInteractionHookView(),
          { provide: marker, useValue: 'component-scope' },
          provideCraftDomEventHook(interactionHook),
        ],
      },
      function* () {
        const { clicked } = yield* InteractionHookView();
        return div([
          button(
            'save',
            { click: () => clicked.update((value) => value + 1) },
            'Save',
          ),
          p(() => String(clicked())),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);
    element.querySelector<HTMLButtonElement>('button')?.click();
    await flush();

    expect(seen).toEqual(['click:component-scope']);
    expect(interactionNames).toEqual([
      'interactionHookComponent:button:save:click',
    ]);
    expect(element.querySelector('p')?.textContent).toBe('1');
  });

  it('provides an automatic component host tag from the component name', async () => {
    const { AutomaticHostTagView, provideAutomaticHostTagView } = craftService(
      { name: 'automaticHostTagView', providedIn: 'toProvide' },
      () => ({ hostTags: inject(HOST_TAG_LIST) }),
    );

    const counter = craftComponent(
      'AutomaticHostTag',
      { providers: [provideAutomaticHostTagView()] },
      function* () {
        const { hostTags } = yield* AutomaticHostTagView();
        return p(hostTags.join('|'));
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(counter);

    expect(element.textContent).toMatch(/^component:AutomaticHostTag#\d+$/);
    destroy();
  });

  it('projects named slots without a wrapper and keeps the declarative injector', async () => {
    const label = new InjectionToken<string>('projection-label');
    type CardInput = {
      readonly header?: ContentSlot;
      readonly body: ContentSlot;
    };
    const card = craftComponent(
      'runtimeProjectionCard',
      {
        providers: [{ provide: label, useValue: 'consumer' }],
      },
      function* (input: CardInput) {
        const { header, body } = input;
        return div([
          header ? renderContent('header', header) : h2('fallback'),
          section(renderContent('body', body)),
        ]);
      },
    );
    const { RuntimeProjectionParentView, provideRuntimeProjectionParentView } =
      craftService(
        { name: 'runtimeProjectionParentView', providedIn: 'toProvide' },
        () => ({}),
      );

    const parent = craftComponent(
      'runtimeProjectionParent',
      {
        providers: [
          provideRuntimeProjectionParentView(),
          { provide: label, useValue: 'declarer' },
        ],
      },
      function* () {
        yield* RuntimeProjectionParentView();
        return card({
          header: () => h2(inject(label)),
          body: () => [p('before'), p(inject(label)), p('after')],
        });
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(parent);

    expect(element.textContent).toBe('declarerbeforedeclarerafter');
    expect(element.querySelector('section')?.children).toHaveLength(3);
    expect(element.querySelector('section')?.firstElementChild?.tagName).toBe(
      'P',
    );
    expect(element.querySelectorAll('section > craft-projection')).toHaveLength(
      0,
    );
    destroy();
  });

  it('keeps projected DOM mounted when its descriptor is refreshed', async () => {
    const revision = signal(1);
    const condition = markYieldableValue(() => revision(), 'revision');
    const { StableProjectionView, provideStableProjectionView } = craftService(
      { name: 'stableProjectionView', providedIn: 'toProvide' },
      () => ({}),
    );

    const projected = content(() => p('stable projection'));
    const component = craftComponent(
      'stableProjection',
      { providers: [provideStableProjectionView()] },
      function* () {
        yield* StableProjectionView();
        return ifNode(condition, () =>
          section(renderContent('body', projected)),
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    const stableNode = element.querySelector('p');
    if (!stableNode) {
      throw new Error('Expected the projected content to be rendered');
    }

    try {
      const records = await observeChildListMutations(element, async () => {
        revision.set(2);
        await flush();
      });

      expect(element.querySelector('p')).toBe(stableNode);
      expect(childListMutationNodes(records)).not.toContain(stableNode);
    } finally {
      destroy();
    }
  });

  it('renders contract components through the same renderContent primitive', async () => {
    const trigger = vi.fn();
    type ActionContract = {
      readonly kind: 'toolbar-action';
      readonly trigger: () => void;
      readonly disabled: () => boolean;
    };
    const { RuntimeToolbarActionView, provideRuntimeToolbarActionView } =
      craftService(
        { name: 'runtimeToolbarActionView', providedIn: 'toProvide' },
        (input: {
          readonly key: string;
          readonly content: ContentSlot;
          readonly trigger: () => void;
        }) => {
          return {
            key: input.key,
            contract: {
              kind: 'toolbar-action',
              trigger: input.trigger,
              disabled: () => false,
            } satisfies ActionContract,
            content: input.content,
          };
        },
      );

    const action = craftComponent(
      'runtimeToolbarAction',
      { providers: [provideRuntimeToolbarActionView()] },
      function* (input: {
        readonly key: string;
        readonly content: ContentSlot;
        readonly trigger: () => void;
      }) {
        const { contract, content: label } =
          yield* RuntimeToolbarActionView(input);
        return button({ click: contract.trigger }, renderContent(label));
      },
    );
    const toolbar = craftComponent(
      'runtimeToolbar',
      {},
      function* (input: {
        readonly actions: readonly ReturnType<typeof action>[];
      }) {
        const { actions } = input;
        return div(
          { role: 'toolbar' },
          forNode(actions, { track: (item) => item.key }, (item) =>
            renderContent(item),
          ),
        );
      },
    );
    const { RuntimeToolbarRootView, provideRuntimeToolbarRootView } =
      craftService(
        { name: 'runtimeToolbarRootView', providedIn: 'toProvide' },
        () => ({}),
      );

    const root = craftComponent(
      'runtimeToolbarRoot',
      { providers: [provideRuntimeToolbarRootView()] },
      function* () {
        yield* RuntimeToolbarRootView();
        return toolbar({
          actions: [
            action({
              key: 'save',
              content: () => span('Save'),
              trigger,
            }),
          ],
        });
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(root);

    expect(element.querySelector('[role="toolbar"]')?.textContent).toBe('Save');
    (element.querySelector('button') as HTMLButtonElement).click();
    expect(trigger).toHaveBeenCalledTimes(1);
    destroy();
  });

  it('applies opted-in content styles through a dedicated projection scope', async () => {
    type CardInput = {
      readonly body: RequiredContent<{
        readonly selector: {
          readonly tag: 'p';
          readonly class: 'projected-value';
        };
      }>;
    };
    const {
      ContentStyleProjectedChildView,
      provideContentStyleProjectedChildView,
    } = craftService(
      { name: 'contentStyleProjectedChildView', providedIn: 'toProvide' },
      () => ({}),
    );

    const projectedChild = craftComponent(
      'contentStyleProjectedChild',
      { providers: [provideContentStyleProjectedChildView()] },
      function* () {
        yield* ContentStyleProjectedChildView();
        return p({ class: 'projected-value' }, 'child');
      },
    );
    const card = craftComponent(
      'contentStyleCard',
      {
        styles: '.projected-value { color: blue; }',
        contentStyles: {
          body: ':scope { display: block; } .projected-value { color: red; }',
        },
      },
      function* (input: CardInput) {
        const { body } = input;
        return section(renderContent('body', body));
      },
    );
    const { ContentStylePageView, provideContentStylePageView } = craftService(
      { name: 'contentStylePageView', providedIn: 'toProvide' },
      () => ({}),
    );

    const page = craftComponent(
      'contentStylePage',
      { providers: [provideContentStylePageView()] },
      function* () {
        yield* ContentStylePageView();
        return card({
          body: content(
            () => [
              p({ class: 'projected-value' }, 'ordinary'),
              projectedChild({}),
            ],
            { allowContainerStyles: true },
          ),
        });
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(page);

    const ordinary = element.querySelector('p.projected-value') as HTMLElement;
    expect(ordinary.getAttribute('data-craft-content')).toBe(
      'contentStyleCard::content::body',
    );
    expect(ordinary.getAttribute('data-craft-root')).toBe('contentStylePage');
    const projectedChildNode = element.querySelectorAll('p.projected-value')[1];
    expect(projectedChildNode?.hasAttribute('data-craft-content')).toBe(false);
    expect(projectedChildNode?.getAttribute('data-craft-root')).toContain(
      'contentStyleProjectedChild',
    );
    const contentSheet = Array.from(
      document.querySelectorAll<HTMLStyleElement>('style[data-craft-sheet]'),
    ).find((style) => style.textContent?.includes('data-craft-content'));
    expect(contentSheet?.textContent).toContain(
      '@scope ([data-craft-content~="contentStyleCard::content::body"])',
    );
    expect(contentSheet?.textContent).toContain('to ([data-craft-root])');

    destroy();
    expect(document.querySelectorAll('style[data-craft-sheet]')).toHaveLength(
      0,
    );
  });

  it('keeps content styles isolated unless the slot opts in', async () => {
    const card = craftComponent(
      'isolatedContentStyleCard',
      { contentStyles: { body: ':scope { color: red; }' } },
      function* (input: { readonly body: ContentSlot }) {
        const { body } = input;
        return renderContent('body', body);
      },
    );
    const {
      IsolatedContentStylePageView,
      provideIsolatedContentStylePageView,
    } = craftService(
      { name: 'isolatedContentStylePageView', providedIn: 'toProvide' },
      () => ({}),
    );

    const page = craftComponent(
      'isolatedContentStylePage',
      { providers: [provideIsolatedContentStylePageView()] },
      function* () {
        yield* IsolatedContentStylePageView();
        return card({ body: () => p({ class: 'isolated' }, 'content') });
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(page);

    expect(element.querySelector('p.isolated')).not.toBeNull();
    expect(
      element.querySelector('p.isolated')?.getAttribute('data-craft-content'),
    ).toBeNull();
    expect(document.querySelectorAll('style[data-craft-sheet]')).toHaveLength(
      0,
    );
    destroy();
  });

  it('keeps projected child components on the declarative injector chain', async () => {
    const { RuntimeProjectedChildView, provideRuntimeProjectedChildView } =
      craftService(
        { name: 'runtimeProjectedChildView', providedIn: 'toProvide' },
        () => ({ label: inject(label) }),
      );

    const label = new InjectionToken<string>('projected-child-label');
    const projectedChild = craftComponent(
      'runtimeProjectedChild',
      { providers: [provideRuntimeProjectedChildView()] },
      function* () {
        const { label: value } = yield* RuntimeProjectedChildView();
        return p(value);
      },
    );
    const card = craftComponent(
      'runtimeProjectedChildCard',
      {
        providers: [{ provide: label, useValue: 'consumer' }],
      },
      function* (input: { readonly body: ContentSlot }) {
        const { body } = input;
        return section(renderContent('body', body));
      },
    );
    const {
      RuntimeProjectedChildParentView,
      provideRuntimeProjectedChildParentView,
    } = craftService(
      { name: 'runtimeProjectedChildParentView', providedIn: 'toProvide' },
      () => ({}),
    );

    const parent = craftComponent(
      'runtimeProjectedChildParent',
      {
        providers: [
          provideRuntimeProjectedChildParentView(),
          { provide: label, useValue: 'declarer' },
        ],
      },
      function* () {
        yield* RuntimeProjectedChildParentView();
        return card({ body: () => projectedChild({}) });
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(parent);

    expect(element.textContent).toBe('declarer');
    destroy();
  });

  it('renders a typed template repeatedly and only when its node is active', async () => {
    let renders = 0;
    const row = craftTemplate<{
      readonly $implicit: string;
      readonly index: number;
    }>(({ $implicit: value, index }) => {
      renders += 1;
      return li(`${index}: ${value}`);
    });
    const { RuntimeTemplateFragmentView, provideRuntimeTemplateFragmentView } =
      craftService(
        { name: 'runtimeTemplateFragmentView', providedIn: 'toProvide' },
        () => ({}),
      );

    const component = craftComponent(
      'runtimeTemplateFragment',
      { providers: [provideRuntimeTemplateFragmentView()] },
      function* () {
        yield* RuntimeTemplateFragmentView();
        return ul(
          forNode(['Ada', 'Lin'], { track: (value) => value }, (value, index) =>
            renderTemplate(row, { $implicit: value, index }),
          ),
        );
      },
    );
    expect(renders).toBe(0);
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    expect(renders).toBe(2);
    expect(element.textContent).toBe('0: Ada1: Lin');
    destroy();
  });

  it('keeps rendered template DOM mounted when its context changes', async () => {
    const revision = signal(1);
    const condition = markYieldableValue(() => revision(), 'revision');
    const row = craftTemplate<{ readonly label: string }>(({ label }) =>
      p(label),
    );
    const { StableTemplateFragmentView, provideStableTemplateFragmentView } =
      craftService(
        { name: 'stableTemplateFragmentView', providedIn: 'toProvide' },
        () => ({}),
      );

    const component = craftComponent(
      'stableTemplateFragment',
      { providers: [provideStableTemplateFragmentView()] },
      function* () {
        yield* StableTemplateFragmentView();
        return ifNode(condition, () =>
          renderTemplate(row, { label: `revision-${revision()}` }),
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    const stableNode = element.querySelector('p');
    if (!stableNode) {
      throw new Error('Expected the template fragment to be rendered');
    }

    try {
      const records = await observeChildListMutations(element, async () => {
        revision.set(2);
        await flush();
      });

      expect(element.textContent).toBe('revision-2');
      expect(element.querySelector('p')).toBe(stableNode);
      expect(childListMutationNodes(records)).not.toContain(stableNode);
    } finally {
      destroy();
    }
  });

  it('constructs child component queries outside the parent render context', async () => {
    const { QueryChildView, provideQueryChildView } = craftService(
      { name: 'queryChildView', providedIn: 'toProvide' },
      function* () {
        const value = yield* query('value', {
          params: () => true,
          loader: async () => ({ status: 'ready' }),
        });
        return { value };
      },
    );

    const child = craftComponent(
      'queryChild',
      { providers: [provideQueryChildView()] },
      function* () {
        const { value } = yield* QueryChildView();
        return p(function* () {
          return (yield* value.value())?.status ?? 'loading';
        });
      },
    );
    const { QueryParentView, provideQueryParentView } = craftService(
      { name: 'queryParentView', providedIn: 'toProvide' },
      () => ({}),
    );

    const parent = craftComponent(
      'queryParent',
      { providers: [provideQueryParentView()] },
      function* () {
        yield* QueryParentView();
        return div([child()]);
      },
    );
    await expect(renderCraftComponent(parent)).resolves.toBeDefined();
  });

  it('does not recreate a composed query component when its resource settles', async () => {
    const { ComposedQueryView, provideComposedQueryView } = craftService(
      { name: 'composedQueryView', providedIn: 'toProvide' },
      function* () {
        factoryRuns += 1;
        const refresh = signal(0);
        // Keep the unused local query from the full-demo shape in the repro.
        yield* query('localTodos', {
          params: () => true,
          loader: async () => [],
        });
        const todos = yield* query('todos', {
          params: refresh,
          loader: async ({ params }) =>
            params === 0 ? [] : craftException({ _tag: 'FAILED_TO_LOAD' }),
        });
        const add = yield* mutation('add', {
          method: (title: string) => title,
          loader: async () => {
            refresh.update((value) => value + 1);
            return 'added';
          },
        });
        return { todos, add };
      },
    );

    let factoryRuns = 0;
    const component = craftComponent(
      'composedQuery',
      { providers: [provideComposedQueryView()] },
      function* () {
        const { todos, add } = yield* ComposedQueryView();
        return section([
          p('source'),
          p(function* () {
            return yield* todos.status();
          }),
          button({ click: () => add.mutate('new todo') }, 'Add'),
        ]);
      },
    ).pipe(
      catchNode.exhaustive({
        FAILED_TO_LOAD: {
          render: () => p('failed'),
          showSource: true,
          position: 'after',
        },
      }),
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    element.querySelector('button')?.click();
    await vi.waitFor(() => expect(element.textContent).toContain('failed'));
    await flush();

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(element.textContent).toContain('source');
    expect(factoryRuns).toBeLessThanOrEqual(2);
    destroy();
  });

  it('drives generator DOM callbacks and branded Craft methods', async () => {
    const { YieldableCounterView, provideYieldableCounterView } = craftService(
      { name: 'yieldableCounterView', providedIn: 'toProvide' },
      () => ({
        count,
        increment: craftMethod('increment', function* () {
          count.update((value) => value + 1);
        }),
      }),
    );

    const count = signal(0);
    const counter = craftComponent(
      'yieldableCounter',
      { providers: [provideYieldableCounterView()] },
      function* () {
        const { count, increment } = yield* YieldableCounterView();
        return div([
          p(() => String(count())),
          button(
            {
              *click() {
increment();
              },
            },
            '+',
          ),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(counter);
    element.querySelector('button')?.click();
    await flush();

    expect(element.querySelector('p')?.textContent).toBe('1');
    destroy();
  });

  it('drives generator callbacks assigned to primitive DOM properties', async () => {
    const { YieldablePropertyView, provideYieldablePropertyView } =
      craftService(
        { name: 'yieldablePropertyView', providedIn: 'toProvide' },
        () => ({
          disabled: craftMethod('disabled', function* () {
            return true;
          }),
        }),
      );

    const component = craftComponent(
      'yieldableProperty',
      { providers: [provideYieldablePropertyView()] },
      function* () {
        const { disabled } = yield* YieldablePropertyView();
        return button(
          {
            *disabled() {
              return disabled();
            },
          },
          '+',
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    expect(element.querySelector('button')?.hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      (element.querySelector('button') as HTMLButtonElement).disabled,
    ).toBe(true);
    destroy();
  });

  it('keeps branded methods callable from ordinary template callbacks', async () => {
    const { OrdinaryBrandedCallbackView, provideOrdinaryBrandedCallbackView } =
      craftService(
        { name: 'ordinaryBrandedCallbackView', providedIn: 'toProvide' },
        () => ({
          increment: craftMethod('increment', function* () {
            count.update((value) => value + 1);
          }),
        }),
      );

    const count = signal(0);
    const component = craftComponent(
      'ordinaryBrandedCallback',
      { providers: [provideOrdinaryBrandedCallbackView()] },
      function* () {
        const { increment } = yield* OrdinaryBrandedCallbackView();
        return button({ click: () => void increment() }, String(count()));
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);
    element.querySelector('button')?.click();
    await flush();

    expect(element.querySelector('button')?.textContent).toBe('1');
    destroy();
  });

  it('projects craftComputed state insertions as yieldable template properties', async () => {
    const {
      YieldableComputedPropertyView,
      provideYieldableComputedPropertyView,
    } = craftService(
      { name: 'yieldableComputedPropertyView', providedIn: 'toProvide' },
      function* () {
        const counter = yield* state('counter', 0, ({ state }) => ({
          disabled: craftComputed('disabled', function* () {
            return (yield* state()) % 2 === 0;
          }),
        }));
        return { counter };
      },
    );

    const component = craftComponent(
      'yieldableComputedProperty',
      { providers: [provideYieldableComputedPropertyView()] },
      function* () {
        const { counter } = yield* YieldableComputedPropertyView();
        return button(
          {
            *disabled() {
              return yield* counter.disabled();
            },
          },
          '+',
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    expect(
      (element.querySelector('button') as HTMLButtonElement).disabled,
    ).toBe(true);
    destroy();
  });

  it('renders root and derived reactive readers across template blocks', async () => {
    const {
      YieldableReactiveTemplateView,
      provideYieldableReactiveTemplateView,
    } = craftService(
      { name: 'yieldableReactiveTemplateView', providedIn: 'toProvide' },
      function* () {
        const counter = yield* state('counter', 1, ({ state, set }) => ({
          doubled: craftComputed(function* () {
            return (yield* state()) * 2;
          }),
          items: craftComputed(function* () {
            return Array.from({ length: yield* state() }, (_, index) => index);
          }),
          increment: function* () {
            set((yield* state()) + 1);
          },
        }));
        return { counter };
      },
    );

    const component = craftComponent(
      'yieldableReactiveTemplate',
      { providers: [provideYieldableReactiveTemplateView()] },
      function* () {
        const { counter } = yield* YieldableReactiveTemplateView();
        return section([
          span({ class: 'value' }, function* () {
            return yield* counter.doubled();
          }),
          ifNode(counter.doubled, () => p({ class: 'visible' }, 'visible')),
          forNode(counter.items, { track: (item) => item }, (item) =>
            li(String(item)),
          ),
          button(
            {
              click: function* () {
                yield* counter.increment();
              },
            },
            '+',
          ),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    await flush();
    expect(element.querySelector('.value')?.textContent).toBe('2');
    expect(element.querySelector('.visible')).not.toBeNull();
    expect(element.querySelectorAll('li')).toHaveLength(1);

    element.querySelector('button')?.click();
    await flush();
    expect(element.querySelector('.value')?.textContent).toBe('4');
    expect(element.querySelectorAll('li')).toHaveLength(2);
    destroy();
  });

  it('allows a state insertion named select in a generator DOM callback', async () => {
    const {
      YieldableStateSelectMethodView,
      provideYieldableStateSelectMethodView,
    } = craftService(
      { name: 'yieldableStateSelectMethodView', providedIn: 'toProvide' },
      function* () {
        const scenario = yield* state('scenario', 'initial', ({ set }) => ({
          select: (value: string) => set(value),
        }));
        return { scenario };
      },
    );

    const component = craftComponent(
      'yieldableStateSelectMethod',
      { providers: [provideYieldableStateSelectMethodView()] },
      function* () {
        const { scenario } = yield* YieldableStateSelectMethodView();
        return section([
          p(function* () {
            return yield* scenario();
          }),
          button(
            {
              *click() {
                yield* scenario.select('selected');
              },
            },
            'select',
          ),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    expect(element.querySelector('p')?.textContent).toBe('initial');

    element.querySelector('button')?.click();
    await flush();

    expect(element.querySelector('p')?.textContent).toBe('selected');
    destroy();
  });

  it('renders named conditional elements and updates their visibility', async () => {
    const { NamedConditionalView, provideNamedConditionalView } = craftService(
      { name: 'namedConditionalView', providedIn: 'toProvide' },
      function* () {
        return {
          enabled: craftComputed('enabled', () => true),
        };
      },
    );

    const component = craftComponent(
      'namedConditional',
      { providers: [provideNamedConditionalView()] },
      function* () {
        const { enabled } = yield* NamedConditionalView();
        return ifNode(
          enabled,
          () =>
            button(
              'increment',
              {
                click: function* () {
                  return;
                },
              },
              '+',
            ),
          () => p('hidden'),
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    expect(
      element.querySelector('[data-craft-name="increment"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-craft-name="increment"]')?.tagName,
    ).toBe('BUTTON');
    destroy();
  });

  it('projects cyclic arrays in the template context without overflowing the stack', async () => {
    const items: unknown[] = [];
    items.push(items);
    const { CyclicTemplateContextView, provideCyclicTemplateContextView } =
      craftService(
        { name: 'cyclicTemplateContextView', providedIn: 'toProvide' },
        () => ({ items }),
      );

    const component = craftComponent(
      'cyclicTemplateContext',
      { providers: [provideCyclicTemplateContextView()] },
      function* () {
        yield* CyclicTemplateContextView();
        return p('ready');
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    expect(element.textContent).toContain('ready');
    destroy();
  });

  it('marks component roots without leaking the marker into descendants', async () => {
    const { ScopedChildView, provideScopedChildView } = craftService(
      { name: 'scopedChildView', providedIn: 'toProvide' },
      () => ({}),
    );

    const scopedChild = craftComponent(
      'scopedChild',
      {
        providers: [provideScopedChildView()],
        styles: '.child { color: red; }',
      },
      function* () {
        yield* ScopedChildView();
        return div({ class: 'child' }, [
          span({ class: 'child-inner' }, 'child'),
        ]);
      },
    );
    const { ScopedParentView, provideScopedParentView } = craftService(
      { name: 'scopedParentView', providedIn: 'toProvide' },
      () => ({}),
    );

    const scopedParent = craftComponent(
      'scopedParent',
      {
        providers: [provideScopedParentView()],
        styles: '.parent { color: blue; }',
      },
      function* () {
        yield* ScopedParentView();
        return div({ class: 'parent' }, [scopedChild()]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(scopedParent);

    const parent = element.querySelector('.parent')!;
    const child = element.querySelector('.child')!;
    expect(parent.getAttribute('data-craft-root')).toBe('scopedParent');
    expect(child.getAttribute('data-craft-root')).toBe('scopedChild');
    expect(
      element.querySelector('.child-inner')?.hasAttribute('data-craft-root'),
    ).toBe(false);
    expect(document.querySelectorAll('style[data-craft-sheet]')).toHaveLength(
      2,
    );

    destroy();
    expect(document.querySelectorAll('style[data-craft-sheet]')).toHaveLength(
      0,
    );
  });

  it('registers stylesUrl content in the component style scope', async () => {
    const { StylesUrlView, provideStylesUrlView } = craftService(
      { name: 'stylesUrlView', providedIn: 'toProvide' },
      () => ({}),
    );

    const component = craftComponent(
      'stylesUrlComponent',
      {
        providers: [provideStylesUrlView()],
        stylesUrl: '.external { color: red; }',
      },
      function* () {
        yield* StylesUrlView();
        return div({ class: 'external' }, 'external');
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    expect(
      document.querySelector<HTMLStyleElement>('style[data-craft-sheet]')
        ?.textContent,
    ).toContain('.external { color: red; }');

    destroy();
  });

  it('patches Input accessors without recreating the component', async () => {
    const value = signal('first');
    const valueReader = markYieldableValue(function* () {
      return value();
    }, 'inputText');
    const { LabelView, provideLabelView } = craftService(
      { name: 'labelView', providedIn: 'toProvide' },
      (inputs: { readonly text: Input<string> }) => {
        const { text } = inputs;

        factoryRuns += 1;
        return { text };
      },
    );

    let factoryRuns = 0;
    const label = craftComponent(
      'label',
      { providers: [provideLabelView()] },
      function* (inputs: { readonly text: Input<string> }) {
        const { text } = yield* LabelView(inputs);
        return p(function* () {
          return yield* text();
        });
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(label, {
      props: {
        text: valueReader,
      },
    });
    const paragraph = element.querySelector('p');

    value.set('second');
    await flush();

    expect(element.textContent).toBe('second');
    expect(element.querySelector('p')).toBe(paragraph);
    expect(factoryRuns).toBe(1);
    destroy();
  });

  it('passes reactive Input shells to an object-shaped template', async () => {
    let templateRuns = 0;
    const categoryPage = craftComponent(
      'objectInputCategoryPage',
      {},
      function* ({ categorySlug }: { categorySlug: Input<string> }) {
        templateRuns += 1;
        return p(function* () {
          return yield* categorySlug();
        });
      },
    );
    const {
      nativeElement: element,
      mounted,
      flush,
      destroy,
    } = await renderCraftComponent(categoryPage, {
      // Route props are raw at the router boundary; the renderer must wrap them.
      props: { categorySlug: 'books' } as never,
    });

    expect(element.textContent).toBe('books');
    mounted.updateProps({ categorySlug: 'games' } as never);
    await flush();

    expect(element.textContent).toBe('games');
    // The prop changed, so the template ran again — the reactive shell is what
    // kept the rendered text in step with it.
    expect(templateRuns).toBe(2);
    destroy();
  });

  it('merges host classes supplied at a component call site', async () => {
    const { EditableStatusView, provideEditableStatusView } = craftService(
      { name: 'editableStatusView', providedIn: 'toProvide' },
      (inputs: { readonly status: Input<string> }) => {
        const { status } = inputs;
        return { status };
      },
    );

    const editableStatusComponent = craftComponent(
      'editableStatusComponent',
      {
        providers: [provideEditableStatusView()],
        host: { class: 'status-base' },
      },
      function* (inputs: { readonly status: Input<string> }) {
        const { status } = yield* EditableStatusView(inputs);
        return span(function* () {
          return yield* status();
        });
      },
    );
    const { DirectivePageView, provideDirectivePageView } = craftService(
      { name: 'directivePageView', providedIn: 'toProvide' },
      () => ({}),
    );

    const directivePage = craftComponent(
      'directivePage',
      { providers: [provideDirectivePageView()] },
      function* () {
        yield* DirectivePageView();
        return h2([
          'Full craftService demo ',
          editableStatusComponent({
            status: function* () {
              return 'ready';
            },
            class: 'newClassAdded',
          }),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(directivePage);

    expect(element.querySelector('span')?.className).toBe(
      'status-base newClassAdded',
    );
    destroy();
  });

  it('merges reactive host classes supplied by a craft directive', async () => {
    const canEdit = signal(true);
    const onlyEditable = craftDirective(
      'onlyEditable',
      {},
      {
        template: (baseTemplate) =>
          function* () {
            return withHostProps(yield* baseTemplate(), {
              class: () => (canEdit() ? 'visible' : 'hidden'),
            });
          },
      },
    );
    const { ReactiveStatusView, provideReactiveStatusView } = craftService(
      { name: 'reactiveStatusView', providedIn: 'toProvide' },
      () => ({ permissions: { canEdit: () => canEdit() } }),
    );

    const reactiveStatusComponent = craftComponent(
      'reactiveStatusComponent',
      {
        providers: [provideReactiveStatusView()],
        host: { class: 'status-base' },
      },
      function* () {
        yield* ReactiveStatusView();
        return span('ready');
      },
    ).pipe(onlyEditable);
    const { ReactiveDirectivePageView, provideReactiveDirectivePageView } =
      craftService(
        { name: 'reactiveDirectivePageView', providedIn: 'toProvide' },
        () => ({}),
      );

    const reactiveDirectivePage = craftComponent(
      'reactiveDirectivePage',
      { providers: [provideReactiveDirectivePageView()] },
      function* () {
        yield* ReactiveDirectivePageView();
        return reactiveStatusComponent({ class: 'caller-class' });
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(reactiveDirectivePage);
    expect(element.querySelector('span')?.className).toBe(
      'status-base visible caller-class',
    );

    canEdit.set(false);
    await flush();
    expect(element.querySelector('span')?.className).toBe(
      'status-base hidden caller-class',
    );
    destroy();
  });

  it('composes a configurable directive around the component logic and template', async () => {
    const allowed = signal(true);
    const guard = craftDirective(
      'guard',
      {},
      {
        template:
          (baseTemplate) =>
          function* (inputs: { readonly user: Input<string> }) {
            return allowed() ? yield* baseTemplate(inputs) : [];
          },
      },
    );
    const { GuardedView, provideGuardedView } = craftService(
      { name: 'guardedView', providedIn: 'toProvide' },
      (inputs: { readonly user: Input<string> }) => {
        const { user } = inputs;
        return { user };
      },
    );

    const guarded = craftComponent(
      'guarded',
      { providers: [provideGuardedView()] },
      function* (inputs: { readonly user: Input<string> }) {
        const { user } = yield* GuardedView(inputs);
        return p(function* () {
          return yield* user();
        });
      },
    ).pipe(guard);
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(guarded, {
      props: {
        user: function* () {
          return 'visible';
        },
      },
    });

    expect(element.textContent).toBe('visible');
    allowed.set(false);
    await flush();
    expect(element.textContent).toBe('');

    destroy();
  });

  it('lets a directive restrict a service member without touching the props', async () => {
    const granted = signal(false);
    const { CardView, provideCardView } = craftService(
      { name: 'cardView', providedIn: 'toProvide' },
      (inputs: { readonly user: Input<string> }) => {
        const { user } = inputs;
        return { user, label: 'editable' };
      },
    );

    const withPermission = craftDirective(
      'withPermission',
      {},
      {
        service: overrideService(CardView, (base) => ({
          ...base,
          label: granted() ? base.label : 'read-only',
        })),
      },
    );

    const card = craftComponent(
      'card',
      { providers: [provideCardView()] },
      function* (inputs: { readonly user: Input<string> }) {
        const { label } = yield* CardView(inputs);
        return p(label);
      },
    ).pipe(withPermission);
    const {
      nativeElement: element,
      destroy,
    } = await renderCraftComponent(card, {
      props: {
        user: function* () {
          return 'Ada';
        },
      },
    });

    expect(element.textContent).toBe('read-only');
    destroy();
  });

  it('applies a structural directive piped directly on a hyperscript node', async () => {
    const visible = signal(true);
    const when = craftDirective(
      'when',
      {},
      {
        template: (baseTemplate) =>
          function* () {
            return visible() ? yield* baseTemplate() : [];
          },
      },
    );
    const { PanelView, providePanelView } = craftService(
      { name: 'panelView', providedIn: 'toProvide' },
      (inputs: { readonly visible: Input<boolean> }) => {
        const { visible } = inputs;
        return { visible };
      },
    );

    const panel = craftComponent(
      'panel',
      { providers: [providePanelView()] },
      function* (inputs: { readonly visible: Input<boolean> }) {
        yield* PanelView(inputs);
        return p('conditional').pipe(when);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(panel, {
      props: {
        visible: function* () {
          return visible();
        },
      },
    });

    expect(element.textContent).toBe('conditional');
    visible.set(false);
    await flush();
    expect(element.textContent).toBe('');

    destroy();
  });

  it('mounts a Craft node directive with an isolated injector and destroys it with its element', async () => {
    const label = signal('first');
    const showSecond = signal(true);
    const mountedElements: Element[] = [];
    const returnedCleanups = vi.fn();
    const destroyRefCleanups = vi.fn();
    const marker = craftNodeDirective<{ marker: string }>(
      'marker',
      ['marker'],
      (context) => {
        mountedElements.push(context.element);
        expect(inject(ElementRef).nativeElement).toBe(context.element);
        // Craft directives render through `context.renderer` (the DOM adapter);
        // there is no Angular Renderer2 anywhere on this path any more.
        inject(DestroyRef).onDestroy(destroyRefCleanups);
        context.injector.get(CRAFT_NODE_EFFECT_FACTORY)('marker', () => {
          context.renderer.setAttribute(
            context.element,
            'data-marker',
            context.props.marker,
          );
        });
        return returnedCleanups;
      },
    );
    const { NodeDirectiveLifecycleView, provideNodeDirectiveLifecycleView } =
      craftService(
        { name: 'nodeDirectiveLifecycleView', providedIn: 'toProvide' },
        () => ({}),
      );

    const component = craftComponent(
      'nodeDirectiveLifecycle',
      { providers: [provideNodeDirectiveLifecycleView()] },
      function* () {
        yield* NodeDirectiveLifecycleView();
        return div([
          span({ marker: label() }, 'one').pipe(marker),
          ...(showSecond()
            ? [span({ marker: `second-${label()}` }, 'two').pipe(marker)]
            : []),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    const spans = Array.from(element.querySelectorAll('span'));
    expect(mountedElements).toEqual(spans);
    expect(spans.map((node) => node.getAttribute('data-marker'))).toEqual([
      'first',
      'second-first',
    ]);

    label.set('updated');
    await flush();
    expect(mountedElements).toHaveLength(2);
    expect(
      Array.from(element.querySelectorAll('span')).map((node) =>
        node.getAttribute('data-marker'),
      ),
    ).toEqual(['updated', 'second-updated']);

    showSecond.set(false);
    await flush();
    expect(returnedCleanups).toHaveBeenCalledTimes(1);
    expect(destroyRefCleanups).toHaveBeenCalledTimes(1);

    destroy();
    expect(returnedCleanups).toHaveBeenCalledTimes(2);
    expect(destroyRefCleanups).toHaveBeenCalledTimes(2);
  });

  it('recovers an ifNode after its true branch throws', async () => {
    const {
      IfNodeRecoversAfterThrowView,
      provideIfNodeRecoversAfterThrowView,
    } = craftService(
      { name: 'ifNodeRecoversAfterThrowView', providedIn: 'toProvide' },
      function* () {
        const navOpen = yield* state('navOpen', false, ({ set, update }) => ({
          toggle: () => update((open) => !open),
          close: () => set(false),
        }));
        return { navOpen, toggleNav: navOpen.toggle };
      },
    );

    const explode = signal(true);
    const component = craftComponent(
      'ifNodeRecoversAfterThrow',
      { providers: [provideIfNodeRecoversAfterThrowView()] },
      function* () {
        const { navOpen, toggleNav } = yield* IfNodeRecoversAfterThrowView();
        return div([
          button(
            {
              class: 'toggle',
              click: function* (event: MouseEvent) {
                event.stopPropagation();
                yield* toggleNav();
              },
            },
            'toggle',
          ),
          ifNode(
            navOpen,
            () => {
              if (explode()) {
                throw new Error('panel boom');
              }
              return div({ class: 'panel' }, 'ok');
            },
            () => [],
          ),
        ]);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(component);

    const toggle = async () => {
      element.querySelector<HTMLButtonElement>('.toggle')?.click();
      await flush();
    };

    // The write is applied synchronously, so the branch throws inside the click
    // listener rather than during the later flush: the error surfaces on the
    // window instead of rejecting `flush()` as it did on the Angular scheduler.
    const listenerErrors: unknown[] = [];
    const captureError = (event: ErrorEvent) => {
      listenerErrors.push(event.error ?? event.message);
      event.preventDefault();
    };
    window.addEventListener('error', captureError);
    try {
      await toggle();
    } finally {
      window.removeEventListener('error', captureError);
    }

    expect(listenerErrors).toHaveLength(1);
    expect(String(listenerErrors[0])).toMatch(/panel boom/);
    expect(element.querySelector('.panel')).toBeNull();

    explode.set(false);
    await flush();
    await toggle();
    await toggle();
    expect(element.querySelector('.panel')).not.toBeNull();

    destroy();
  });

  it('resolves yield* craftService dependencies in the child injector', async () => {
    const PREFIX = new InjectionToken<string>('component-prefix');
    const { Greeting } = craftService(
      { name: 'Greeting', providedIn: 'function' },
      () => ({ prefix: inject(PREFIX) }),
    );

    const { GreetingView, provideGreetingView } = craftService(
      { name: 'greetingView', providedIn: 'toProvide' },
      function* (inputs: { readonly name: Input<string> }) {
        const { name } = inputs;

        const service = yield* Greeting();
        return { name, service };
      },
    );

    const greeting = craftComponent(
      'greeting',
      {
        providers: [
          provideGreetingView(),
          { provide: PREFIX, useValue: 'Bonjour' },
        ],
      },
      function* (inputs: { readonly name: Input<string> }) {
        const { name, service } = yield* GreetingView(inputs);
        return p(function* () {
          return `${service.prefix} ${yield* name()}`;
        });
      },
    );

    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(greeting, {
      props: {
        name: function* () {
          return 'Ada';
        },
      },
    });

    expect(element.textContent).toBe('Bonjour Ada');
  });

  it('preserves an intermediate parent injector for nested Craft components', async () => {
    const { InjectorRoutedView, provideInjectorRoutedView } = craftService(
      { name: 'injectorRoutedView', providedIn: 'toProvide' },
      () => ({ routeMarker: inject(routeMarker) }),
    );

    const routeMarker = new InjectionToken<string>('route-marker');
    const injectorRouted = craftComponent(
      'injectorRouted',
      { providers: [provideInjectorRoutedView()] },
      function* () {
        const { routeMarker } = yield* InjectorRoutedView();
        return p(routeMarker);
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(injectorRouted, {
      providers: [{ provide: routeMarker, useValue: 'nested route' }],
    });

    expect(element.textContent).toBe('nested route');
  });

  it('mounts selectorless children by lexical component reference', async () => {
    const { UserCardView, provideUserCardView } = craftService(
      { name: 'userCardView', providedIn: 'toProvide' },
      (inputs: {
        readonly name: Input<string>;
        readonly onPick: Output<(name: string) => void>;
      }) => {
        const { name, onPick } = inputs;
        return {
          name,
          onPick,
        };
      },
    );

    const picked = vi.fn();
    const userCard = craftComponent(
      'userCard',
      { providers: [provideUserCardView()] },
      function* (inputs: {
        readonly name: Input<string>;
        readonly onPick: Output<(name: string) => void>;
      }) {
        const { name, onPick } = yield* UserCardView(inputs);
        return button(
          {
            *click() {
onPick(yield* name());
            },
          },
          function* () {
            return yield* name();
          },
        );
      },
    );
    const { ParentView, provideParentView } = craftService(
      { name: 'parentView', providedIn: 'toProvide' },
      () => ({ picked }),
    );

    const parent = craftComponent(
      'parent',
      { providers: [provideParentView()] },
      function* () {
        const { picked } = yield* ParentView();
        return div([
          span('Parent'),
          userCard({
            name: function* () {
              return 'Grace';
            },
            onPick: picked,
          }),
        ]);
      },
    );

    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(parent);
    element.querySelector('button')?.click();

    expect(element.textContent).toBe('ParentGrace');
    expect(picked).toHaveBeenCalledWith('Grace');
  });

  it('reconciles forNode() blocks by key and renders the empty block', async () => {
    const users = signal([
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ]);
    const { ListView, provideListView } = craftService(
      { name: 'listView', providedIn: 'toProvide' },
      () => ({ users }),
    );

    const list = craftComponent(
      'list',
      { providers: [provideListView()] },
      function* () {
        const { users } = yield* ListView();
        return div(
          forNode(
            users,
            {
              track: (user) => user.id,
              empty: () => p({ class: 'empty' }, 'Nobody'),
            },
            (user) =>
              p(
                {
                  'data-id': function* () {
                    return (yield* user()).id;
                  },
                },
                function* () {
                  return (yield* user()).name;
                },
              ),
          ),
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(list);
    const ada = element.querySelector('[data-id="1"]');
    const grace = element.querySelector('[data-id="2"]');

    users.set([
      { id: 2, name: 'Grace Hopper' },
      { id: 1, name: 'Ada Lovelace' },
      { id: 3, name: 'Linus' },
    ]);
    await flush();

    const rows = Array.from(element.querySelectorAll('[data-id]'));
    expect(rows.map((row) => row.getAttribute('data-id'))).toEqual([
      '2',
      '1',
      '3',
    ]);
    expect(rows[0]).toBe(grace);
    expect(rows[1]).toBe(ada);
    expect(rows[0].textContent).toBe('Grace Hopper');

    users.set([]);
    await flush();
    expect(element.querySelector('.empty')?.textContent).toBe('Nobody');
  });

  it('renders a scheduled each block progressively and keeps keyed DOM identity', async () => {
    const values = signal([1, 2, 3]);
    const { ScheduledlistView, provideScheduledlistView } = craftService(
      { name: 'scheduledlistView', providedIn: 'toProvide' },
      () => ({ values }),
    );

    const scheduler = new VirtualForScheduler();
    const list = craftComponent(
      'scheduled-list',
      { providers: [provideScheduledlistView()] },
      function* () {
        const { values } = yield* ScheduledlistView();
        return div(
          forNode(values, { track: (value) => value }, (value) =>
            button(
              {
                'data-value': function* () {
                  return yield* value();
                },
              },
              function* () {
                return String(yield* value());
              },
            ),
          ).pipe(scheduleFor({ enabled: true, strategy: 'frame' })),
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(list, {
      providers: [{ provide: FOR_SCHEDULER, useValue: scheduler }],
    });

    expect(element.querySelectorAll('[data-value]')).toHaveLength(0);
    scheduler.flush(1);
    await flush();
    expect(element.querySelectorAll('[data-value]')).toHaveLength(1);

    scheduler.flush();
    await flush();
    const first = element.querySelector('[data-value="1"]');
    expect(element.textContent).toBe('123');

    values.set([3, 1, 4]);
    await flush();
    scheduler.flush();
    await flush();

    const rows = Array.from(element.querySelectorAll('[data-value]'));
    expect(rows.map((row) => row.getAttribute('data-value'))).toEqual([
      '3',
      '1',
      '4',
    ]);
    expect(element.querySelector('[data-value="1"]')).toBe(first);
    destroy();
  });

  it('deepifies forNode items when the collection uses insertDeepYieldable', async () => {
    const { DeepYieldableForItemsView, provideDeepYieldableForItemsView } =
      craftService(
        { name: 'deepYieldableForItemsView', providedIn: 'toProvide' },
        function* () {
          const catalog = yield* state(
            'catalog',
            {
              products: [
                { id: 1, category: 'fruit', name: 'Apple' },
                { id: 2, category: 'grain', name: 'Oat' },
              ],
            },
            insertDeepYieldable('products'),
          );
          return { catalog };
        },
      );

    const component = craftComponent(
      'deepYieldableForItems',
      { providers: [provideDeepYieldableForItemsView()] },
      function* () {
        const { catalog } = yield* DeepYieldableForItemsView();
        return ul(
          forNode(
            catalog.deepYieldableProducts,
            { track: (product) => product.id },
            (product) => li([span(product.category), span(product.name)]),
          ),
        );
      },
    );
    const { nativeElement: element, destroy } =
      await renderCraftComponent(component);

    expect(element.textContent).toBe('fruitApplegrainOat');
    destroy();
  });

  it('keeps scheduleFor synchronous when disabled', async () => {
    const { DisabledscheduledlistView, provideDisabledscheduledlistView } =
      craftService(
        { name: 'disabledscheduledlistView', providedIn: 'toProvide' },
        () => ({}),
      );

    const list = craftComponent(
      'disabled-scheduled-list',
      { providers: [provideDisabledscheduledlistView()] },
      function* () {
        yield* DisabledscheduledlistView();
        return div(
          forNode([1, 2, 3], { track: (value) => value }, (value) =>
            p(function* () {
              return String(yield* value());
            }),
          ).pipe(scheduleFor({ enabled: false, strategy: 'frame' })),
        );
      },
    );
    const { nativeElement: element, destroy } =
      await renderCraftComponent(list);

    expect(element.querySelectorAll('p')).toHaveLength(3);
    destroy();
  });

  it('cancels obsolete scheduled work when the collection changes or the node is destroyed', async () => {
    const values = signal([1, 2, 3]);
    const { CancelledscheduledlistView, provideCancelledscheduledlistView } =
      craftService(
        { name: 'cancelledscheduledlistView', providedIn: 'toProvide' },
        () => ({ values }),
      );

    const scheduler = new VirtualForScheduler();
    const list = craftComponent(
      'cancelled-scheduled-list',
      { providers: [provideCancelledscheduledlistView()] },
      function* () {
        const { values } = yield* CancelledscheduledlistView();
        return div(
          forNode(values, { track: (value) => value }, (value) =>
            p(
              {
                'data-value': function* () {
                  return yield* value();
                },
              },
              function* () {
                return String(yield* value());
              },
            ),
          ).pipe(scheduleFor({ strategy: 'frame' })),
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(list, {
      providers: [{ provide: FOR_SCHEDULER, useValue: scheduler }],
    });

    expect(scheduler.pendingCount).toBe(3);
    values.set([4]);
    await flush();
    expect(scheduler.pendingCount).toBe(1);
    scheduler.flush();
    await flush();
    expect(element.textContent).toBe('4');

    values.set([5, 6, 7]);
    await flush();
    expect(scheduler.pendingCount).toBe(3);
    destroy();
    scheduler.flush();
    expect(scheduler.pendingCount).toBe(0);
  });

  it('treats nullish each sources as empty collections', async () => {
    const users = signal<
      readonly { id: number; name: string }[] | null | undefined
    >(null);
    const { NullablelistView, provideNullablelistView } = craftService(
      { name: 'nullablelistView', providedIn: 'toProvide' },
      () => ({ users }),
    );

    const list = craftComponent(
      'nullable-list',
      { providers: [provideNullablelistView()] },
      function* () {
        const { users } = yield* NullablelistView();
        return div(
          forNode(
            () => users(),
            {
              track: (user) => user.id,
              empty: () => p({ class: 'empty' }, 'Nobody'),
            },
            (user) =>
              p(
                {
                  'data-id': function* () {
                    return (yield* user()).id;
                  },
                },
                function* () {
                  return (yield* user()).name;
                },
              ),
          ),
        );
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(list);

    expect(element.querySelector('.empty')?.textContent).toBe('Nobody');

    users.set([{ id: 1, name: 'Ada' }]);
    await flush();
    expect(element.querySelector('[data-id="1"]')?.textContent).toBe('Ada');

    users.set(null);
    await flush();
    expect(element.querySelector('[data-id="1"]')).toBeNull();
    expect(element.querySelector('.empty')?.textContent).toBe('Nobody');

    users.set(undefined);
    await flush();
    expect(element.querySelector('.empty')?.textContent).toBe('Nobody');
  });

  it('renders defer loading, success and CRAFT_LAZY_LOAD_ERROR branches', async () => {
    let resolveModule!: (value: string) => void;
    const loaded = new Promise<string>((resolve) => {
      resolveModule = resolve;
    });
    const { SuccessView, provideSuccessView } = craftService(
      { name: 'successView', providedIn: 'toProvide' },
      () => ({}),
    );

    const success = craftComponent(
      'success',
      { providers: [provideSuccessView()] },
      function* () {
        yield* SuccessView();
        return deferNode(() => loaded, {
          trigger: 'immediate',
          resolve: (value) => p({ class: 'loaded' }, value),
          placeholder: () => p('Placeholder'),
          loading: () => p({ class: 'loading' }, 'Loading'),
        });
      },
    );
    const {
      nativeElement: successHost,
      flush: flushSuccess,
      destroy: destroySuccess,
    } = await renderCraftComponent(success);
    expect(successHost.querySelector('.loading')?.textContent).toBe('Loading');

    resolveModule('Ready');
    await vi.waitFor(() => {
      expect(successHost.querySelector('.loaded')?.textContent).toBe('Ready');
    });

    const { FailureView, provideFailureView } = craftService(
      { name: 'failureView', providedIn: 'toProvide' },
      () => ({}),
    );

    const failure = craftComponent(
      'failure',
      { providers: [provideFailureView()] },
      function* () {
        yield* FailureView();
        return deferNode(() => Promise.reject(new Error('boom')), {
          trigger: 'immediate',
          resolve: () => p('unreachable'),
          error: (error) =>
            p(
              { class: 'error' },
              (error as { _tag?: string })._tag ?? 'unknown',
            ),
        });
      },
    );
    const { nativeElement: failureHost, destroy: destroyFailure } =
      await renderCraftComponent(failure);

    await vi.waitFor(() => {
      expect(failureHost.querySelector('.error')?.textContent).toBe(
        'CRAFT_LAZY_LOAD_ERROR',
      );
    });
    destroySuccess();
    destroyFailure();
  });

  it('passes withRetry to defer loaders and retries a failed lazy import', async () => {
    const { DeferRetryView, provideDeferRetryView } = craftService(
      { name: 'deferRetryView', providedIn: 'toProvide' },
      () => ({}),
    );

    let calls = 0;
    const component = craftComponent(
      'deferRetry',
      { providers: [provideDeferRetryView()] },
      function* () {
        yield* DeferRetryView();
        return deferNode(
          ({ withRetry }) =>
            withRetry(
              calls++ === 0
                ? Promise.reject(new Error('offline'))
                : Promise.resolve('Recovered'),
            ),
          {
            trigger: 'immediate',
            resolve: (value) => p({ class: 'loaded' }, value),
          },
        );
      },
    );
    const { nativeElement: element, destroy } = await renderCraftComponent(
      component,
      {
        providers: [provideCraftLazyLoadRetry({ attempts: 1, delayMs: 0 })],
      },
    );

    await vi.waitFor(() => {
      expect(element.querySelector('.loaded')?.textContent).toBe('Recovered');
    });
    expect(calls).toBe(2);
  });

  it('keeps a defer placeholder until its interaction trigger fires', async () => {
    const { InteractionView, provideInteractionView } = craftService(
      { name: 'interactionView', providedIn: 'toProvide' },
      () => ({}),
    );

    const interaction = craftComponent(
      'interaction',
      { providers: [provideInteractionView()] },
      function* () {
        yield* InteractionView();
        return deferNode(() => Promise.resolve('Interacted'), {
          trigger: 'interaction',
          resolve: (value) => p({ class: 'interaction-loaded' }, value),
          placeholder: () => button({ class: 'interaction-trigger' }, 'Start'),
        });
      },
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(interaction);

    expect(element.querySelector('.interaction-trigger')?.textContent).toBe(
      'Start',
    );
    expect(element.querySelector('.interaction-loaded')).toBeNull();

    element.querySelector<HTMLButtonElement>('.interaction-trigger')?.click();
    await vi.waitFor(() => {
      expect(element.querySelector('.interaction-loaded')?.textContent).toBe(
        'Interacted',
      );
    });
  });

  it('runs DOM event hooks for an interaction defer trigger', async () => {
    const { TrackedInteractionView, provideTrackedInteractionView } =
      craftService(
        { name: 'trackedInteractionView', providedIn: 'toProvide' },
        () => ({}),
      );

    const interactions: CraftDomEvent[] = [];
    const interaction = craftComponent(
      'trackedInteraction',
      { providers: [provideTrackedInteractionView()] },
      function* () {
        yield* TrackedInteractionView();
        return deferNode(() => Promise.resolve('Interacted'), {
          trigger: 'interaction',
          resolve: (value) => p({ class: 'interaction-loaded' }, value),
          placeholder: () =>
            button('loadDeferred', { type: 'button' }, 'Start'),
        });
      },
    );
    const { nativeElement: element, destroy } = await renderCraftComponent(
      interaction,
      {
        providers: [
          provideCraftDomEventHook((event, next) => {
            interactions.push(event);
            return next();
          }),
        ],
      },
    );

    element.querySelector<HTMLButtonElement>('button')?.click();

    await vi.waitFor(() => {
      expect(element.querySelector('.interaction-loaded')?.textContent).toBe(
        'Interacted',
      );
    });
    expect(interactions).toHaveLength(1);
    expect(interactions[0]).toMatchObject({
      eventName: 'click',
      elementName: 'loadDeferred',
      componentName: 'trackedInteraction',
      interactionName: 'trackedInteraction:button:loadDeferred:click',
    });

    destroy();
  });

  it('keeps interaction defer idle on a DocumentFragment parent', async () => {
    const { DetachedInteractionView, provideDetachedInteractionView } =
      craftService(
        { name: 'detachedInteractionView', providedIn: 'toProvide' },
        () => ({}),
      );

    const loader = vi.fn(async () => 'Interacted');
    const interaction = craftComponent(
      'detachedInteraction',
      { providers: [provideDetachedInteractionView()] },
      function* () {
        yield* DetachedInteractionView();
        return deferNode(loader, {
          trigger: 'interaction',
          resolve: (value) => p({ class: 'detached-loaded' }, value),
        });
      },
    );
    const fragment = document.createDocumentFragment();
    const parent = createEnvironmentInjector(
      [{ provide: ɵINJECTOR_SCOPE, useValue: 'root' }],
      Injector.NULL as EnvironmentInjector,
      'interpreter-fragment-spec',
    );
    const mounted = mountInterpretedComponent(
      interaction as never,
      fragment as unknown as Element,
      parent,
      {},
    );
    const flush = async () => {
      for (let index = 0; index < 5; index += 1) {
        parent.get(ɵEffectScheduler).flush();
        await Promise.resolve();
      }
      parent.get(ɵEffectScheduler).flush();
    };
    await flush();
    await Promise.resolve();

    expect(loader).not.toHaveBeenCalled();
    fragment.dispatchEvent(new Event('click'));
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    await vi.waitFor(() => {
      expect(fragment.querySelector('.detached-loaded')?.textContent).toBe(
        'Interacted',
      );
    });
    mounted.destroy();
    parent.destroy();
  });
});

describe('binding isolation under the application provider set', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  // The narrow tests in `correlation-id-plugin.spec.ts` pin the correlation id
  // reads themselves. This one pins the property that actually matters, at the
  // layer the user sees: a binding must not re-run because of a signal it never
  // read — even with the real application wrappers installed.
  //
  // It is written against `provideCorrelationIdTracking()` because that is where
  // the defect was found: its FN_WRAPPER wraps EVERY craft factory, bindings
  // included, so one tracked read in it subscribed every binding in the app to a
  // signal the DOM event hook rewrites on every interaction. One click then
  // re-ran every binding on the page. Any future wrapper that reads reactively
  // in that path reintroduces the same class of bug, and fails here.
  it('does not re-run unrelated bindings when an interaction rotates the correlation id', async () => {
    const first = signal('A');
    const second = signal('B');
    const firstBinding = vi.fn(() => first());
    const secondBinding = vi.fn(() => second());
    const {
      CorrelationBindingIsolationView,
      provideCorrelationBindingIsolationView,
    } = craftService(
      { name: 'correlationBindingIsolationView', providedIn: 'toProvide' },
      () => ({}),
    );

    const constantBinding = vi.fn(() => 'constant');
    const component = craftComponent(
      'correlationBindingIsolation',
      { providers: [provideCorrelationBindingIsolationView()] },
      function* () {
        yield* CorrelationBindingIsolationView();
        return div([p(firstBinding), p(secondBinding), p(constantBinding)]);
      },
    );

    const { flush, destroy, injector } = await renderCraftComponent(component, {
      providers: [provideCorrelationIdTracking()] as never,
    });

    expect(firstBinding).toHaveBeenCalledTimes(1);
    expect(secondBinding).toHaveBeenCalledTimes(1);
    expect(constantBinding).toHaveBeenCalledTimes(1);

    // What every DOM interaction does through the craft dom event hook.
    injector.get(CORRELATION_ID_SERVICE)?.generateAndSet('click');
    await flush();

    expect(firstBinding).toHaveBeenCalledTimes(1);
    expect(secondBinding).toHaveBeenCalledTimes(1);
    expect(constantBinding).toHaveBeenCalledTimes(1);

    // A real dependency still propagates: isolation, not deafness.
    first.set('A2');
    await flush();

    expect(firstBinding).toHaveBeenCalledTimes(2);
    expect(secondBinding).toHaveBeenCalledTimes(1);
    expect(constantBinding).toHaveBeenCalledTimes(1);

    destroy();
  });
});
