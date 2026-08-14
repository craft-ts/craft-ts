// @vitest-environment jsdom
import '@angular/compiler';
import {
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  EventEmitter,
  EnvironmentInjector,
  HostBinding,
  inject,
  InjectionToken,
  Injector,
  Input as AngularInput,
  Output as AngularOutput,
  Renderer2,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  ChildrenOutletContexts,
  provideRouter,
} from '@angular/router';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
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
  provideTemplateTrace,
  query,
  state,
  type CraftDomEvent,
} from '@craft-ng/core';
import {
  CraftRoutedComponentHost,
  loadCraftComponent,
  mountCraftComponent,
  provideCraftComponent,
} from '../bridge';
import { angular, directive } from '../angular';
import { craftComponent } from '../component';
import { CraftRouterOutlet } from '../craft-router-outlet';
import { craftDirective } from '../directive';
import { content, renderContent } from '../project';
import { defer } from '../defer';
import { each } from '../each';
import { ifBlock } from '../if-block';
import { catchBlock } from '../block';
import { button, div, h2, li, p, section, span, ul } from '../hyperscript';
import { craftTemplate, renderTemplate } from '../template';
import type { ContentSlot, RequiredContent } from '../types';
import type { HostRequiredLogic, HostTemplate, Input, Output } from '../types';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

@Component({
  selector: 'test-angular-child',
  standalone: true,
  template: `<button (click)="selected.emit(label)">{{ label }}</button>`,
})
class TestAngularChild {
  @AngularInput() label = '';
  @AngularOutput() readonly selected = new EventEmitter<string>();
}

@Directive({
  selector: '[craftTestMarker]',
  standalone: true,
})
class TestMarkerDirective {
  @AngularInput() craftTestMarker = '';
  @HostBinding('attr.data-marker')
  get marker(): string {
    return this.craftTestMarker;
  }
}

function host(): HTMLElement {
  const element = document.createElement('div');
  document.body.append(element);
  return element;
}

