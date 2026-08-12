import { expectTypeOf, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import { computed } from '@angular/core';
import {
  craftMethod,
  craftRoutes,
  craftService,
  insertSelect,
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
import { ifBlock } from './if-block';
import { each } from './each';
import { button, div, h2, input, li, p, section, span } from './hyperscript';
import { content, renderContent } from './project';
import { craftTemplate, renderTemplate } from './template';
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
  TemplateNamedElementIdentity,
  TemplateRendersNamedElementWhen,
  TemplateRendersStateWhen,
  TemplateRenderAvailableActionWhen,
} from './template-contract';
import type {
  ContentSlot,
  HostRequiredLogic,
  HostTemplate,
  Input,
  Output,
  ProjectionContractOf,
  ProjectionOf,
  PropsOf,
  RequiredContent,
} from './types';
import type { CraftNodeChild } from './render/vnode';
import type { CraftNodeChildrenDependencies } from './render/vnode';

interface User {
  readonly id: number;
  readonly name: string;
}

it('types named elements without children as empty', () => {
  const namedInput = input('namedInputWithoutChildren', {});

  type _NamedInputHasNoChildren = Expect<
    Equal<typeof namedInput.children, readonly []>
  >;
});

it('derives named element identities for editor completion', () => {
  const component = craftComponent(
    'namedIdentityCompletionComponent',
    {},
    () => ({}),
    () => input('queryInput', {}),
  );

  type _NamedElementIdentity = Expect<
    Equal<
      TemplateNamedElementIdentity<ComponentTemplateOf<typeof component>>,
      'namedIdentityCompletionComponent:input:queryInput'
    >
  >;
});

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

it('extracts projection contracts and propagates projected dependencies', () => {
  type ActionContract = {
    readonly kind: 'action';
    readonly trigger: () => void;
  };
  const { BadgeService, provideBadgeService } = craftService(
    { name: 'BadgeService', scope: 'toProvide' },
    () => ({ label: 'badge' }),
  );
  const badge = craftComponent(
    'projectedBadge',
    {},
    function* () {
      const service = yield* BadgeService();
      return { service };
    },
    ({ service }) => p(service.label),
  );
  const action = craftComponent(
    'typedAction',
    {},
    (input: { readonly key: string; readonly trigger: () => void }) => ({
      key: input.key,
      contract: {
        kind: 'action',
        trigger: input.trigger,
      } satisfies ActionContract,
    }),
    ({ contract }) => button({ click: contract.trigger }, 'action'),
  );
  type _Contract = Expect<
    Expect<
      ProjectionContractOf<typeof action> extends ActionContract ? true : false
    >
  >;
  const projectedAction: ProjectionOf<typeof action> = action({
    key: 'save',
    trigger: () => undefined,
  });
  expectTypeOf(projectedAction).toMatchTypeOf<ProjectionOf<typeof action>>();

  const card = craftComponent(
    'typedCard',
    {
      contentStyles: { body: ':scope { color: red; }' },
    },
    (input: {
      readonly body: RequiredContent<{
        readonly selector: {
          readonly tag: 'div';
          readonly class: 'card-body';
        };
      }>;
    }) => input,
    ({ body }) => section(renderContent('body', body)),
  );
  const parent = craftComponent(
    'projectingParent',
    {},
    () => ({}),
    () =>
      card({
        body: content(() => [div({ class: 'card-body' }), badge({})]),
      }),
  );

  type ParentDependencies = ComponentDepsOf<typeof parent>;
  type _ProjectedDependencyWasPropagated = Expect<
    Equal<keyof ParentDependencies['missingProvider'], 'BadgeService'>
  >;

  // @ts-expect-error the required body slot is missing.
  card({});

  const providedParent = craftComponent(
    'providedProjectingParent',
    { providers: [provideBadgeService()] },
    () => ({}),
    () =>
      card({
        body: () => [div({ class: 'card-body' }), badge({})],
      }),
  );
  type ProvidedDependencies = ComponentDepsOf<typeof providedParent>;
  type _ProvidedProjectedDependencyWasResolved = Expect<
    Equal<keyof ProvidedDependencies['missingProvider'], never>
  >;

  const consumerProvidedCard = craftComponent(
    'consumerProvidedTypedCard',
    { providers: [provideBadgeService()] },
    (input: { readonly body: ContentSlot }) => input,
    ({ body }) => section(renderContent('body', body)),
  );
  const parentWithoutProvider = craftComponent(
    'parentWithoutProjectedProvider',
    {},
    () => ({}),
    () =>
      consumerProvidedCard({
        body: () => badge({}),
      }),
  );
  type ConsumerOnlyDependencies = ComponentDepsOf<typeof parentWithoutProvider>;
  type _ConsumerProviderDoesNotSatisfyProjection = Expect<
    Equal<keyof ConsumerOnlyDependencies['missingProvider'], 'BadgeService'>
  >;
});

it('checks the declared selector contract for projected content', () => {
  const card = craftComponent(
    'selectorContractCard',
    { contentStyles: { body: ':scope { display: block; }' } },
    (input: {
      readonly body: RequiredContent<{
        readonly selector: {
          readonly tag: 'div';
          readonly class: 'card-body';
          readonly 'data-slot': 'body';
        };
      }>;
    }) => input,
    ({ body }) => renderContent('body', body),
  );

  const validParent = craftComponent(
    'selectorContractValidParent',
    {},
    () => ({}),
    () =>
      card({
        body: content(() => div({ class: 'card-body', 'data-slot': 'body' })),
      }),
  );

  expectTypeOf(validParent).toBeFunction();

  const invalidParent = craftComponent(
    'selectorContractInvalidParent',
    {},
    () => ({}),
    () =>
      card({
        // @ts-expect-error the projected content must contain div.card-body[data-slot="body"].
        body: content(() => div({ class: 'wrong-class' })),
      }),
  );

  expectTypeOf(invalidParent).toBeFunction();
});

it('checks reusable template contexts at every render site', () => {
  const row = craftTemplate<{
    readonly $implicit: User;
    readonly index: number;
  }>(({ $implicit: user, index }) => li(`${index}: ${user.name}`));

  renderTemplate(row, { $implicit: { id: 1, name: 'Ada' }, index: 0 });
  // @ts-expect-error the template context must provide both fields.
  renderTemplate(row, { $implicit: { id: 1, name: 'Ada' } });
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

it('keeps ComponentDepsOf stable for conditional-type edge cases', () => {
  expectTypeOf<ComponentDepsOf<unknown>>().toEqualTypeOf<{}>();
  expectTypeOf<ComponentDepsOf<never>>().toBeNever();
  expectTypeOf<ComponentDepsOf<any>>().toEqualTypeOf<object | {}>();

  const first = craftComponent(
    'componentDepsUnionFirst',
    {},
    () => ({}),
    () => p('first'),
  );
  const second = craftComponent(
    'componentDepsUnionSecond',
    {},
    () => ({}),
    () => p('second'),
  );

  type FirstDeps = ComponentDepsOf<typeof first>;
  type SecondDeps = ComponentDepsOf<typeof second>;

  expectTypeOf<ComponentDepsOf<typeof first | typeof second>>().toEqualTypeOf<
    FirstDeps | SecondDeps
  >();
  expectTypeOf<
    ComponentDepsOf<typeof first | { readonly value: string }>
  >().toEqualTypeOf<FirstDeps | {}>();
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
        { class: 'contract' }
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
      }),
      enabled: craftMethod('enabled', function* () {
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
        }),
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
      const counter = yield* state('counter', 0, ({ state }) => ({
        disabled: computed(() => state() % 2 === 0),
      }));
      return { counter };
    },
    ({ counter }) =>
      button(
        {
          disabled: () => counter.disabled(),
        },
        '+',
      ),
  );
  type DerivedTemplate = ReturnType<
    ComponentTemplateOf<typeof derivedStateComponent>
  >;
  type _DerivedStateUsesContextValue = Expect<
    Equal<TemplateRendersStateWhen<DerivedTemplate, 'counter.disabled'>, true>
  >;

  const directStateComponent = craftComponent(
    'directStateContext',
    {},
    () =>
      state('counter', 0, ({ update }) => ({
        increment: () => update((value) => value + 1),
      })),
    (counter) => {
      const current: number = counter();
      return button({ click: counter.increment }, `${current}`);
    },
  );
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
    // eslint-disable-next-line no-constant-condition -- this fixture preserves a union of both branches.
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
    // eslint-disable-next-line no-constant-condition -- this fixture checks conditional branch diagnostics.
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

it('tracks named elements through conditional template branches', () => {
  const component = craftComponent(
    'namedContractComponent',
    {},
    function* () {
      const isAuth = yield* state(
        'isAuth',
        computed(() => true),
      );
      return { isAuth };
    },
    ({ isAuth }) =>
      ifBlock(
        isAuth,
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
        () => p('signed out'),
      ),
  );

  type Template = ReturnType<ComponentTemplateOf<typeof component>>;
  type _VisibleElement = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        Template,
        'namedContractComponent:button:increment',
        { when: { isAuth: true } }
      >,
      true
    >
  >;
  type _WrongVisibilityDoesNotMatch = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        Template,
        'namedContractComponent:button:increment',
        { when: { isAuth: false } }
      >,
      false
    >
  >;
});

it('tracks rendered state reads through conditional template branches', () => {
  const component = craftComponent(
    'renderedStateContractComponent',
    {},
    function* () {
      const isAdult = yield* state('isAdult', true);
      const isAuth = yield* state('isAuth', true);
      return { isAdult, isAuth };
    },
    ({ isAdult, isAuth }) =>
      ifBlock(
        isAuth,
        () => button('increment', {}, () => isAdult()),
        () => p('signed out'),
      ),
  );

  type Template = ReturnType<ComponentTemplateOf<typeof component>>;
  type _RenderedState = Expect<
    Equal<
      TemplateRendersStateWhen<Template, 'isAdult', { when: { isAuth: true } }>,
      true
    >
  >;
  type _IncompatibleVisibilityDoesNotMatch = Expect<
    Equal<
      TemplateRendersStateWhen<
        Template,
        'isAdult',
        { when: { isAuth: false } }
      >,
      false
    >
  >;
});

it('tracks list visibility paths for named elements', () => {
  const component = craftComponent(
    'namedListContractComponent',
    {},
    function* () {
      const counterList = yield* state('counterList', [1, 2]);
      return { counterList };
    },
    ({ counterList }) =>
      each(
        counterList,
        { track: (item) => item, empty: () => p('empty') },
        () => button('item', {}, 'item'),
      ),
  );

  type Template = ReturnType<ComponentTemplateOf<typeof component>>;
  type _ItemVisibility = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        Template,
        'namedListContractComponent:button:item',
        { when: { counterList: 'nonEmpty' } }
      >,
      true
    >
  >;
  type _ItemIsNotUnconditionallyVisible = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        Template,
        'namedListContractComponent:button:item'
      >,
      false
    >
  >;
  type _EmptyVisibilityDoesNotMatch = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        Template,
        'namedListContractComponent:button:item',
        { when: { counterList: 'empty' } }
      >,
      false
    >
  >;
});

it('tracks translated labels exposed from nested insertSelect state', () => {
  const component = craftComponent(
    'nestedTranslatedLabelsContractComponent',
    {},
    function* () {
      const items = yield* state(
        'items',
        [{ key: 'first' }, { key: 'second' }],
        insertSelect('item', ({ state: selectedItem }) => ({
          translatedLabel: computed(() => `translated:${selectedItem().key}`),
        })),
      );
      return { items };
    },
    ({ items }) =>
      each(items, { track: (item) => item.key }, (_item, index) =>
        span(
          'itemLabel',
          {
            'aria-label': items.selectItem(index)?.translatedLabel,
          },
          () => items.selectItem(index)?.translatedLabel() ?? '',
        ),
      ),
  );

  type Template = ReturnType<ComponentTemplateOf<typeof component>>;
  type _TranslatedLabelIsRenderedForNonEmptyItems = Expect<
    Equal<
      TemplateRendersNamedElementWhen<
        Template,
        'nestedTranslatedLabelsContractComponent:span:itemLabel',
        { when: { items: 'nonEmpty' } }
      >,
      true
    >
  >;
  type _TranslatedLabelStateIsRenderedForNonEmptyItems = Expect<
    Equal<
      TemplateRendersStateWhen<
        Template,
        'items.selectItem.translatedLabel',
        { when: { items: 'nonEmpty' } }
      >,
      true
    >
  >;
});

it('tracks available actions through conditional template branches', () => {
  const component = craftComponent(
    'availableActionContractComponent',
    {},
    function* () {
      const isAuth = yield* state(
        'isAuth',
        computed(() => true),
      );
      return {
        isAuth,
        increment: craftMethod('increment', function* () {
          return undefined;
        }),
      };
    },
    ({ isAuth, increment }) =>
      ifBlock(
        isAuth,
        () => button('increment', { click: increment }, '+'),
        () => p('signed out'),
      ),
  );

  type Template = ReturnType<ComponentTemplateOf<typeof component>>;
  type _AvailableAction = Expect<
    Equal<
      TemplateRenderAvailableActionWhen<
        Template,
        'click:increment',
        { when: { isAuth: true } }
      >,
      true
    >
  >;
  type _IncompatibleVisibilityDoesNotMatch = Expect<
    Equal<
      TemplateRenderAvailableActionWhen<
        Template,
        'click:increment',
        { when: { isAuth: false } }
      >,
      false
    >
  >;
  type _DifferentLocalNameDoesNotMatch = Expect<
    Equal<TemplateRenderAvailableActionWhen<Template, 'click:reset'>, false>
  >;
});

it('keeps reactive signal reads synchronous and infers each items', () => {
  const component = craftComponent(
    'synchronousReactiveTemplateReads',
    {},
    function* () {
      const users = yield* state('users', [{ id: 1, name: 'Ada' }]);
      return { users };
    },
    ({ users }) => [
      span(String(users().length)),
      each(
        () => users(),
        { track: (user) => user.id },
        (user) => p(user.name),
      ),
    ],
  );

  void component;
});

it('accepts nullable each sources', () => {
  let items!: readonly { key: string }[] | null | undefined;

  each(items, { track: (item) => item.key }, (item) => p(item.key));
});
