// @vitest-environment jsdom
import { craftSignal as signal } from '@craft-ts/core';
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  craftService,
  craftUse,
  overrideService,
  setupCraftServiceTestingByRegister,
} from '@craft-ts/core';
import { craftComponent } from './component';
import { craftDirective } from './directive';
import { div, button, input, label, p, span } from './hyperscript';
import { ifNode } from './if-node';
import { forNode } from './for-node';
import { markYieldableValue } from '@craft-ts/core';
import {
  renderCraftComponent,
  setupCraftComponentTemplateTest,
  setupCraftDirectiveTemplateTest,
} from './testing';
import type { Input } from './types';
import type { NamedYieldableValue } from '@craft-ts/core';
import type { LocatorContentNamesFor } from './locator';

describe('Craft component and directive testing utilities', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('tests the service a component provides, on its own', async () => {
    const { LogicDependency } = craftService(
      { name: 'LogicDependency', providedIn: 'function' },
      () => ({ value: 'real' }),
    );
    const { LogicTestView, provideLogicTestView } = craftService(
      { name: 'logicTestView', providedIn: 'toProvide' },
      function* (inputs: { readonly label: Input<string> }) {
        const { label } = inputs;

        const dependency = yield* LogicDependency();
        return { label, dependency };
      },
    );

    const { sut, mocks, injector } = await setupCraftServiceTestingByRegister(
      LogicTestView,
      {
        logicTestView: provideLogicTestView(),
        LogicDependency: { value: 'mock' },
      },
      {
        bindings: {
          label: function* () {
            return 'logic';
          } as Input<string>,
        },
      },
    );

    expect(craftUse(sut.label())).toBe('logic');
    expect(sut.dependency.value).toBe('mock');
    expect(mocks.LogicDependency).toBeDefined();
    injector.destroy();
  });

  it('tests a template against a mocked service and mocked child services', async () => {
    const { ChildDependency } = craftService(
      { name: 'ChildDependency', providedIn: 'function' },
      () => ({ label: 'child' }),
    );
    const { TemplateChildView, provideTemplateChildView } = craftService(
      { name: 'templateChildView', providedIn: 'toProvide' },
      function* () {
        return { dependency: yield* ChildDependency() };
      },
    );

    const child = craftComponent(
      'templateChild',
      { providers: [provideTemplateChildView()] },
      function* () {
        const { dependency } = yield* TemplateChildView();
        return span(dependency.label);
      },
    );
    const { TemplateTestView, provideTemplateTestView } = craftService(
      { name: 'templateTestView', providedIn: 'toProvide' },
      () => ({ label: 'real label' }),
    );

    const component = craftComponent(
      'templateTestComponent',
      {
        providers: [provideTemplateTestView()],
        styles: '.template-root { color: red; }',
      },
      function* () {
        const { label } = yield* TemplateTestView();
        return div({ class: 'template-root' }, [p(label), child()]);
      },
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      inputs: {},
      register: {
        // The component's own service is what a template test replaces now.
        templateTestView: { label: 'mocked label' },
        ChildDependency: { label: 'mock child' },
        templateChildView: 'provided',
      },
    });
    expect(result.nativeElement.textContent).toContain('mocked label');
    expect(result.nativeElement.textContent).toContain('mock child');
    expect(result.nativeElement.querySelector('.template-root')).not.toBeNull();
    expect(document.querySelector('style[data-craft-sheet]')).not.toBeNull();
    result.destroy();
    expect(result.nativeElement.textContent).toBe('');
    expect(document.querySelector('style[data-craft-sheet]')).toBeNull();
  });

  it('finds controls by role and accessible name', async () => {
    const { RoleLocatorPageView, provideRoleLocatorPageView } = craftService(
      { name: 'roleLocatorPageView', providedIn: 'toProvide' },
      () => ({}),
    );

    const Page = craftComponent(
      'roleLocatorPage',
      { providers: [provideRoleLocatorPageView()] },
      function* () {
        yield* RoleLocatorPageView();
        return [
          label({ htmlFor: 'email' }, 'Email'),
          input({ id: 'email', type: 'email' }),
          label({ htmlFor: 'save-button' }, 'Save'),
          button({ id: 'save-button', type: 'button' }, 'Save'),
          button({ type: 'button' }, 'Cancel'),
        ];
      },
    );
    const result = await setupCraftComponentTemplateTest(Page, {
      inputs: {},
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
    const { LocatorChildView, provideLocatorChildView } = craftService(
      { name: 'locatorChildView', providedIn: 'toProvide' },
      () => ({}),
    );

    const child = craftComponent(
      'locatorChild',
      { providers: [provideLocatorChildView()] },
      function* () {
        yield* LocatorChildView();
        return button({ class: 'child', 'data-testid': 'child' }, 'Child');
      },
    );
    const { LocatorView, provideLocatorView } = craftService(
      { name: 'locatorView', providedIn: 'toProvide' },
      () => ({}),
    );

    const component = craftComponent(
      'locatorComponent',
      { providers: [provideLocatorView()] },
      function* () {
        yield* LocatorView();
        return div([
          button({ class: 'save primary', 'data-testid': 'save' }, 'Save'),
          input({ attrs: { 'aria-label': 'Search' } }),
          child(),
        ]);
      },
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      inputs: {},
      register: { locatorChildView: 'provided' },
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
    const { BrandedContentLocatorView, provideBrandedContentLocatorView } =
      craftService(
        { name: 'brandedContentLocatorView', providedIn: 'toProvide' },
        () => ({ brandedStatus }),
      );

    const component = craftComponent(
      'brandedContentLocatorComponent',
      { providers: [provideBrandedContentLocatorView()] },
      function* () {
        const { brandedStatus } = yield* BrandedContentLocatorView();
        return div([span(brandedStatus)]);
      },
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      inputs: { brandedStatus },
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
    result.updateInputs({ brandedStatus });
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
    const {
      ConditionalBrandedContentLocatorView,
      provideConditionalBrandedContentLocatorView,
    } = craftService(
      { name: 'conditionalBrandedContentLocatorView', providedIn: 'toProvide' },
      () => ({ visible, brandedStatus }),
    );

    const component = craftComponent(
      'conditionalBrandedContentLocatorComponent',
      { providers: [provideConditionalBrandedContentLocatorView()] },
      function* () {
        const { visible, brandedStatus } =
          yield* ConditionalBrandedContentLocatorView();
        return ifNode(
          visible,
          () => span(brandedStatus),
          () => p('Hidden'),
        );
      },
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      inputs: { visible, brandedStatus },
      register: {},
    });
    const visibleElement = result.locator('span', {
      content: 'brandedStatus',
    });
    expectTypeOf(visibleElement).toEqualTypeOf<HTMLSpanElement | undefined>();
    expect(visibleElement?.textContent).toBe('Visible');

    visible.set(false);
    result.updateInputs({ visible, brandedStatus });
    result.detectChanges();
    expect(
      result.locator('span', { content: 'brandedStatus' }),
    ).toBeUndefined();
    result.destroy();
  });

  it('returns an optional locator for conditional elements and refreshes it', async () => {
    const { ConditionalLocatorView, provideConditionalLocatorView } =
      craftService(
        { name: 'conditionalLocatorView', providedIn: 'toProvide' },
        () => ({ visible: initialVisible }),
      );

    const initialVisible = markYieldableValue(signal(true), 'visible');
    const component = craftComponent(
      'conditionalLocatorComponent',
      { providers: [provideConditionalLocatorView()] },
      function* () {
        const { visible }: { visible: any } = yield* ConditionalLocatorView();
        return ifNode(
          visible,
          () => button({ class: 'conditional' }, 'Conditional'),
          () => p('Hidden'),
        );
      },
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      inputs: { visible: initialVisible },
      register: {},
    });
    const conditional = result.locator('button', { class: 'conditional' });
    expect(conditional?.textContent).toBe('Conditional');

    initialVisible.set(false);
    result.updateInputs({ visible: initialVisible });
    result.detectChanges();
    expect(result.locator('button', { class: 'conditional' })).toBeUndefined();
    result.destroy();
  });

  it('rejects statically repeated targets in the singular locator API', async () => {
    const { AmbiguousLocatorView, provideAmbiguousLocatorView } = craftService(
      { name: 'ambiguousLocatorView', providedIn: 'toProvide' },
      () => ({}),
    );

    const component = craftComponent(
      'ambiguousLocatorComponent',
      { providers: [provideAmbiguousLocatorView()] },
      function* () {
        yield* AmbiguousLocatorView();
        return div([
          button({ class: 'duplicate' }, 'One'),
          button({ class: 'duplicate' }, 'Two'),
        ]);
      },
    );
    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      inputs: {},
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
    const { EachLocatorView, provideEachLocatorView } = craftService(
      { name: 'eachLocatorView', providedIn: 'toProvide' },
      () => ({}),
    );

    const component = craftComponent(
      'eachLocatorComponent',
      { providers: [provideEachLocatorView()] },
      function* () {
        yield* EachLocatorView();
        return forNode(
          [{ id: 1 }, { id: 2 }],
          { track: (item: { id: number }) => item.id },
          () => button({ class: 'row' }, 'Row'),
        );
      },
    );

    const result = await setupCraftComponentTemplateTest.byRegister(component, {
      inputs: {},
      register: {},
    });
    expect(() => result.locator('button', { class: 'row' })).toThrow(
      /exactly one/,
    );
    result.destroy();
  });

  it('replaces a service member for the components a directive is piped on', async () => {
    const { DirectiveCounter, provideDirectiveCounter } = craftService(
      { name: 'directiveCounter', providedIn: 'toProvide' },
      () => ({ label: 'base' }),
    );

    const component = craftComponent(
      'directiveServiceComponent',
      { providers: [provideDirectiveCounter()] },
      function* () {
        const counter = yield* DirectiveCounter();
        return p(counter.label);
      },
    );

    const decorated = component.pipe(
      craftDirective(
        'labelled',
        {},
        {
          service: overrideService(DirectiveCounter, (base) => ({
            ...base,
            label: `${base.label} + directive`,
          })),
        },
      ),
    );

    const result = await renderCraftComponent(decorated as never);
    expect(result.nativeElement.textContent).toBe('base + directive');
    result.destroy();
  });

  it('mounts directive templates and supports input updates', async () => {
    const directive = craftDirective(
      'conditionalTestDirective',
      { styles: '.directive-root { color: blue; }' },
      {
        template:
          (baseTemplate) => (inputs: { readonly visible: Input<boolean> }) =>
            craftUse(inputs.visible()) ? baseTemplate(inputs) : p('hidden'),
      },
    );
    const baseTemplate = (_inputs: { readonly visible: Input<boolean> }) =>
      div({ class: 'directive-root' }, 'visible');

    const result = await setupCraftDirectiveTemplateTest.byRegister(directive, {
      baseTemplate,
      inputs: {
        visible: function* () {
          return true;
        },
      } as { readonly visible: Input<boolean> },
      register: {},
    });

    expect(result.nativeElement.textContent).toBe('visible');
    result.updateInputs({
      visible: function* () {
        return false;
      },
    } as { readonly visible: Input<boolean> });
    expect(result.nativeElement.textContent).toBe('hidden');
    result.destroy();
  });
});
