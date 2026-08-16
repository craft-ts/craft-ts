// @vitest-environment jsdom
import {
  signal,
} from '../../../core/src/lib/host/craft-compat';
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import { craftService, craftUse } from '@craft-ng/core';
import { craftComponent } from './component';
import { craftDirective } from './directive';
import { div, button, input, label, p, span } from './hyperscript';
import { ifBlock } from './if-block';
import { each } from './each';
import { markYieldableValue } from '@craft-ng/core';
import {
  setupCraftComponentLogicTest,
  setupCraftComponentTemplateTest,
  setupCraftDirectiveLogicTest,
  setupCraftDirectiveTemplateTest,
} from './testing';
import type { HostRequiredLogic, HostTemplate, Input } from './types';
import type { NamedYieldableValue } from '@craft-ng/core';
import type { LocatorContentNamesFor } from './locator';

describe('Craft component and directive testing utilities', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('tests component logic with an isolated service register', async () => {
    const { LogicDependency } = craftService(
      { name: 'LogicDependency', scope: 'function' },
      () => ({ value: 'real' }),
    );
    const component = craftComponent(
      'logicTestComponent',
      {},
      function* (label: Input<string>) {
        const dependency = yield* LogicDependency();
        return { label, dependency };
      },
      () => p('template'),
    );

    const result = await setupCraftComponentLogicTest.byRegister(component, {
      args: [
        function* () {
          return 'logic';
        } as Input<string>,
      ],
      register: {
        LogicDependency: { value: 'mock' },
      },
    });

    expect(craftUse(result.context.label())).toBe('logic');
    expect(result.context.dependency.value).toBe('mock');
    expect(result.mocks.LogicDependency).toBeDefined();
    result.destroy();
  });

  it('tests a component template with direct context and child services', async () => {
    const { ChildDependency } = craftService(
      { name: 'ChildDependency', scope: 'function' },
      () => ({ label: 'child' }),
    );
    const child = craftComponent(
      'templateChild',
      {},
      function* () {
        return { dependency: yield* ChildDependency() };
      },
      ({ dependency }) => span(dependency.label),
    );
    const component = craftComponent(
      'templateTestComponent',
      { styles: '.template-root { color: red; }' },
      () => ({ label: 'ignored' }),
      ({ label }) => div({ class: 'template-root' }, [p(label), child()]),
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      context: { label: 'direct context' },
      register: {
        ChildDependency: { label: 'mock child' },
      },
    });
    expect(result.nativeElement.textContent).toContain('direct context');
    expect(result.nativeElement.textContent).toContain('mock child');
    expect(result.nativeElement.querySelector('.template-root')).not.toBeNull();
    expect(document.querySelector('style[data-craft-sheet]')).not.toBeNull();
    result.destroy();
    expect(result.nativeElement.textContent).toBe('');
    expect(document.querySelector('style[data-craft-sheet]')).toBeNull();
  });

  it('finds controls by role and accessible name', async () => {
    const Page = craftComponent(
      'roleLocatorPage',
      {},
      () => ({}),
      () => [
        label({ htmlFor: 'email' }, 'Email'),
        input({ id: 'email', type: 'email' }),
        label({ htmlFor: 'save-button' }, 'Save'),
        button({ id: 'save-button', type: 'button' }, 'Save'),
        button({ type: 'button' }, 'Cancel'),
      ],
    );
    const result = await setupCraftComponentTemplateTest(Page, {
      context: {},
      register: {},
    });
    expect(result.getByRole('button', { name: 'Save' }).textContent).toBe(
      'Save',
    );
    expect(result.getByRole('button', { name: /Save/g }).textContent).toBe(
      'Save',
    );
    expect(result.getByLabel('Email').id).toBe('email');
    expect(result.getByLabel('Save').id).toBe('save-button');
    expect(result.queryByRole('button', { name: 'Missing' })).toBeUndefined();
    expect(() => result.getByRole('button', { name: 'Missing' })).toThrow(
      /Unable to find role "button" with name "Missing"/,
    );
    result.destroy();
  });

  it('locates statically identified elements with inferred DOM types', async () => {
    const child = craftComponent(
      'locatorChild',
      {},
      () => ({}),
      () => button({ class: 'child', 'data-testid': 'child' }, 'Child'),
    );
    const component = craftComponent(
      'locatorComponent',
      {},
      () => ({}),
      () =>
        div([
          button({ class: 'save primary', 'data-testid': 'save' }, 'Save'),
          input({ attrs: { 'aria-label': 'Search' } }),
          child(),
        ]),
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      context: {},
      register: {},
    });

    const save = result.locator('button', { class: 'save' });
    const saveByAttribute = result.locator('button', {
      'data-testid': 'save',
    });
    const search = result.locator('input', { 'aria-label': 'Search' });
    const childButton = result.locator('button', { class: 'child' });
    expectTypeOf(save).toEqualTypeOf<HTMLButtonElement>();
    expectTypeOf(saveByAttribute).toEqualTypeOf<HTMLButtonElement>();
    expectTypeOf(search).toEqualTypeOf<HTMLInputElement>();
    expectTypeOf(childButton).toEqualTypeOf<HTMLButtonElement>();
    expect(save.textContent).toBe('Save');
    expect(search.getAttribute('aria-label')).toBe('Search');
    expect(childButton.textContent).toBe('Child');

    result.destroy();
  });

  it('locates an element by the brand of its direct rendered content', async () => {
    const rawBrandedStatus = signal('Saved');
    const brandedStatus = markYieldableValue(
      rawBrandedStatus,
      'brandedStatus',
    ) as NamedYieldableValue<'brandedStatus', typeof rawBrandedStatus>;
    const component = craftComponent(
      'brandedContentLocatorComponent',
      {},
      () => ({ brandedStatus }),
      ({ brandedStatus }) => div([span(brandedStatus)]),
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      context: { brandedStatus },
      register: {},
    });

    expectTypeOf<typeof brandedStatus>().toMatchTypeOf<
      NamedYieldableValue<'brandedStatus', unknown>
    >();
    expectTypeOf<
      LocatorContentNamesFor<typeof component, 'span'>
    >().toEqualTypeOf<'brandedStatus'>();
    const brandedStatusElement = result.locator('span', {
      content: 'brandedStatus',
    });
    expectTypeOf(brandedStatusElement).toEqualTypeOf<HTMLSpanElement>();
    expect(brandedStatusElement.textContent).toBe('Saved');

    brandedStatus.set('Updated');
    result.updateContext({ brandedStatus });
    result.detectChanges();
    expect(result.locator('span', { content: 'brandedStatus' })).toBe(
      brandedStatusElement,
    );
    expect(brandedStatusElement.textContent).toBe('Updated');

    // This branch exists only to assert the type error for an unrendered brand.
    // eslint-disable-next-line no-constant-condition
    if (false) {
      // @ts-expect-error the content brand is not rendered by this template
      result.locator('span', { content: 'missing' });
    }
    result.destroy();
  });

  it('returns an optional branded-content locator under a condition', async () => {
    const rawVisible = signal(true);
    const rawBrandedStatus = signal('Visible');
    const visible = markYieldableValue(
      rawVisible,
      'visible',
    ) as NamedYieldableValue<'visible', typeof rawVisible>;
    const brandedStatus = markYieldableValue(
      rawBrandedStatus,
      'brandedStatus',
    ) as NamedYieldableValue<'brandedStatus', typeof rawBrandedStatus>;
    const component = craftComponent(
      'conditionalBrandedContentLocatorComponent',
      {},
      () => ({ visible, brandedStatus }),
      ({ visible, brandedStatus }) =>
        ifBlock(
          visible,
          () => span(brandedStatus),
          () => p('Hidden'),
        ),
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      context: { visible, brandedStatus },
      register: {},
    });
    const visibleElement = result.locator('span', {
      content: 'brandedStatus',
    });
    expectTypeOf(visibleElement).toEqualTypeOf<HTMLSpanElement | undefined>();
    expect(visibleElement?.textContent).toBe('Visible');

    visible.set(false);
    result.updateContext({ visible, brandedStatus });
    result.detectChanges();
    expect(
      result.locator('span', { content: 'brandedStatus' }),
    ).toBeUndefined();
    result.destroy();
  });

  it('returns an optional locator for conditional elements and refreshes it', async () => {
    const initialVisible = markYieldableValue(signal(true), 'visible');
    const component = craftComponent(
      'conditionalLocatorComponent',
      {},
      () => ({ visible: initialVisible }),
      ({ visible }: { visible: any }) =>
        ifBlock(
          visible,
          () => button({ class: 'conditional' }, 'Conditional'),
          () => p('Hidden'),
        ),
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      context: { visible: initialVisible },
      register: {},
    });
    const conditional = result.locator('button', { class: 'conditional' });
    expect(conditional?.textContent).toBe('Conditional');

    initialVisible.set(false);
    result.updateContext({ visible: initialVisible });
    result.detectChanges();
    expect(result.locator('button', { class: 'conditional' })).toBeUndefined();
    result.destroy();
  });

  it('rejects statically repeated targets in the singular locator API', async () => {
    const component = craftComponent(
      'ambiguousLocatorComponent',
      {},
      () => ({}),
      () =>
        div([
          button({ class: 'duplicate' }, 'One'),
          button({ class: 'duplicate' }, 'Two'),
        ]),
    );
    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      context: {},
      register: {},
    });

    expect(() =>
      (result.locator as (...args: any[]) => unknown)('button', {
        class: 'duplicate',
      }),
    ).toThrow(/exactly one/);
    result.destroy();
  });

  it('rejects targets rendered by each as potentially repeated', async () => {
    const component = craftComponent(
      'eachLocatorComponent',
      {},
      () => ({}),
      () =>
        each(
          [{ id: 1 }, { id: 2 }],
          { track: (item: { id: number }) => item.id },
          () => button({ class: 'row' }, 'Row'),
        ),
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      context: {},
      register: {},
    });
    expect(() => result.locator('button', { class: 'row' })).toThrow(
      /exactly one/,
    );
    result.destroy();
  });

  it('tests directive logic separately from its base logic', async () => {
    const directive = craftDirective(
      'testDirective',
      {},
      (baseLogic: HostRequiredLogic<{ value: Input<string> }>) =>
        (value: Input<string>) => ({
          ...baseLogic(value),
          decorated: true,
        }),
      (baseTemplate: HostTemplate<{ value: Input<string> }>) => baseTemplate,
    );

    const result = await setupCraftDirectiveLogicTest.byRegister(directive, {
      baseLogic: (value: Input<string>) => ({ value }),
      args: [
        function* () {
          return 'directive';
        } as Input<string>,
      ],
      register: {},
    });

    expect(craftUse(result.context.value())).toBe('directive');
    expect(result.context.decorated).toBe(true);
    result.destroy();
  });

  it('mounts directive templates and supports context updates', async () => {
    const directive = craftDirective(
      'conditionalTestDirective',
      { styles: '.directive-root { color: blue; }' },
      (baseLogic) => baseLogic,
      (baseTemplate: HostTemplate<{ visible: Input<boolean> }>) => (context) =>
        craftUse(context.visible()) ? baseTemplate(context) : p('hidden'),
    );
    const baseTemplate: HostTemplate<{ visible: Input<boolean> }> = (
      _context,
    ) => div({ class: 'directive-root' }, 'visible');

    const initialContext: { visible: Input<boolean> } = {
      visible: function* () {
        return true;
      },
    };
    const result = await setupCraftDirectiveTemplateTest.byRegister(directive, {
      baseTemplate,
      context: initialContext,
      register: {},
    });

    expect(result.nativeElement.textContent).toBe('visible');
    result.updateContext({
      visible: function* () {
        return false;
      },
    });
    expect(result.nativeElement.textContent).toBe('hidden');
    result.destroy();
  });
});
