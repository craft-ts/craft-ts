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
  mutation,
  markYieldableValue,
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
import { content, renderContent } from '../project';
import { defer } from '../defer';
import { each } from '../each';
import {
  EACH_SCHEDULER,
  scheduleEach,
  type EachScheduler,
} from '../each-scheduling';
import { ifBlock } from '../if-block';
import { catchBlock } from '../block';
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

class VirtualEachScheduler implements EachScheduler {
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
    const component = craftComponent(
      'granularTextBindings',
      {},
      () => ({}),
      template,
    );
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
    const component = craftComponent(
      'granularElementBindings',
      {},
      () => ({}),
      template,
    );
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
      () => ({}),
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
    const binding = vi.fn(() => value());
    const component = craftComponent(
      'coalescedBinding',
      {},
      () => ({}),
      () => p(binding),
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
    const template = vi.fn(() => ifBlock(condition, branch));
    const component = craftComponent(
      'granularConditional',
      {},
      () => ({}),
      template,
    );
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
    const condition = markYieldableValue(() => conditionValue(), 'visible');
    const component = craftComponent(
      'stableIfBranch',
      {},
      () => ({}),
      () => ifBlock(condition, () => p('stable')),
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
      ul(each(items, { track: (item) => item.id }, itemTemplate)),
    );
    const component = craftComponent(
      'granularEachBindings',
      {},
      () => ({}),
      template,
    );
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
    const component = craftComponent(
      'granularEachCollection',
      {},
      () => ({ items }),
      ({ items }) =>
        ul(each(items, { track: (item) => item.id }, itemTemplate)),
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
    const items = signal([first, second]);
    const component = craftComponent(
      'stableEachDom',
      {},
      () => ({ items }),
      ({ items }) =>
        ul(
          each(items, { track: (item) => item.id }, (item) =>
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
        ),
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
    const component = craftComponent(
      'granularEachTrace',
      {
        providers: [
          provideTemplateTrace((context, next) => {
            traces.push({ ...context });
            return next();
          }),
        ],
      },
      () => ({ items }),
      ({ items }) =>
        ul(
          each(items, { track: (item) => item.id }, (item) =>
            li(function* () {
              return (yield* item()).label;
            }),
          ),
        ),
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
        name: 'each',
        renderCount: 2,
      },
    ]);
    destroy();
  });