async function observeChildListMutations(
  target: Node,
  update: () => void,
): Promise<MutationRecord[]> {
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => records.push(...batch));
  observer.observe(target, { childList: true, subtree: true });

  try {
    update();
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

describe('functional component interpreter', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('updates only the reactive text binding that consumed a changed signal', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const paragraphs = Array.from(element.querySelectorAll('p'));
    expect(template).toHaveBeenCalledTimes(1);
    expect(firstBinding).toHaveBeenCalledTimes(1);
    expect(secondBinding).toHaveBeenCalledTimes(1);

    first.set('A2');
    TestBed.tick();

    expect(element.textContent).toBe('A2B');
    expect(template).toHaveBeenCalledTimes(1);
    expect(firstBinding).toHaveBeenCalledTimes(2);
    expect(secondBinding).toHaveBeenCalledTimes(1);
    expect(element.querySelectorAll('p')[0]).toBe(paragraphs[0]);
    expect(element.querySelectorAll('p')[1]).toBe(paragraphs[1]);
    mounted.destroy();
  });

  it('isolates attribute, class and style bindings on the same element', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    title.set('second');
    TestBed.tick();

    const rendered = element.querySelector('div')!;
    expect(rendered.title).toBe('second');
    expect(template).toHaveBeenCalledTimes(1);
    expect(titleBinding).toHaveBeenCalledTimes(2);
    expect(classBinding).toHaveBeenCalledTimes(1);
    expect(styleBinding).toHaveBeenCalledTimes(1);

    active.set(true);
    color.set('blue');
    TestBed.tick();

    expect(rendered.classList.contains('active')).toBe(true);
    expect(rendered.style.color).toBe('blue');
    expect(template).toHaveBeenCalledTimes(1);
    expect(titleBinding).toHaveBeenCalledTimes(2);
    expect(classBinding).toHaveBeenCalledTimes(2);
    expect(styleBinding).toHaveBeenCalledTimes(2);
    mounted.destroy();
  });

  it('updates reactive host props without rerunning the component template', () => {
    const active = signal(false);
    const hostClass = vi.fn(() => ({ active: active() }));
    const template = vi.fn(() => p('content'));
    const component = craftComponent(
      'granularHostBindings',
      { host: { class: hostClass } },
      () => ({}),
      template,
    );
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    expect(hostClass).toHaveBeenCalledTimes(2);

    active.set(true);
    TestBed.tick();

    expect(element.classList.contains('active')).toBe(true);
    expect(hostClass).toHaveBeenCalledTimes(4);
    expect(template).toHaveBeenCalledTimes(1);
    mounted.destroy();
  });

  it('coalesces text binding updates and stops them after destruction', () => {
    const value = signal(0);
    const binding = vi.fn(() => value());
    const component = craftComponent(
      'coalescedBinding',
      {},
      () => ({}),
      () => p(binding),
    );
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    value.set(1);
    value.set(2);
    TestBed.tick();
    expect(element.textContent).toBe('2');
    expect(binding).toHaveBeenCalledTimes(2);

    mounted.destroy();
    value.set(3);
    TestBed.tick();
    expect(binding).toHaveBeenCalledTimes(2);
  });

  it('owns conditional bindings in the active branch effect', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    value.set('updated');
    TestBed.tick();
    expect(element.textContent).toBe('updated');
    expect(template).toHaveBeenCalledTimes(1);
    expect(branch).toHaveBeenCalledTimes(1);

    visible.set(false);
    TestBed.tick();
    expect(element.textContent).toBe('');
    expect(template).toHaveBeenCalledTimes(1);
    expect(branch).toHaveBeenCalledTimes(1);

    value.set('detached');
    TestBed.tick();
    expect(binding).toHaveBeenCalledTimes(2);
    mounted.destroy();
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const stableNode = element.querySelector('p');
    if (!stableNode) {
      throw new Error('Expected the active if branch to be rendered');
    }

    try {
      const records = await observeChildListMutations(element, () => {
        conditionValue.set(2);
        TestBed.tick();
      });

      expect(element.querySelector('p')).toBe(stableNode);
      expect(childListMutationNodes(records)).not.toContain(stableNode);
    } finally {
      mounted.destroy();
    }
  });

  it('updates one keyed each item without evaluating its siblings', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const nodes = Array.from(element.querySelectorAll('li'));
    items[0].label.set('updated');
    TestBed.tick();

    expect(element.textContent).toBe('updatedtwo');
    expect(template).toHaveBeenCalledTimes(1);
    expect(itemTemplate).toHaveBeenCalledTimes(2);
    expect(bindings[0]).toHaveBeenCalledTimes(2);
    expect(bindings[1]).toHaveBeenCalledTimes(1);
    expect(element.querySelectorAll('li')[0]).toBe(nodes[0]);
    expect(element.querySelectorAll('li')[1]).toBe(nodes[1]);
    mounted.destroy();
  });

  it('does not reevaluate unchanged keyed items when the collection changes', () => {
    const first = { id: 1, label: 'one' };
    const second = { id: 2, label: 'two' };
    const items = signal([first, second]);
    const itemTemplate = vi.fn((item, index: number) =>
      li(
        { 'data-id': function* () { return (yield* item()).id; } },
        function* () { return `${index}:${(yield* item()).label}`; },
      ),
    );
    const component = craftComponent(
      'granularEachCollection',
      {},
      () => ({ items }),
      ({ items }) =>
        ul(each(items, { track: (item) => item.id }, itemTemplate)),
    );
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const nodes = Array.from(element.querySelectorAll('li'));
    const updatedFirst = { ...first, label: 'updated' };
    itemTemplate.mockClear();

    items.set([updatedFirst, second]);
    TestBed.tick();

    expect(itemTemplate).toHaveBeenCalledOnce();
    expect(itemTemplate).toHaveBeenCalledOnce();
    expect(craftUse(itemTemplate.mock.calls[0][0]())).toEqual(updatedFirst);
    expect(itemTemplate.mock.calls[0][1]).toBe(0);
    expect(element.textContent).toBe('0:updated1:two');
    expect(element.querySelectorAll('li')[0]).toBe(nodes[0]);
    expect(element.querySelectorAll('li')[1]).toBe(nodes[1]);
    mounted.destroy();
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
              { 'data-id': function* () { return (yield* item()).id; } },
              function* () { return (yield* item()).label; },
            ),
          ),
        ),
    );
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const list = element.querySelector('ul');
    const rows = Array.from(element.querySelectorAll('li'));
    const unchangedRow = rows[1];

    if (!list) {
      throw new Error('Expected the keyed list to be rendered');
    }

    try {
      const records = await observeChildListMutations(list, () => {
        items.set([{ ...first, label: 'updated' }, second]);
        TestBed.tick();
      });

      expect(element.textContent).toBe('updatedtwo');
      expect(element.querySelectorAll('li')[0]).toBe(rows[0]);
      expect(element.querySelectorAll('li')[1]).toBe(unchangedRow);
      expect(childListMutationNodes(records)).not.toContain(unchangedRow);
    } finally {
      mounted.destroy();
    }
  });

  it('traces a changed keyed item as a block update', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    traces.length = 0;

    items.set([{ ...first, label: 'updated' }, second]);
    TestBed.tick();

    expect(traces).toEqual([
      {
        kind: 'block',
        phase: 'update',
        componentName: 'granularEachTrace',
        name: 'each',
        renderCount: 2,
      },
    ]);
    mounted.destroy();
  });

  it('renders static nodes, listeners, classes and reactive signal reads', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      counter,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(element.getAttribute('data-kind')).toBe('counter');
    expect(element.querySelector('.value')?.textContent).toBe('Count: 0');

    element.querySelector('button')?.click();
    TestBed.tick();
    expect(element.querySelector('.value')?.textContent).toBe('Count: 1');

    mounted.destroy();
    expect(element.textContent).toBe('');
  });

  it('traces component creation, initial render, updates and destruction', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      counter,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    count.set(1);
    TestBed.tick();
    mounted.destroy();

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

  it('runs DOM event hooks in the component injector and exposes the binding location', () => {
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
    const element = host();

    mountCraftComponent(component, element, TestBed.inject(Injector));
    TestBed.tick();
    element.querySelector<HTMLButtonElement>('button')?.click();
    TestBed.tick();

    expect(seen).toEqual(['click:component-scope']);
    expect(interactionNames).toEqual([
      'interactionHookComponent:button:save:click',
    ]);
    expect(element.querySelector('p')?.textContent).toBe('1');
  });

  it('provides an automatic component host tag from the component name', () => {
    const counter = craftComponent(
      'AutomaticHostTag',
      {},
      () => ({ hostTags: inject(HOST_TAG_LIST) }),
      ({ hostTags }) => p(hostTags.join('|')),
    );
    const element = host();

    const mounted = mountCraftComponent(
      counter,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(element.textContent).toMatch(/^component:AutomaticHostTag#\d+$/);
    mounted.destroy();
  });

  it('projects named slots without a wrapper and keeps the declarative injector', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      parent,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(element.textContent).toBe('declarerbeforedeclarerafter');
    expect(element.querySelector('section')?.children).toHaveLength(3);
    expect(element.querySelector('section')?.firstElementChild?.tagName).toBe(
      'P',
    );
    expect(element.querySelectorAll('section > craft-projection')).toHaveLength(
      0,
    );
    mounted.destroy();
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const stableNode = element.querySelector('p');
    if (!stableNode) {
      throw new Error('Expected the projected content to be rendered');
    }

    try {
      const records = await observeChildListMutations(element, () => {
        revision.set(2);
        TestBed.tick();
      });

      expect(element.querySelector('p')).toBe(stableNode);
      expect(childListMutationNodes(records)).not.toContain(stableNode);
    } finally {
      mounted.destroy();
    }
  });

  it('renders contract components through the same renderContent primitive', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      root,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(element.querySelector('[role="toolbar"]')?.textContent).toBe('Save');
    (element.querySelector('button') as HTMLButtonElement).click();
    expect(trigger).toHaveBeenCalledTimes(1);
    mounted.destroy();
  });

  it('applies opted-in content styles through a dedicated projection scope', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      page,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

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

    mounted.destroy();
    expect(document.querySelectorAll('style[data-craft-sheet]')).toHaveLength(
      0,
    );
  });

  it('keeps content styles isolated unless the slot opts in', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      page,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(element.querySelector('p.isolated')).not.toBeNull();
    expect(
      element.querySelector('p.isolated')?.getAttribute('data-craft-content'),
    ).toBeNull();
    expect(document.querySelectorAll('style[data-craft-sheet]')).toHaveLength(
      0,
    );
    mounted.destroy();
  });

  it('keeps projected child components on the declarative injector chain', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      parent,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(element.textContent).toBe('declarer');
    mounted.destroy();
  });

  it('renders a typed template repeatedly and only when its node is active', () => {
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
          each(
            ['Ada', 'Lin'],
            { track: (value) => value },
            (value, index) =>
              renderTemplate(row, { $implicit: value, index }),
          ),
        ),
    );
    const element = host();

    expect(renders).toBe(0);
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(renders).toBe(2);
    expect(element.textContent).toBe('0: Ada1: Lin');
    mounted.destroy();
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const stableNode = element.querySelector('p');
    if (!stableNode) {
      throw new Error('Expected the template fragment to be rendered');
    }

    try {
      const records = await observeChildListMutations(element, () => {
        revision.set(2);
        TestBed.tick();
      });

      expect(element.textContent).toBe('revision-2');
      expect(element.querySelector('p')).toBe(stableNode);
      expect(childListMutationNodes(records)).not.toContain(stableNode);
    } finally {
      mounted.destroy();
    }
  });

  it('constructs child component queries outside the parent render context', () => {
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
    const element = host();

    expect(() => {
      const mounted = mountCraftComponent(
        parent,
        element,
        TestBed.inject(Injector),
      );
      TestBed.tick();
      mounted.destroy();
    }).not.toThrow();
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
            params === 0 ? [] : craftException({ code: 'FAILED_TO_LOAD' }),
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    element.querySelector('button')?.click();
    await vi.waitFor(() => expect(element.textContent).toContain('failed'));
    TestBed.tick();

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(element.textContent).toContain('source');
    expect(factoryRuns).toBeLessThanOrEqual(2);
    mounted.destroy();
  });

  it('drives generator DOM callbacks and branded Craft methods', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      counter,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    element.querySelector('button')?.click();
    TestBed.tick();

    expect(element.querySelector('p')?.textContent).toBe('1');
    mounted.destroy();
  });

  it('drives generator callbacks assigned to primitive DOM properties', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(element.querySelector('button')?.hasAttribute('disabled')).toBe(
      true,
    );
    expect(
      (element.querySelector('button') as HTMLButtonElement).disabled,
    ).toBe(true);
    mounted.destroy();
  });

  it('keeps branded methods callable from ordinary template callbacks', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    element.querySelector('button')?.click();
    TestBed.tick();

    expect(element.querySelector('button')?.textContent).toBe('1');
    mounted.destroy();
  });

  it('projects craftComputed state insertions as yieldable template properties', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(
      (element.querySelector('button') as HTMLButtonElement).disabled,
    ).toBe(true);
    mounted.destroy();
  });

  it('renders root and derived reactive readers across template blocks', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );

    TestBed.tick();
    expect(element.querySelector('.value')?.textContent).toBe('2');
    expect(element.querySelector('.visible')).not.toBeNull();
    expect(element.querySelectorAll('li')).toHaveLength(1);

    element.querySelector('button')?.click();
    TestBed.tick();
    expect(element.querySelector('.value')?.textContent).toBe('4');
    expect(element.querySelectorAll('li')).toHaveLength(2);
    mounted.destroy();
  });

  it('renders named conditional elements and updates their visibility', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(
      element.querySelector('[data-craft-name="increment"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-craft-name="increment"]')?.tagName,
    ).toBe('BUTTON');
    mounted.destroy();
  });

  it('projects cyclic arrays in the template context without overflowing the stack', () => {
    const items: unknown[] = [];
    items.push(items);
    const component = craftComponent(
      'cyclicTemplateContext',
      {},
      () => ({ items }),
      () => p('ready'),
    );
    const element = host();

    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(element.textContent).toContain('ready');
    mounted.destroy();
  });

  it('marks component roots without leaking the marker into descendants', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      scopedParent,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

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

    mounted.destroy();
    expect(document.querySelectorAll('style[data-craft-sheet]')).toHaveLength(
      0,
    );
  });

  it('registers stylesUrl content in the component style scope', () => {
    const component = craftComponent(
      'stylesUrlComponent',
      { stylesUrl: '.external { color: red; }' },
      () => ({}),
      () => div({ class: 'external' }, 'external'),
    );
    const element = host();

    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(
      document.querySelector<HTMLStyleElement>('style[data-craft-sheet]')
        ?.textContent,
    ).toContain('.external { color: red; }');

    mounted.destroy();
  });

  it('marks Angular hosts as scope boundaries but leaves their internals unmarked', () => {
    const angularBoundaryParent = craftComponent(
      'angularBoundaryParent',
      { styles: '.parent { color: blue; }' },
      () => ({}),
      () => div({ class: 'parent' }, [angular(TestAngularChild)]),
    );
    const element = host();

    const mounted = mountCraftComponent(
      angularBoundaryParent,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const angularHost = element.querySelector('test-angular-child')!;
    expect(angularHost.getAttribute('data-craft-root')).toContain(
      'angular:test-angular-child',
    );
    expect(
      angularHost.querySelector('button')?.hasAttribute('data-craft-root'),
    ).toBe(false);
    mounted.destroy();
  });

  it('patches Input accessors without recreating the component', () => {
    const value = signal('first');
    const valueReader = markYieldableValue(
      function* () {
        return value();
      },
      'inputText',
    );
    let factoryRuns = 0;
    const label = craftComponent(
      'label',
      {},
      (text: Input<string>) => {
        factoryRuns += 1;
        return { text };
      },
      ({ text }) => p(function* () {
        return yield* text();
      }),
    );
    const element = host();
    const mounted = mountCraftComponent(
      label,
      element,
      TestBed.inject(Injector),
      {
        text: valueReader,
      },
    );
    TestBed.tick();
    const paragraph = element.querySelector('p');

    value.set('second');
    TestBed.tick();

    expect(element.textContent).toBe('second');
    expect(element.querySelector('p')).toBe(paragraph);
    expect(factoryRuns).toBe(1);
    mounted.destroy();
  });

  it('merges host classes supplied at a component call site', () => {
    const editableStatusComponent = craftComponent(
      'editableStatusComponent',
      { host: { class: 'status-base' } },
      (status: Input<string>) => ({ status }),
      ({ status }) => span(function* () {
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
    const element = host();

    const mounted = mountCraftComponent(
      directivePage,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(element.querySelector('span')?.className).toBe(
      'status-base newClassAdded',
    );
    mounted.destroy();
  });

  it('merges reactive host classes supplied by a craft directive', () => {
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
    const element = host();

    const mounted = mountCraftComponent(
      reactiveDirectivePage,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    expect(element.querySelector('span')?.className).toBe(
      'status-base visible caller-class',
    );

    canEdit.set(false);
    TestBed.tick();
    expect(element.querySelector('span')?.className).toBe(
      'status-base hidden caller-class',
    );
    mounted.destroy();
  });

  it('composes a configurable directive around the component logic and template', () => {
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
      ({ user }) => p(function* () {
        return yield* user();
      }),
    ).pipe(guard);
    const element = host();
    const mounted = mountCraftComponent(
      guarded,
      element,
      TestBed.inject(Injector),
      {
        user: function* () {
          return 'visible';
        },
      },
    );
    TestBed.tick();

    expect(element.textContent).toBe('visible');
    allowed.set(false);
    TestBed.tick();
    expect(element.textContent).toBe('');

    mounted.destroy();
  });

  it('passes public inputs added by a directive to the final factory', () => {
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
      ({ user }) => p(function* () {
        return yield* user();
      }),
    ).pipe(withPermission);
    const element = host();

    const mounted = mountCraftComponent(
      card,
      element,
      TestBed.inject(Injector),
      {
        user: function* () {
          return 'Ada';
        },
        permission: function* () {
          return 'edit';
        },
      },
    );
    TestBed.tick();

    expect(element.textContent).toBe('Ada');
    mounted.destroy();
  });

  it('applies a structural directive piped directly on a hyperscript node', () => {
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
    const element = host();
    const mounted = mountCraftComponent(
      panel,
      element,
      TestBed.inject(Injector),
      {
        visible: function* () {
          return visible();
        },
      },
    );
    TestBed.tick();

    expect(element.textContent).toBe('conditional');
    visible.set(false);
    TestBed.tick();
    expect(element.textContent).toBe('');

    mounted.destroy();
  });

  it('mounts a Craft node directive with an isolated injector and destroys it with its element', () => {
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
        expect(inject(Renderer2)).toBe(context.renderer);
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
    const element = host();
    const mounted = mountCraftComponent(
      component,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    const spans = Array.from(element.querySelectorAll('span'));
    expect(mountedElements).toEqual(spans);
    expect(spans.map((node) => node.getAttribute('data-marker'))).toEqual([
      'first',
      'second-first',
    ]);

    label.set('updated');
    TestBed.tick();
    expect(mountedElements).toHaveLength(2);
    expect(
      Array.from(element.querySelectorAll('span')).map((node) =>
        node.getAttribute('data-marker'),
      ),
    ).toEqual(['updated', 'second-updated']);

    showSecond.set(false);
    TestBed.tick();
    expect(returnedCleanups).toHaveBeenCalledTimes(1);
    expect(destroyRefCleanups).toHaveBeenCalledTimes(1);

    mounted.destroy();
    expect(returnedCleanups).toHaveBeenCalledTimes(2);
    expect(destroyRefCleanups).toHaveBeenCalledTimes(2);
  });

  it('resolves yield* craftService dependencies in the child injector', () => {
    const PREFIX = new InjectionToken<string>('component-prefix');
    const { Greeting } = craftService(
      { name: 'Greeting', scope: 'function' },
      () => ({ prefix: inject(PREFIX) }),
    );

    const greeting = craftComponent(
      'greeting',
      { providers: [{ provide: PREFIX, useValue: 'Bonjour' }] },
      function* (name: Input<string>) {
        const service = yield* Greeting();
        return { name, service };
      },
      ({ name, service }) => p(function* () {
        return `${service.prefix} ${yield* name()}`;
      }),
    );

    const element = host();
    mountCraftComponent(greeting, element, TestBed.inject(Injector), {
      name: function* () {
        return 'Ada';
      },
    });
    TestBed.tick();

    expect(element.textContent).toBe('Bonjour Ada');
  });

  it('preserves an intermediate parent injector for nested Craft components', () => {
    const routeMarker = new InjectionToken<string>('route-marker');
    const injectorRouted = craftComponent(
      'injectorRouted',
      {},
      () => ({ routeMarker: inject(routeMarker) }),
      ({ routeMarker }) => p(routeMarker),
    );
    const routeInjector = Injector.create({
      providers: [{ provide: routeMarker, useValue: 'nested route' }],
      parent: TestBed.inject(EnvironmentInjector),
    });
    const element = host();

    mountCraftComponent(injectorRouted, element, routeInjector);
    TestBed.tick();

    expect(element.textContent).toBe('nested route');
  });

  it('mounts selectorless children by lexical component reference', () => {
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

    const element = host();
    mountCraftComponent(parent, element, TestBed.inject(Injector));
    TestBed.tick();
    element.querySelector('button')?.click();

    expect(element.textContent).toBe('ParentGrace');
    expect(picked).toHaveBeenCalledWith('Grace');
  });

  it('reconciles each() blocks by key and renders the empty block', () => {
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
                { 'data-id': function* () { return (yield* user()).id; } },
                function* () { return (yield* user()).name; },
              ),
          ),
        ),
    );
    const element = host();
    mountCraftComponent(list, element, TestBed.inject(Injector));
    TestBed.tick();
    const ada = element.querySelector('[data-id="1"]');
    const grace = element.querySelector('[data-id="2"]');

    users.set([
      { id: 2, name: 'Grace Hopper' },
      { id: 1, name: 'Ada Lovelace' },
      { id: 3, name: 'Linus' },
    ]);
    TestBed.tick();

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
    TestBed.tick();
    expect(element.querySelector('.empty')?.textContent).toBe('Nobody');
  });

  it('treats nullish each sources as empty collections', () => {
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
                { 'data-id': function* () { return (yield* user()).id; } },
                function* () { return (yield* user()).name; },
              ),
          ),
        ),
    );
    const element = host();
    mountCraftComponent(list, element, TestBed.inject(Injector));
    TestBed.tick();

    expect(element.querySelector('.empty')?.textContent).toBe('Nobody');

    users.set([{ id: 1, name: 'Ada' }]);
    TestBed.tick();
    expect(element.querySelector('[data-id="1"]')?.textContent).toBe('Ada');

    users.set(null);
    TestBed.tick();
    expect(element.querySelector('[data-id="1"]')).toBeNull();
    expect(element.querySelector('.empty')?.textContent).toBe('Nobody');

    users.set(undefined);
    TestBed.tick();
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
    const successHost = host();
    mountCraftComponent(success, successHost, TestBed.inject(Injector));
    TestBed.tick();
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
              (error as { code?: string }).code ?? 'unknown',
            ),
        }),
    );
    const failureHost = host();
    mountCraftComponent(failure, failureHost, TestBed.inject(Injector));
    TestBed.tick();

    await vi.waitFor(() => {
      expect(failureHost.querySelector('.error')?.textContent).toBe(
        'CRAFT_LAZY_LOAD_ERROR',
      );
    });
  });

  it('passes withRetry to defer loaders and retries a failed lazy import', async () => {
    TestBed.configureTestingModule({
      providers: [provideCraftLazyLoadRetry({ attempts: 1, delayMs: 0 })],
    });

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
    const element = host();

    mountCraftComponent(component, element, TestBed.inject(Injector));
    TestBed.tick();

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
    const element = host();
    mountCraftComponent(interaction, element, TestBed.inject(Injector));
    TestBed.tick();

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

  it('mounts Angular components and directives through public interop nodes', () => {
    const label = signal('Angular child');
    const selected = vi.fn();
    const interop = craftComponent(
      'interop',
      {},
      () => ({ label, selected }),
      ({ label, selected }) =>
        div([
          angular(TestAngularChild, {
            inputs: { label },
            outputs: { selected },
          }),
          p('Marked').pipe(
            directive(TestMarkerDirective, {
              inputs: { craftTestMarker: () => 'active' },
            }),
          ),
        ]),
    );
    const element = host();
    mountCraftComponent(interop, element, TestBed.inject(Injector));
    TestBed.tick();

    expect(element.querySelector('test-angular-child')?.textContent).toContain(
      'Angular child',
    );
    expect(element.querySelector('[data-marker="active"]')?.textContent).toBe(
      'Marked',
    );

    element
      .querySelector<HTMLButtonElement>('test-angular-child button')
      ?.click();
    expect(selected).toHaveBeenCalledWith('Angular child');
  });

  it('mounts a routed functional component from a route-scoped provider', () => {
    const providerRouted = craftComponent(
      'providerRouted',
      {},
      () => ({}),
      () => p({ class: 'routed-functional' }, 'Routed'),
    );
    TestBed.configureTestingModule({
      providers: [provideCraftComponent(providerRouted)],
    });
    const fixture = TestBed.createComponent(CraftRoutedComponentHost);
    fixture.detectChanges();
    TestBed.tick();

    expect(
      fixture.nativeElement.querySelector('.routed-functional')?.textContent,
    ).toBe('Routed');
  });

  it('passes the activated route params to a routed functional component', () => {
    const paramsRouted = craftComponent(
      'paramsRouted',
      {},
      (userId: Input<string>) => ({ userId }),
      ({ userId }) =>
        p({ class: 'route-user-id' }, function* () {
          return yield* userId();
        }),
    );
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideCraftComponent(paramsRouted)],
    });
    const element = host();
    const mounted = mountCraftComponent(
      CraftRouterOutlet,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    const params = new BehaviorSubject({ userId: '42' });
    const queryParams = new BehaviorSubject({});
    const data = new BehaviorSubject({});
    const activatedRoute = {
      component: CraftRoutedComponentHost,
      data,
      params,
      queryParams,
      snapshot: {
        component: CraftRoutedComponentHost,
        data: {},
        params: { userId: '42' },
        queryParams: {},
        routeConfig: { component: CraftRoutedComponentHost },
      },
    } as unknown as ActivatedRoute;

    const outlet = TestBed.inject(ChildrenOutletContexts).getContext(
      'primary',
    )?.outlet;
    expect(outlet).toBeDefined();
    outlet?.activateWith(activatedRoute, TestBed.inject(EnvironmentInjector));
    TestBed.tick();

    expect(element.querySelector('.route-user-id')?.textContent).toBe('42');

    params.next({ userId: '43' });
    TestBed.tick();

    expect(element.querySelector('.route-user-id')?.textContent).toBe('43');
    mounted.destroy();
  });

  it('activates a functional outlet from an inherited child route context', () => {
    const inheritedRouted = craftComponent(
      'inheritedRouted',
      {},
      (userId: Input<string>) => ({ userId }),
      ({ userId }) =>
        p({ class: 'nested-route-user-id' }, function* () {
          return yield* userId();
        }),
    );
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideCraftComponent(inheritedRouted)],
    });
    const data = new BehaviorSubject({});
    const params = new BehaviorSubject({ userId: '84' });
    const queryParams = new BehaviorSubject({});
    const activatedRoute = {
      component: CraftRoutedComponentHost,
      data,
      params,
      queryParams,
      snapshot: {
        component: CraftRoutedComponentHost,
        data: {},
        params: { userId: '84' },
        queryParams: {},
        routeConfig: { component: CraftRoutedComponentHost },
      },
    } as unknown as ActivatedRoute;
    const childContexts = new ChildrenOutletContexts(
      TestBed.inject(EnvironmentInjector),
    );
    childContexts.getOrCreateContext('primary').route = activatedRoute;
    const nestedRouteInjector = Injector.create({
      providers: [{ provide: ChildrenOutletContexts, useValue: childContexts }],
      parent: TestBed.inject(EnvironmentInjector),
    });
    const element = host();

    const mounted = mountCraftComponent(
      CraftRouterOutlet,
      element,
      nestedRouteInjector,
    );
    TestBed.tick();

    expect(element.querySelector('.nested-route-user-id')?.textContent).toBe(
      '84',
    );
    mounted.destroy();
  });

  it('mounts a lazily loaded functional component without an eager provider', async () => {
    const routeMarker = new InjectionToken<string>('LAZY_ROUTE_MARKER');
    const lazyRouted = craftComponent(
      'lazyRouted',
      {},
      () => ({ routeMarker: inject(routeMarker) }),
      ({ routeMarker }) => p({ class: 'lazy-routed-functional' }, routeMarker),
    );
    const loader = vi.fn(async () => lazyRouted);

    const lazyRoute = loadCraftComponent(loader, [
      { provide: routeMarker, useValue: 'Lazy routed' },
    ]);
    const LazyCraftComponentHost = await lazyRoute.loadComponent(
      {} as Parameters<typeof lazyRoute.loadComponent>[0],
    );
    TestBed.configureTestingModule({ providers: lazyRoute.providers });
    const fixture = TestBed.createComponent(LazyCraftComponentHost);
    fixture.detectChanges();
    TestBed.tick();

    expect(loader).toHaveBeenCalledOnce();
    expect(
      fixture.nativeElement.querySelector('.lazy-routed-functional')
        ?.textContent,
    ).toBe('Lazy routed');
  });
});
