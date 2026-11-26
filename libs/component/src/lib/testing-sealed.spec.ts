// @vitest-environment jsdom
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  craftExpose,
  craftService,
  craftSignal as signal,
  markYieldableValue,
  type NamedYieldableValue,
} from '@craft-ts/core';
import {
  button,
  craftComponent,
  div,
  sealComponent,
  span,
  type CraftComponent,
  type CraftComponentTemplateDepsOf,
  type LocatorContentNamesFor,
  type PropsFromFactory,
} from '../index';
import { setupCraftComponentTemplateTest } from './testing';

// What a template test keeps and loses when a component is sealed
// (follow-up of issue #40). The register — what a test must mock — never
// changes; only locators reaching *into* a sealed template stop there.

const { ChildDependency } = craftService(
  { name: 'ChildDependency', providedIn: 'function' },
  function* () {
    yield* craftExpose('label', 'child');
  },
);
const { SealedTestChildView, provideSealedTestChildView } = craftService(
  { name: 'sealedTestChildView', providedIn: 'toProvide' },
  function* () {
    yield* craftExpose('dependency', yield* ChildDependency());
  },
);
const Child = craftComponent(
  'SealedTestChild',
  { providers: [provideSealedTestChildView()] },
  function* () {
    const { dependency } = yield* SealedTestChildView();
    return span(dependency.label);
  },
);
const SealedChild = sealComponent(Child);

const { SealedTestParentView, provideSealedTestParentView } = craftService(
  { name: 'sealedTestParentView', providedIn: 'toProvide' },
  function* () {
    yield* craftExpose('label', 'parent');
  },
);
const WithChild = craftComponent(
  'SealedTestWithChild',
  { providers: [provideSealedTestParentView()] },
  function* () {
    const { label } = yield* SealedTestParentView();
    return div([button({ class: 'save' }, label), Child()]);
  },
);
const WithSealedChild = craftComponent(
  'SealedTestWithSealedChild',
  { providers: [provideSealedTestParentView()] },
  function* () {
    const { label } = yield* SealedTestParentView();
    return div([button({ class: 'save' }, label), SealedChild()]);
  },
);

type RegisterNames<Component> =
  keyof CraftComponentTemplateDepsOf<Component>['deps'];

describe('template tests and sealed components', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('asks for the same register with a sealed child', async () => {
    expectTypeOf<RegisterNames<typeof WithSealedChild>>().toEqualTypeOf<
      RegisterNames<typeof WithChild>
    >();
    expectTypeOf<RegisterNames<typeof WithSealedChild>>().toEqualTypeOf<
      'ChildDependency' | 'sealedTestChildView' | 'sealedTestParentView'
    >();
    expectTypeOf<RegisterNames<typeof SealedChild>>().toEqualTypeOf<
      RegisterNames<typeof Child>
    >();

    const result = await setupCraftComponentTemplateTest.byRegister(
      WithSealedChild,
      {
        inputs: {},
        register: {
          sealedTestParentView: { label: 'mocked parent' },
          ChildDependency: { label: 'mocked child' },
          sealedTestChildView: 'provided',
        },
      },
    );
    expect(result.nativeElement.textContent).toContain('mocked parent');
    expect(result.nativeElement.textContent).toContain('mocked child');
    // Locating by tag or attribute does not read the template's types.
    expectTypeOf(
      result.locator('button', { class: 'save' }),
    ).toEqualTypeOf<HTMLButtonElement>();
    result.destroy();
  });

  it('stops content locators at a sealed boundary', async () => {
    const raw = signal('Saved');
    const sealedStatus = markYieldableValue(
      raw,
      'sealedStatus',
    ) as NamedYieldableValue<'sealedStatus', typeof raw>;
    const { SealedStatusView, provideSealedStatusView } = craftService(
      { name: 'sealedStatusView', providedIn: 'toProvide' },
      function* () {
        yield* craftExpose('sealedStatus', sealedStatus);
      },
    );
    const Status = craftComponent(
      'SealedTestStatus',
      { providers: [provideSealedStatusView()] },
      function* () {
        const { sealedStatus } = yield* SealedStatusView();
        return div([span(sealedStatus)]);
      },
    );
    const SealedStatus = sealComponent(Status);

    expectTypeOf<
      LocatorContentNamesFor<typeof Status, 'span'>
    >().toEqualTypeOf<'sealedStatus'>();
    // Test a component before sealing it: the sealed type no longer knows
    // what its template renders.
    expectTypeOf<
      LocatorContentNamesFor<typeof SealedStatus, 'span'>
    >().toBeNever();

    const result = await setupCraftComponentTemplateTest.byRegister(
      SealedStatus,
      { inputs: {}, register: { sealedStatusView: 'provided' } },
    );
    // This branch exists only to assert the type error.
    if (false) {
      // @ts-expect-error the sealed template's content is not visible.
      result.locator('span', { content: 'sealedStatus' });
    }
    result.destroy();
  });

  it('refuses every register for a child typed by hand', () => {
    const Erased: CraftComponent<PropsFromFactory<() => never>> = Child;
    const WithErasedChild = craftComponent(
      'SealedTestWithErasedChild',
      { providers: [provideSealedTestParentView()] },
      function* () {
        const { label } = yield* SealedTestParentView();
        return div([button({ class: 'save' }, label), Erased()]);
      },
    );

    // The child's services can no longer be named: they used to vanish from
    // the register, and the test compiled without deciding about them.
    if (false) {
      void setupCraftComponentTemplateTest.byRegister(WithErasedChild, {
        inputs: {},
        // @ts-expect-error the unknown contract cannot be registered away.
        register: { sealedTestParentView: 'provided' },
      });
      void setupCraftComponentTemplateTest.byRegister(WithErasedChild, {
        inputs: {},
        register: {
          sealedTestParentView: 'provided',
          // @ts-expect-error not even as 'real'.
          'unknown component dependency contract (not a component, or a component typed by hand; seal it with sealComponent(Component) instead)':
            'real',
        },
      });
    }
  });
});