  it('renders static nodes, listeners, classes and reactive signal reads', async () => {
    const count = signal(0);
    const counter = craftComponent(
      'counter',
      { host: { 'data-kind': 'counter' } },
      () => ({ count }),
      ({ count }) =>
        div({ class: ['counter', 'active'] }, [
          p({ class: { value: true } }, `Count: ${count()}`),
          button({ click: () => count.update((value) => value + 1) }, '+'),
        ]),
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
    const clicks = signal(0);
    const widget = craftComponent(
      'inlineClickSurvivesRenders',
      {},
      () => ({ revision, clicks }),
      ({ revision, clicks }) =>
        div([
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
        ]),
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
    const counter = craftComponent(
      'templateTraceCounter',
      {
        providers: [
          provideTemplateTrace((context, next) => {
            traces.push({ ...context });
            return next();
          }),
        ],
      },
      () => ({ count }),
      ({ count }) => p(String(count())),
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
    const clicked = signal(0);
    const component = craftComponent(
      'interactionHookComponent',
      {
        providers: [
          { provide: marker, useValue: 'component-scope' },
          provideCraftDomEventHook(interactionHook),
        ],
      },
      () => ({ clicked }),
      ({ clicked }) =>
        div([
          button(
            'save',
            { click: () => clicked.update((value) => value + 1) },
            'Save',
          ),
          p(() => String(clicked())),
        ]),
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
    const counter = craftComponent(
      'AutomaticHostTag',
      {},
      () => ({ hostTags: inject(HOST_TAG_LIST) }),
      ({ hostTags }) => p(hostTags.join('|')),
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
      (input: CardInput) => input,
      ({ header, body }) =>
        div([
          header ? renderContent('header', header) : h2('fallback'),
          section(renderContent('body', body)),
        ]),
    );
    const parent = craftComponent(
      'runtimeProjectionParent',
      { providers: [{ provide: label, useValue: 'declarer' }] },
      () => ({}),
      () =>
        card({
          header: () => h2(inject(label)),
          body: () => [p('before'), p(inject(label)), p('after')],
        }),
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
    const projected = content(() => p('stable projection'));
    const component = craftComponent(
      'stableProjection',
      {},
      () => ({}),
      () => ifBlock(condition, () => section(renderContent('body', projected))),
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
    const action = craftComponent(
      'runtimeToolbarAction',
      {},
      (input: {
        readonly key: string;
        readonly content: ContentSlot;
        readonly trigger: () => void;
      }) => ({
        key: input.key,
        contract: {
          kind: 'toolbar-action',
          trigger: input.trigger,
          disabled: () => false,
        } satisfies ActionContract,
        content: input.content,
      }),
      ({ contract, content: label }) =>
        button({ click: contract.trigger }, renderContent(label)),
    );
    const toolbar = craftComponent(
      'runtimeToolbar',
      {},
      (input: { readonly actions: readonly ReturnType<typeof action>[] }) =>
        input,
      ({ actions }) =>
        div(
          { role: 'toolbar' },
          each(actions, { track: (item) => item.key }, (item) =>
            renderContent(item),
          ),
        ),
    );
    const root = craftComponent(
      'runtimeToolbarRoot',
      {},
      () => ({}),
      () =>
        toolbar({
          actions: [
            action({
              key: 'save',
              content: () => span('Save'),
              trigger,
            }),
          ],
        }),
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
    const projectedChild = craftComponent(
      'contentStyleProjectedChild',
      {},
      () => ({}),
      () => p({ class: 'projected-value' }, 'child'),
    );
    const card = craftComponent(
      'contentStyleCard',
      {
        styles: '.projected-value { color: blue; }',
        contentStyles: {
          body: ':scope { display: block; } .projected-value { color: red; }',
        },
      },
      (input: CardInput) => input,
      ({ body }) => section(renderContent('body', body)),
    );
    const page = craftComponent(
      'contentStylePage',
      {},
      () => ({}),
      () =>
        card({
          body: content(
            () => [
              p({ class: 'projected-value' }, 'ordinary'),
              projectedChild({}),
            ],
            { allowContainerStyles: true },
          ),
        }),
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
      (input: { readonly body: ContentSlot }) => input,
      ({ body }) => renderContent('body', body),
    );
    const page = craftComponent(
      'isolatedContentStylePage',
      {},
      () => ({}),
      () => card({ body: () => p({ class: 'isolated' }, 'content') }),
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
    const label = new InjectionToken<string>('projected-child-label');
    const projectedChild = craftComponent(
      'runtimeProjectedChild',
      {},
      () => ({ label: inject(label) }),
      ({ label: value }) => p(value),
    );
    const card = craftComponent(
      'runtimeProjectedChildCard',
      {
        providers: [{ provide: label, useValue: 'consumer' }],
      },
      (input: { readonly body: ContentSlot }) => input,
      ({ body }) => section(renderContent('body', body)),
    );
    const parent = craftComponent(
      'runtimeProjectedChildParent',
      {
        providers: [{ provide: label, useValue: 'declarer' }],
      },
      () => ({}),
      () => card({ body: () => projectedChild({}) }),
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
    const component = craftComponent(
      'runtimeTemplateFragment',
      {},
      () => ({}),
      () =>
        ul(
          each(['Ada', 'Lin'], { track: (value) => value }, (value, index) =>
            renderTemplate(row, { $implicit: value, index }),
          ),
        ),
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
    const component = craftComponent(
      'stableTemplateFragment',
      {},
      () => ({}),
      () =>
        ifBlock(condition, () =>
          renderTemplate(row, { label: `revision-${revision()}` }),
        ),
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
    const child = craftComponent(
      'queryChild',
      {},
      function* () {
        const value = yield* query('value', {
          params: () => true,
          loader: async () => ({ status: 'ready' }),
        });
        return { value };
      },
      ({ value }) =>
        p(function* () {
          return (yield* value.value())?.status ?? 'loading';
        }),
    );
    const parent = craftComponent(
      'queryParent',
      {},
      () => ({}),
      () => div([child()]),
    );
    await expect(renderCraftComponent(parent)).resolves.toBeDefined();
  });

  it('does not recreate a composed query component when its resource settles', async () => {
    let factoryRuns = 0;
    const component = craftComponent(
      'composedQuery',
      {},
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
      ({ todos, add }) =>
        section([
          p('source'),
          p(function* () {
            return yield* todos.status();
          }),
          button({ click: () => add.mutate('new todo') }, 'Add'),
        ]),
    ).pipe(
      catchBlock.exhaustive({
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
    const count = signal(0);
    const counter = craftComponent(
      'yieldableCounter',
      {},
      () => ({
        count,
        increment: craftMethod('increment', function* () {
          count.update((value) => value + 1);
        }),
      }),
      ({ count, increment }) =>
        div([
          p(() => String(count())),
          button(
            {
              *click() {
                yield* increment();
              },
            },
            '+',
          ),
        ]),
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
    const component = craftComponent(
      'yieldableProperty',
      {},
      () => ({
        disabled: craftMethod('disabled', function* () {
          return true;
        }),
      }),
      ({ disabled }) =>
        button(
          {
            *disabled() {
              return yield* disabled();
            },
          },
          '+',
        ),
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
    const count = signal(0);
    const component = craftComponent(
      'ordinaryBrandedCallback',
      {},
      () => ({
        increment: craftMethod('increment', function* () {
          count.update((value) => value + 1);
        }),
      }),
      ({ increment }) =>
        button({ click: () => void increment() }, String(count())),
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
    const component = craftComponent(
      'yieldableComputedProperty',
      {},
      function* () {
        const counter = yield* state('counter', 0, ({ state }) => ({
          disabled: craftComputed('disabled', function* () {
            return (yield* state()) % 2 === 0;
          }),
        }));
        return { counter };
      },
      ({ counter }) =>
        button(
          {
            *disabled() {
              return yield* counter.disabled();
            },
          },
          '+',
        ),
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
    const component = craftComponent(
      'yieldableReactiveTemplate',
      {},
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
      ({ counter }) =>
        section([
          span({ class: 'value' }, function* () {
            return yield* counter.doubled();
          }),
          ifBlock(counter.doubled, () => p({ class: 'visible' }, 'visible')),
          each(counter.items, { track: (item) => item }, (item) =>
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
        ]),
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
    const component = craftComponent(
      'yieldableStateSelectMethod',
      {},
      function* () {
        const scenario = yield* state('scenario', 'initial', ({ set }) => ({
          select: (value: string) => set(value),
        }));
        return { scenario };
      },
      ({ scenario }) =>
        section([
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
        ]),
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
    const component = craftComponent(
      'namedConditional',
      {},
      function* () {
        return {
          enabled: craftComputed('enabled', () => true),
        };
      },
      ({ enabled }) =>
        ifBlock(
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
        ),
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
    const component = craftComponent(
      'cyclicTemplateContext',
      {},
      () => ({ items }),
      () => p('ready'),
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
    const scopedChild = craftComponent(
      'scopedChild',
      { styles: '.child { color: red; }' },
      () => ({}),
      () => div({ class: 'child' }, [span({ class: 'child-inner' }, 'child')]),
    );
    const scopedParent = craftComponent(
      'scopedParent',
      { styles: '.parent { color: blue; }' },
      () => ({}),
      () => div({ class: 'parent' }, [scopedChild()]),
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
    const component = craftComponent(
      'stylesUrlComponent',
      { stylesUrl: '.external { color: red; }' },
      () => ({}),
      () => div({ class: 'external' }, 'external'),
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
    let factoryRuns = 0;
    const label = craftComponent(
      'label',
      {},
      (text: Input<string>) => {
        factoryRuns += 1;
        return { text };
      },
      ({ text }) =>
        p(function* () {
          return yield* text();
        }),
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

  it('merges host classes supplied at a component call site', async () => {
    const editableStatusComponent = craftComponent(
      'editableStatusComponent',
      { host: { class: 'status-base' } },
      (status: Input<string>) => ({ status }),
      ({ status }) =>
        span(function* () {
          return yield* status();
        }),
    );
    const directivePage = craftComponent(
      'directivePage',
      {},
      () => ({}),
      () =>
        h2([
          'Full craftService demo ',
          editableStatusComponent({
            status: function* () {
              return 'ready';
            },
            class: 'newClassAdded',
          }),
        ]),
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
      (
        baseLogic: HostRequiredLogic<{
          permissions: { canEdit: () => boolean };
        }>,
      ) => baseLogic,
      (
        baseTemplate: HostTemplate<{
          permissions: { canEdit: () => boolean };
        }>,
      ) =>
        (context) =>
          baseTemplate(context, {
            class: () => (context.permissions.canEdit() ? 'visible' : 'hidden'),
          }),
    );
    const reactiveStatusComponent = craftComponent(
      'reactiveStatusComponent',
      { host: { class: 'status-base' } },
      () => ({ permissions: { canEdit: () => canEdit() } }),
      () => span('ready'),
    ).pipe(onlyEditable);
    const reactiveDirectivePage = craftComponent(
      'reactiveDirectivePage',
      {},
      () => ({}),
      () => reactiveStatusComponent({ class: 'caller-class' }),
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
      (baseLogic: HostRequiredLogic<{ user: Input<string> }>) =>
        (user: Input<string>) => ({
          ...baseLogic(user),
          allowed,
        }),
      (
        baseTemplate: HostTemplate<{
          user: Input<string>;
          allowed: () => boolean;
        }>,
      ) =>
        (context) => (context.allowed() ? baseTemplate(context) : []),
    );
    const guarded = craftComponent(
      'guarded',
      {},
      (user: Input<string>) => ({ user }),
      ({ user }) =>
        p(function* () {
          return yield* user();
        }),
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

  it('passes public inputs added by a directive to the final factory', async () => {
    const withPermission = craftDirective(
      'withPermission',
      {},
      (baseLogic: HostRequiredLogic<{ user: Input<string> }>) =>
        (user: Input<string>, permission: Input<string>) => ({
          ...baseLogic(user),
          permission,
        }),
      (
        baseTemplate: HostTemplate<{
          user: Input<string>;
          permission: Input<string>;
        }>,
      ) =>
        (context) =>
          baseTemplate(context),
    );
    const card = craftComponent(
      'card',
      {},
      (user: Input<string>) => ({ user }),
      ({ user }) =>
        p(function* () {
          return yield* user();
        }),
    ).pipe(withPermission);
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(card, {
      props: {
        user: function* () {
          return 'Ada';
        },
        permission: function* () {
          return 'edit';
        },
      },
    });

    expect(element.textContent).toBe('Ada');
    destroy();
  });

  it('applies a structural directive piped directly on a hyperscript node', async () => {
    const visible = signal(true);
    const when = craftDirective(
      'when',
      {},
      (baseLogic: HostRequiredLogic<{ visible: Input<boolean> }>) => baseLogic,
      (baseTemplate: HostTemplate<{ visible: Input<boolean> }>) => (context) =>
        craftUse(context.visible()) ? baseTemplate(context) : [],
    );
    const panel = craftComponent(
      'panel',
      {},
      (visible: Input<boolean>) => ({ visible }),
      () => p('conditional').pipe(when),
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
    const component = craftComponent(
      'nodeDirectiveLifecycle',
      {},
      () => ({}),
      () =>
        div([
          span({ marker: label() }, 'one').pipe(marker),
          ...(showSecond()
            ? [span({ marker: `second-${label()}` }, 'two').pipe(marker)]
            : []),
        ]),
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

  it('recovers an ifBlock after its true branch throws', async () => {
    const explode = signal(true);
    const component = craftComponent(
      'ifBlockRecoversAfterThrow',
      {},
      function* () {
        const navOpen = yield* state('navOpen', false, ({ set, update }) => ({
          toggle: () => update((open) => !open),
          close: () => set(false),
        }));
        return { navOpen, toggleNav: navOpen.toggle };
      },
      ({ navOpen, toggleNav }) =>
        div([
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
          ifBlock(
            navOpen,
            () => {
              if (explode()) {
                throw new Error('panel boom');
              }
              return div({ class: 'panel' }, 'ok');
            },
            () => [],
          ),
        ]),
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

    const greeting = craftComponent(
      'greeting',
      { providers: [{ provide: PREFIX, useValue: 'Bonjour' }] },
      function* (name: Input<string>) {
        const service = yield* Greeting();
        return { name, service };
      },
      ({ name, service }) =>
        p(function* () {
          return `${service.prefix} ${yield* name()}`;
        }),
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
    const routeMarker = new InjectionToken<string>('route-marker');
    const injectorRouted = craftComponent(
      'injectorRouted',
      {},
      () => ({ routeMarker: inject(routeMarker) }),
      ({ routeMarker }) => p(routeMarker),
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
    const picked = vi.fn();
    const userCard = craftComponent(
      'userCard',
      {},
      (name: Input<string>, onPick: Output<(name: string) => void>) => ({
        name,
        onPick,
      }),
      ({ name, onPick }) =>
        button(
          {
            *click() {
              yield* onPick(yield* name());
            },
          },
          function* () {
            return yield* name();
          },
        ),
    );
    const parent = craftComponent(
      'parent',
      {},
      () => ({ picked }),
      ({ picked }) =>
        div([
          span('Parent'),
          userCard({
            name: function* () {
              return 'Grace';
            },
            onPick: picked,
          }),
        ]),
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

  it('reconciles each() blocks by key and renders the empty block', async () => {
    const users = signal([
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Grace' },
    ]);
    const list = craftComponent(
      'list',
      {},
      () => ({ users }),
      ({ users }) =>
        div(
          each(
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
        ),
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
    const scheduler = new VirtualEachScheduler();
    const list = craftComponent(
      'scheduled-list',
      {},
      () => ({ values }),
      ({ values }) =>
        div(
          each(values, { track: (value) => value }, (value) =>
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
          ).pipe(scheduleEach({ enabled: true, strategy: 'frame' })),
        ),
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(list, {
      providers: [{ provide: EACH_SCHEDULER, useValue: scheduler }],
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

  it('keeps scheduleEach synchronous when disabled', async () => {
    const list = craftComponent(
      'disabled-scheduled-list',
      {},
      () => ({}),
      () =>
        div(
          each([1, 2, 3], { track: (value) => value }, (value) =>
            p(function* () {
              return String(yield* value());
            }),
          ).pipe(scheduleEach({ enabled: false, strategy: 'frame' })),
        ),
    );
    const { nativeElement: element, destroy } =
      await renderCraftComponent(list);

    expect(element.querySelectorAll('p')).toHaveLength(3);
    destroy();
  });

  it('cancels obsolete scheduled work when the collection changes or the node is destroyed', async () => {
    const values = signal([1, 2, 3]);
    const scheduler = new VirtualEachScheduler();
    const list = craftComponent(
      'cancelled-scheduled-list',
      {},
      () => ({ values }),
      ({ values }) =>
        div(
          each(values, { track: (value) => value }, (value) =>
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
          ).pipe(scheduleEach({ strategy: 'frame' })),
        ),
    );
    const {
      nativeElement: element,
      flush,
      destroy,
    } = await renderCraftComponent(list, {
      providers: [{ provide: EACH_SCHEDULER, useValue: scheduler }],
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
    const list = craftComponent(
      'nullable-list',
      {},
      () => ({ users }),
      ({ users }) =>
        div(
          each(
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
        ),
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
    const success = craftComponent(
      'success',
      {},
      () => ({}),
      () =>
        defer(() => loaded, {
          trigger: 'immediate',
          resolve: (value) => p({ class: 'loaded' }, value),
          placeholder: () => p('Placeholder'),
          loading: () => p({ class: 'loading' }, 'Loading'),
        }),
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

    const failure = craftComponent(
      'failure',
      {},
      () => ({}),
      () =>
        defer(() => Promise.reject(new Error('boom')), {
          trigger: 'immediate',
          resolve: () => p('unreachable'),
          error: (error) =>
            p(
              { class: 'error' },
              (error as { code?: string })._tag ?? 'unknown',
            ),
        }),
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
    let calls = 0;
    const component = craftComponent(
      'deferRetry',
      {},
      () => ({}),
      () =>
        defer(
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
        ),
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
    const interaction = craftComponent(
      'interaction',
      {},
      () => ({}),
      () =>
        defer(() => Promise.resolve('Interacted'), {
          trigger: 'interaction',
          resolve: (value) => p({ class: 'interaction-loaded' }, value),
          placeholder: () => button({ class: 'interaction-trigger' }, 'Start'),
        }),
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

  it('keeps interaction defer idle on a DocumentFragment parent', async () => {
    const loader = vi.fn(async () => 'Interacted');
    const interaction = craftComponent(
      'detachedInteraction',
      {},
      () => ({}),
      () =>
        defer(loader, {
          trigger: 'interaction',
          resolve: (value) => p({ class: 'detached-loaded' }, value),
        }),
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
    const constantBinding = vi.fn(() => 'constant');
    const component = craftComponent(
      'correlationBindingIsolation',
      {},
      () => ({}),
      () => div([p(firstBinding), p(secondBinding), p(constantBinding)]),
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
