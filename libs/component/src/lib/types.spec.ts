import { expectTypeOf, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import {
  craftMethod,
  craftComputed,
  craftRoutes,
  craftService,
  provideHostName,
  state,
  type ComponentDepsOf,
  type RouteCheckedDI,
} from '@craft-ng/core';
import { loadCraftComponent } from './bridge';
import { craftComponent } from './component';
import { craftDirective } from './directive';
import { defer } from './defer';
import { angular } from './angular';
import { button, div, p } from './hyperscript';
import type { ComponentNode } from './render/vnode';
import type { ComponentTemplateOf } from './types';
import type {
  SetupTestComponentTemplate,
  TemplateHasElement,
  TemplateHasElementWithProps,
  TemplateHasEvent,
  TemplateHasOutput,
  TemplateHasProperty,
  TemplateHasYieldableEvent,
  TemplateDelegatesToContext,
  TemplateUsesComponent,
} from './template-contract';
import type {
  HostRequiredLogic,
  HostTemplate,
  Input,
  Output,
  PropsOf,
} from './types';
import type { CraftNodeChild } from './render/vnode';
import type { CraftNodeChildrenDependencies } from './render/vnode';

interface User {
  readonly id: number;
  readonly name: string;
}

it('infers component input and output props from the branded context', () => {
  const userCard = craftComponent(
    'userCard',
    {},
    (user: Input<User>, onPick: Output<(user: User) => void>) => ({
      user,
      onPick,
    }),
    ({ user, onPick }) => p({ click: () => onPick(user()) }, user().name),
  );

  type _UserCardProps = Expect<
    Equal<
      PropsOf<typeof userCard>,
      {
        user: () => User;
        onPick: (user: User) => void;
      }
    >
  >;
  expectTypeOf<PropsOf<typeof userCard>>().toEqualTypeOf<{
    user: () => User;
    onPick: (user: User) => void;
  }>();

  userCard({
    user: () => ({ id: 1, name: 'Ada' }),
    onPick: (user) => user.name,
  });

  // @ts-expect-error Input props remain accessors at the call-site.
  userCard({ user: { id: 1, name: 'Ada' }, onPick: () => undefined });
});

it('does not expose ordinary context callbacks as component outputs', () => {
  const internalAction = craftComponent(
    'internalAction',
    {},
    (name: Input<string>) => ({
      name,
      reset: () => undefined,
    }),
    ({ name }) => p(name()),
  );

  type _InternalActionProps = Expect<
    Equal<PropsOf<typeof internalAction>, { name: () => string }>
  >;
  expectTypeOf(internalAction).toBeFunction();
  expectTypeOf<PropsOf<typeof internalAction>>().toEqualTypeOf<{
    name: () => string;
  }>();
});

it('carries inferred dependencies from the component through the lazy route fragment', () => {
  const { TypeSpecService } = craftService(
    { name: 'TypeSpecService', scope: 'toProvide' },
    () => ({ value: 'tracked' }),
  );

  const trackedComponent = craftComponent(
    'trackedComponent',
    {},
    function* (label: Input<string>) {
      const service = yield* TypeSpecService();
      return { label, service };
    },
    ({ label, service }) => p(`${label()}: ${service.value}`),
  );

  const lazyFragment = loadCraftComponent(async () => trackedComponent);
  const { typeSpecRoutes } = craftRoutes('typeSpec', [
    { path: ':label', ...lazyFragment },
  ]);

  type ComponentDependencies = ComponentDepsOf<typeof trackedComponent>;
  type LazyDependencies = ComponentDepsOf<typeof lazyFragment>;
  type RawRouteDependencies = ComponentDepsOf<
    (typeof typeSpecRoutes._routes)[0]
  >;

  type _DependencyWasInferred = Expect<
    'TypeSpecService' extends keyof ComponentDependencies['deps'] ? true : false
  >;
  type _OnlyExpectedDependencyWasInferred = Expect<
    Equal<keyof ComponentDependencies['deps'], 'TypeSpecService'>
  >;
  type _PublicInputWasInferred = Expect<
    Equal<keyof ComponentDependencies['publicProperties'], 'label'>
  >;
  type _LazyFragmentPreservesDependencies = Expect<
    Equal<LazyDependencies, ComponentDependencies>
  >;
  type _RawRoutePreservesDependencies = Expect<
    'TypeSpecService' extends keyof RawRouteDependencies['deps'] ? true : false
  >;
  type _DependencyScopeWasPreserved = Expect<
    Equal<
      ComponentDependencies['deps']['TypeSpecService']['scope'],
      'toProvide'
    >
  >;
  type _NoProvidersWereInferred = Expect<
    Equal<keyof ComponentDependencies['provided'], never>
  >;
  type _MissingProviderWasDetected = Expect<
    Equal<
      RouteCheckedDI<
        ComponentDependencies,
        never,
        never,
        'this component',
        'label'
      >,
      ['The TypeSpecService service is not provided in this component']
    >
  >;
  type _ProvidedDependencyPasses = Expect<
    Equal<
      RouteCheckedDI<
        ComponentDependencies,
        'TypeSpecService',
        never,
        'this component',
        'label'
      >,
      true
    >
  >;
  expectTypeOf<LazyDependencies>().toEqualTypeOf<ComponentDependencies>();
});

it('does not infer component dependencies from an unbranded value', () => {
  expectTypeOf<
    ComponentDepsOf<{ readonly value: string }>
  >().toEqualTypeOf<{}>();
});

it('does not treat unbranded Angular providers as Craft service providers', () => {
  const { MissingProvider } = craftService(
    { name: 'MissingProvider', scope: 'toProvide' },
    () => ({ value: 'missing' }),
  );

  const component = craftComponent(
    'unbrandedProviderComponent',
    { providers: [provideHostName('component:unbrandedProviderComponent')] },
    function* () {
      const service = yield* MissingProvider();
      return { service };
    },
    ({ service }) => p(service.value),
  );

  type ComponentDependencies = ComponentDepsOf<typeof component>;
  type _MissingProviderWasPreserved = Expect<
    Equal<keyof ComponentDependencies['missingProvider'], 'MissingProvider'>
  >;
  type _MissingProviderFailsRouteCheck = Expect<
    Equal<
      RouteCheckedDI<ComponentDependencies, never, never, 'this component'>,
      ['The MissingProvider service is not provided in this component']
    >
  >;
});

it('includes dependencies of Craft components rendered in nested templates', () => {
  const { TemplateDependency } = craftService(
    { name: 'TemplateDependency', scope: 'toProvide' },
    () => ({ value: 'template' }),
  );

  const child = craftComponent(
    'templateDependencyChild',
    {},
    function* () {
      const service = yield* TemplateDependency();
      return { service };
    },
    ({ service }) => p(service.value),
  );

  const nestedNode = div([p('before'), child({}), p('after')]);
  type NestedNodeDependencies = CraftNodeChildrenDependencies<
    typeof nestedNode
  >;
  type _NestedNodeDependencyWasPreserved = Expect<
    Equal<keyof NestedNodeDependencies['missingProvider'], 'TemplateDependency'>
  >;

  const parent = craftComponent(
    'templateDependencyParent',
    {},
    () => ({}),
    () => nestedNode,
  );

  type ParentDependencies = ComponentDepsOf<typeof parent>;
  type _ChildDependencyWasPropagated = Expect<
    Equal<keyof ParentDependencies['missingProvider'], 'TemplateDependency'>
  >;
});

it('infers public inputs added by a piped directive', () => {
  const withPermission = craftDirective(
    'withPermission',
    {},
    (baseLogic: HostRequiredLogic<{ user: Input<User> }>) =>
      (user: Input<User>, permission: Input<string>) => ({
        ...baseLogic(user),
        permission,
      }),
    (
      baseTemplate: HostTemplate<{
        user: Input<User>;
        permission: Input<string>;
      }>,
    ) => baseTemplate,
  );

  const card = craftComponent(
    'card',
    {},
    (user: Input<User>) => ({ user }),
    ({ user }) => p(user().name),
  ).pipe(withPermission);

  expectTypeOf<PropsOf<typeof card>>().toEqualTypeOf<{
    user: () => User;
    permission: () => string;
  }>();
  card({
    user: () => ({ id: 1, name: 'Ada' }),
    permission: () => 'edit',
  });
});

it('preserves template dependencies when Craft directives are applied', () => {
  const { DirectiveTemplateDependency } = craftService(
    { name: 'DirectiveTemplateDependency', scope: 'toProvide' },
    () => ({ value: 'directive-template' }),
  );

  const child = craftComponent(
    'directiveTemplateDependencyChild',
    {},
    function* () {
      const service = yield* DirectiveTemplateDependency();
      return { service };
    },
    ({ service }) => p(service.value),
  );

  const withTemplate = craftDirective(
    'withTemplate',
    {},
    (baseLogic) => baseLogic,
    (baseTemplate) => (context) => baseTemplate(context),
  );

  const piped = craftComponent(
    'directiveTemplateDependencyParent',
    {},
    () => ({}),
    () => div([child({})]),
  ).pipe(withTemplate);

  const nodePiped = craftComponent(
    'nodeDirectiveTemplateDependencyParent',
    {},
    () => ({}),
    () => div([child({})]).pipe(withTemplate),
  );

  type PipedDependencies = ComponentDepsOf<typeof piped>;
  type NodePipedDependencies = ComponentDepsOf<typeof nodePiped>;
  type _PipedDependencyWasPropagated = Expect<
    Equal<
      keyof PipedDependencies['missingProvider'],
      'DirectiveTemplateDependency'
    >
  >;
  type _NodePipedDependencyWasPropagated = Expect<
    Equal<
      keyof NodePipedDependencies['missingProvider'],
      'DirectiveTemplateDependency'
    >
  >;
});

it('accepts manually described element children without a pipe method', () => {
  const descriptor: CraftNodeChild = {
    kind: 'element',
    tag: 'dl',
    props: {},
    children: [
      {
        kind: 'element',
        tag: 'dt',
        props: {},
        children: 'Report generated at',
      },
    ],
  };

  expectTypeOf(descriptor).toMatchTypeOf<CraftNodeChild>();
});

it('resolves registered child templates without a runtime test harness', () => {
  const icon = craftComponent(
    'contractIcon',
    {},
    () => ({}),
    () => p('icon'),
  );
  const parent = craftComponent(
    'contractParent',
    {},
    () => ({}),
    () => div([icon()]),
  );

  type Contract = SetupTestComponentTemplate<typeof parent, [typeof icon]>;
  type _ContractIsValid = Expect<Equal<Contract['valid'], true>>;
  type _RootElementIsFound = Expect<
    Equal<
      TemplateHasElement<ReturnType<ComponentTemplateOf<typeof parent>>, 'div'>,
      true
    >
  >;
});

it('reports a missing child component in the type-only template contract', () => {
  const missing = craftComponent(
    'contractMissing',
    {},
    () => ({}),
    () => p('missing'),
  );
  const parent = craftComponent(
    'contractMissingParent',
    {},
    () => ({}),
    () => div([missing()]),
  );

  type Contract = SetupTestComponentTemplate<typeof parent, []>;
  type _MissingComponentIsDiagnosed = Expect<
    Contract extends { readonly error: string } ? true : false
  >;
});

it('keeps exact child component references and validates their props', () => {
  const child = craftComponent(
    'contractPropsChild',
    {},
    (value: Input<number>) => ({ value }),
    ({ value }) => p(String(value())),
  );
  const node = child({ value: () => 1 });
  const parent = craftComponent(
    'contractPropsParent',
    {},
    () => ({}),
    () => node,
  );

  type _ReferenceIsExact = Expect<
    Equal<(typeof node)['component'], typeof child>
  >;
  type Contract = SetupTestComponentTemplate<typeof parent, [typeof child]>;
  type _ContractIsValid = Expect<Equal<Contract['valid'], true>>;
  type _UsesExactChild = Expect<
    Equal<
      TemplateUsesComponent<
        ReturnType<ComponentTemplateOf<typeof parent>>,
        typeof child
      >,
      true
    >
  >;

  const exactPropsNode = div({ class: 'contract' }, 'content');
  type _ExactProps = Expect<
    Equal<
      TemplateHasElementWithProps<
        typeof exactPropsNode,
        'div',
        { class: string }
      >,
      true
    >
  >;

  const invalidNode = {
    kind: 'component',
    component: child,
    props: {},
  } as ComponentNode<{}, {}, typeof child>;
  const invalidParent = craftComponent(
    'contractInvalidPropsParent',
    {},
    () => ({}),
    () => invalidNode,
  );
  type InvalidContract = SetupTestComponentTemplate<
    typeof invalidParent,
    [typeof child]
  >;
  type _InvalidPropsAreDiagnosed = Expect<
    InvalidContract extends { readonly error: string } ? true : false
  >;
});

it('keeps event arguments and yieldable callback shapes in template assertions', () => {
  function* click(event: MouseEvent) {
    return event.clientX;
  }

  const node = div({ click }, 'click');
  type _EventSignature = Expect<
    Equal<TemplateHasEvent<typeof node, 'div', 'click', typeof click>, true>
  >;
  type _YieldableEventSignature = Expect<
    Equal<
      TemplateHasYieldableEvent<typeof node, 'div', 'click', [MouseEvent]>,
      true
    >
  >;
});

it('keeps yieldable primitive properties in template VNodes', () => {
  const component = craftComponent(
    'contextPropertyBinding',
    {},
    () => ({
      disabled: craftMethod('disabled', function* () {
        return true;
      }).disabled,
      enabled: craftMethod('enabled', function* () {
        return true;
      }).enabled,
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

  type Template = ReturnType<ComponentTemplateOf<typeof component>>;
  type _PropertyDelegatesToContext = Expect<
    Equal<
      TemplateDelegatesToContext<Template, 'button', 'disabled', 'disabled'>,
      true
    >
  >;
  type _PropertyDoesNotDelegateToAnotherMember = Expect<
    Equal<
      TemplateDelegatesToContext<Template, 'button', 'disabled', 'enabled'>,
      false
    >
  >;

  const nestedComponent = craftComponent(
    'nestedContextPropertyBinding',
    {},
    () => ({
      counter: {
        disabled: craftMethod('disabled', function* () {
          return true;
        }).disabled,
      },
    }),
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
  type NestedTemplate = ReturnType<ComponentTemplateOf<typeof nestedComponent>>;
  type _NestedPropertyDelegatesToContext = Expect<
    Equal<
      TemplateDelegatesToContext<
        NestedTemplate,
        'button',
        'disabled',
        'counter.disabled'
      >,
      true
    >
  >;

  const derivedStateComponent = craftComponent(
    'derivedStatePropertyBinding',
    {},
    function* () {
      const { counter } = yield* state('counter', 0, ({ state }) => ({
        disabled: craftComputed('disabled', () => state() % 2 === 0).disabled,
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
  type DerivedTemplate = ReturnType<
    ComponentTemplateOf<typeof derivedStateComponent>
  >;
  type _DerivedStateUsesContextValue = Expect<
    Equal<
      TemplateDelegatesToContext<
        DerivedTemplate,
        'button',
        'disabled',
        'counter.disabled'
      >,
      true
    >
  >;
});

it('diagnoses imperative callbacks when the template contract is requested', () => {
  const imperative = div({ click: () => undefined }, 'click');
  const parent = craftComponent(
    'contractImperativeCallbackParent',
    {},
    () => ({}),
    () => imperative,
  );

  type Contract = SetupTestComponentTemplate<typeof parent>;
  type _ImperativeCallbackIsDiagnosed = Expect<
    Contract extends { readonly error: string } ? true : false
  >;
});

it('checks output callback arguments on a child component', () => {
  const child = craftComponent(
    'contractOutputChild',
    {},
    (onSelected: Output<(id: number) => void>) => ({ onSelected }),
    ({ onSelected }) => p('child'),
  );
  const onSelected = function* (id: number) {
    return id;
  };
  const parent = craftComponent(
    'contractOutputParent',
    {},
    () => ({}),
    () => child({ onSelected }),
  );

  type _OutputSignature = Expect<
    Equal<
      TemplateHasOutput<
        ReturnType<ComponentTemplateOf<typeof parent>>,
        typeof child,
        'onSelected',
        typeof onSelected
      >,
      true
    >
  >;
});

it('diagnoses imperative output callbacks in the template contract', () => {
  const child = craftComponent(
    'contractImperativeOutputChild',
    {},
    (onSelected: Output<(id: number) => void>) => ({ onSelected }),
    () => p('child'),
  );
  const parent = craftComponent(
    'contractImperativeOutputParent',
    {},
    () => ({}),
    () => child({ onSelected: (id: number) => id }),
  );

  type Contract = SetupTestComponentTemplate<typeof parent, [typeof child]>;
  type _ImperativeOutputIsDiagnosed = Expect<
    Contract extends { readonly error: string } ? true : false
  >;
});

it('resolves the component loaded by defer in the type-only contract', () => {
  const child = craftComponent(
    'contractDeferredChild',
    {},
    () => ({}),
    () => p('deferred'),
  );
  const deferred = defer(async () => child);
  const parent = craftComponent(
    'contractDeferredParent',
    {},
    () => ({}),
    () => deferred,
  );

  type Missing = SetupTestComponentTemplate<typeof parent>;
  type _DeferredChildIsDiagnosed = Expect<
    Missing extends { readonly error: string } ? true : false
  >;
  type Registered = SetupTestComponentTemplate<typeof parent, [typeof child]>;
  type _RegisteredDeferredChildIsValid = Expect<
    Equal<Registered['valid'], true>
  >;
});

it('reports dynamic component unions and conditional branch failures', () => {
  const first = craftComponent(
    'contractDynamicFirst',
    {},
    () => ({}),
    () => p('first'),
  );
  const second = craftComponent(
    'contractDynamicSecond',
    {},
    () => ({}),
    () => p('second'),
  );
  const dynamic = {
    kind: 'component',
    component: (true ? first : second) as typeof first | typeof second,
    props: {},
  } as ComponentNode<{}, {}, typeof first | typeof second>;
  const dynamicParent = craftComponent(
    'contractDynamicParent',
    {},
    () => ({}),
    () => dynamic,
  );

  type DynamicContract = SetupTestComponentTemplate<
    typeof dynamicParent,
    [typeof first, typeof second]
  >;
  type _DynamicComponentIsDiagnosed = Expect<
    DynamicContract extends { readonly error: string } ? true : false
  >;

  const missingBranch = craftComponent(
    'contractBranchMissing',
    {},
    () => ({}),
    () => p('missing branch'),
  );
  const branchParent = craftComponent(
    'contractBranchParent',
    {},
    () => ({}),
    () => (true ? p('ok') : missingBranch()),
  );
  type BranchContract = SetupTestComponentTemplate<typeof branchParent>;
  type _BranchFailureIsDiagnosed = Expect<
    BranchContract extends { readonly error: string } ? true : false
  >;
});

it('reports Angular component boundaries instead of introspecting them', () => {
  class ExternalAngularComponent {}
  const parent = craftComponent(
    'contractAngularBoundaryParent',
    {},
    () => ({}),
    () => angular(ExternalAngularComponent),
  );

  type Contract = SetupTestComponentTemplate<typeof parent>;
  type _AngularBoundaryIsDiagnosed = Expect<
    Contract extends { readonly error: string } ? true : false
  >;
});
