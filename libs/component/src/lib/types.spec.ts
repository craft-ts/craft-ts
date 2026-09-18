import { ɵcomputed as computed } from '@craft-ts/core';
import { Context, Effect, Layer } from 'effect';
import { expectTypeOf, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import {
  craftComputed,
  craftMethod,
  craftRoutes,
  craftService,
  craftStateMachine,
  initStateMachine,
  insertSelect,
  provideHostName,
  state,
  transitionGuard,
  transitionStep,
  type ComponentDepsOf,
  type ComponentDepsCarrier,
  type CanRun,
  type GetServiceDependencies,
  type RouteCheckedDI,
  craftUse,
} from '@craft-ts/core';
import {
  ProvidedEffectServicesOfRoute,
  SyncOp,
  provideLayer,
  transitionGuardEffect,
} from '@craft-ts/effect';
import { loadCraftComponent } from './bridge';
import { overrideService } from '@craft-ts/core';
import { craftComponent } from './component';
import { projection } from './types';
import { craftDirective } from './directive';
import { deferNode } from './defer-node';
import { ifNode } from './if-node';
import { forNode, scheduleFor } from './for-node';
import { button, div, h2, input, li, p, section, span } from './hyperscript';
import { content, renderContent } from './project';
import { craftTemplate, renderTemplate } from './template';
import type { ComponentNode } from './render/vnode';
import type { ComponentTemplateOf, TemplateChildren } from './types';
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

it('exposes scheduleFor only on each nodes and preserves item/index types', () => {
  const scheduled = forNode(
    [{ id: 1 }],
    { track: (item) => item.id },
    (item, index) => {
      expectTypeOf(index).toEqualTypeOf<number>();
      return span(function* () {
        return String((yield* item()).id);
      });
    },
  ).pipe(scheduleFor({ enabled: true, strategy: 'frame' }));

  expectTypeOf(scheduled.schedule?.strategy).toEqualTypeOf<
    'frame' | undefined
  >();

  if (false) {
    // @ts-expect-error scheduleFor is structural and cannot decorate elements.
    button('not-an-each').pipe(scheduleFor({ strategy: 'frame' }));
  }
});
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
  const { NamedIdentityCompletionView, provideNamedIdentityCompletionView } =
    craftService(
      { name: 'namedIdentityCompletionView', providedIn: 'toProvide' },
      () => ({}),
    );

  const component = craftComponent(
    'namedIdentityCompletionComponent',
    { providers: [provideNamedIdentityCompletionView()] },
    function* () {
      yield* NamedIdentityCompletionView();
      return input('queryInput', {});
    },
  );

  type _NamedElementIdentity = Expect<
    Equal<
      TemplateNamedElementIdentity<ComponentTemplateOf<typeof component>>,
      'namedIdentityCompletionComponent:input:queryInput'
    >
  >;
});

it('infers component input and output props from the branded context', () => {
  const { UserCardView, provideUserCardView } = craftService(
    { name: 'userCardView', providedIn: 'toProvide' },
    (inputs: {
      readonly user: Input<User>;
      readonly onPick: Output<(user: User) => void>;
    }) => {
      const { user, onPick } = inputs;
      return {
        user,
        onPick,
      };
    },
  );

  const userCard = craftComponent(
    'userCard',
    { providers: [provideUserCardView()] },
    function* (inputs: {
      readonly user: Input<User>;
      readonly onPick: Output<(user: User) => void>;
    }) {
      const { user, onPick } = yield* UserCardView(inputs);
      return p(
        {
          *click() {
            onPick(yield* user());
          },
        },
        function* () {
          return (yield* user()).name;
        },
      );
    },
  );

  type _UserCardProps = Expect<
    Equal<
      PropsOf<typeof userCard>,
      {
        user: () => Generator<unknown, User, unknown>;
        onPick: (user: User) => void;
      }
    >
  >;
  expectTypeOf<PropsOf<typeof userCard>>().toEqualTypeOf<{
    user: () => Generator<unknown, User, unknown>;
    onPick: (user: User) => void;
  }>();

  userCard({
    user: function* () {
      return { id: 1, name: 'Ada' };
    },
    onPick: (user) => user.name,
  });

  // @ts-expect-error Input props remain accessors at the call-site.
  userCard({ user: { id: 1, name: 'Ada' }, onPick: () => undefined });
});

it('requires component inputs to use reactive Input readers', () => {
  const objectInput = craftComponent(
    'objectInput',
    {},
    function* ({ value }: { readonly value: Input<string> }) {
      return p(function* () {
        return yield* value();
      });
    },
  );

  type _ObjectInputProps = Expect<
    Equal<
      PropsOf<typeof objectInput>,
      { value: () => Generator<unknown, string, unknown> }
    >
  >;

  objectInput({
    value: function* () {
      return 'value';
    },
  });

  craftComponent(
    'invalidObjectInput',
    {},
    // @ts-expect-error A plain scalar is not a reactive component input.
    function* ({ value }: { readonly value: string }) {
      return p(value);
    },
  );
});

it('does not expose ordinary context callbacks as component outputs', () => {
  const { InternalActionView, provideInternalActionView } = craftService(
    { name: 'internalActionView', providedIn: 'toProvide' },
    (inputs: { readonly name: Input<string> }) => {
      const { name } = inputs;
      return {
        name,
        reset: () => undefined,
      };
    },
  );

  const internalAction = craftComponent(
    'internalAction',
    { providers: [provideInternalActionView()] },
    function* (inputs: { readonly name: Input<string> }) {
      const { name } = yield* InternalActionView(inputs);
      return p(function* () {
        return yield* name();
      });
    },
  );

  type _InternalActionProps = Expect<
    Equal<
      PropsOf<typeof internalAction>,
      { name: () => Generator<unknown, string, unknown> }
    >
  >;
  expectTypeOf(internalAction).toBeFunction();
  expectTypeOf<PropsOf<typeof internalAction>>().toEqualTypeOf<{
    name: () => Generator<unknown, string, unknown>;
  }>();
});

it('extracts projection contracts and propagates projected dependencies', () => {
  type ActionContract = {
    readonly kind: 'action';
    readonly trigger: () => void;
  };
  const { BadgeService, provideBadgeService } = craftService(
    { name: 'BadgeService', providedIn: 'toProvide' },
    () => ({ label: 'badge' }),
  );
  const { ProjectedBadgeView, provideProjectedBadgeView } = craftService(
    { name: 'projectedBadgeView', providedIn: 'toProvide' },
    function* () {
      const service = yield* BadgeService();
      return { service };
    },
  );

  const badge = craftComponent(
    'projectedBadge',
    { providers: [provideProjectedBadgeView()] },
    function* () {
      const { service } = yield* ProjectedBadgeView();
      return p(service.label);
    },
  );
  const { TypedActionView, provideTypedActionView } = craftService(
    { name: 'typedActionView', providedIn: 'toProvide' },
    (input: { readonly key: string; readonly trigger: () => void }) => {
      return {
        key: input.key,
        contract: {
          kind: 'action',
          trigger: input.trigger,
        } satisfies ActionContract,
      };
    },
  );

  const action = craftComponent(
    'typedAction',
    {
      providers: [provideTypedActionView()],
      projection: projection<ActionContract>(),
    },
    function* (input: { readonly key: string; readonly trigger: () => void }) {
      const { contract } = yield* TypedActionView(input);
      return button({ click: contract.trigger }, 'action');
    },
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
    function* (input: {
      readonly body: RequiredContent<{
        readonly selector: {
          readonly tag: 'div';
          readonly class: 'card-body';
        };
      }>;
    }) {
      const { body } = input;
      return section(renderContent('body', body));
    },
  );
  const { ProjectingParentView, provideProjectingParentView } = craftService(
    { name: 'projectingParentView', providedIn: 'toProvide' },
    () => ({}),
  );

  const parent = craftComponent(
    'projectingParent',
    { providers: [provideProjectingParentView()] },
    function* () {
      yield* ProjectingParentView();
      return card({
        body: content(() => [div({ class: 'card-body' }), badge({})]),
      });
    },
  );

  type ParentDependencies = ComponentDepsOf<typeof parent>;
  type _ProjectedDependencyWasPropagated = Expect<
    Equal<keyof ParentDependencies['missingProvider'], 'BadgeService'>
  >;

  // @ts-expect-error the required body slot is missing.
  card({});

  const { ProvidedProjectingParentView, provideProvidedProjectingParentView } =
    craftService(
      { name: 'providedProjectingParentView', providedIn: 'toProvide' },
      () => ({}),
    );

  const providedParent = craftComponent(
    'providedProjectingParent',
    {
      providers: [provideProvidedProjectingParentView(), provideBadgeService()],
    },
    function* () {
      yield* ProvidedProjectingParentView();
      return card({
        body: () => [div({ class: 'card-body' }), badge({})],
      });
    },
  );
  type ProvidedDependencies = ComponentDepsOf<typeof providedParent>;
  type _ProvidedProjectedDependencyWasResolved = Expect<
    Equal<keyof ProvidedDependencies['missingProvider'], never>
  >;

  const consumerProvidedCard = craftComponent(
    'consumerProvidedTypedCard',
    { providers: [provideBadgeService()] },
    function* (input: { readonly body: ContentSlot }) {
      const { body } = input;
      return section(renderContent('body', body));
    },
  );
  const {
    ParentWithoutProjectedProviderView,
    provideParentWithoutProjectedProviderView,
  } = craftService(
    { name: 'parentWithoutProjectedProviderView', providedIn: 'toProvide' },
    () => ({}),
  );

  const parentWithoutProvider = craftComponent(
    'parentWithoutProjectedProvider',
    { providers: [provideParentWithoutProjectedProviderView()] },
    function* () {
      yield* ParentWithoutProjectedProviderView();
      return consumerProvidedCard({
        body: () => badge({}),
      });
    },
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
    function* (input: {
      readonly body: RequiredContent<{
        readonly selector: {
          readonly tag: 'div';
          readonly class: 'card-body';
          readonly 'data-slot': 'body';
        };
      }>;
    }) {
      const { body } = input;
      return renderContent('body', body);
    },
  );

  const {
    SelectorContractValidParentView,
    provideSelectorContractValidParentView,
  } = craftService(
    { name: 'selectorContractValidParentView', providedIn: 'toProvide' },
    () => ({}),
  );

  const validParent = craftComponent(
    'selectorContractValidParent',
    { providers: [provideSelectorContractValidParentView()] },
    function* () {
      yield* SelectorContractValidParentView();
      return card({
        body: content(() => div({ class: 'card-body', 'data-slot': 'body' })),
      });
    },
  );

  expectTypeOf(validParent).toBeFunction();

  const {
    SelectorContractInvalidParentView,
    provideSelectorContractInvalidParentView,
  } = craftService(
    { name: 'selectorContractInvalidParentView', providedIn: 'toProvide' },
    () => ({}),
  );

  const invalidParent = craftComponent(
    'selectorContractInvalidParent',
    { providers: [provideSelectorContractInvalidParentView()] },
    function* () {
      yield* SelectorContractInvalidParentView();
      return card({
        // @ts-expect-error the projected content must contain div.card-body[data-slot="body"].
        body: content(() => div({ class: 'wrong-class' })),
      });
    },
  );

  expectTypeOf(invalidParent).toBeFunction();
});

it('checks reusable template contexts at every render site', () => {
  const row = craftTemplate<{
    readonly $implicit: User;
    readonly index: number;
  }>(({ $implicit: user, index }) => li(`${index}: ${user.name}`));

  renderTemplate(row, { $implicit: { id: 1, name: 'Ada' }, index: 0 });
  renderTemplate(row, {
    $implicit: function* () {
      return { id: 2, name: 'Lin' };
    },
    index: 1,
  });
  // @ts-expect-error the template context must provide both fields.
  renderTemplate(row, { $implicit: { id: 1, name: 'Ada' } });
  const invalidUser = function* () {
    return 'not a user';
  };
  // @ts-expect-error a yieldable context value must resolve to the field type.
  renderTemplate(row, { $implicit: invalidUser, index: 0 });

  const invalidContent = function* () {
    return 'not Craft content';
  };
  // @ts-expect-error renderContent only accepts yieldables resolving to content.
  renderContent(invalidContent);
});

it('carries inferred dependencies from the component through the lazy route fragment', () => {
  const { TypeSpecService } = craftService(
    { name: 'TypeSpecService', providedIn: 'toProvide' },
    () => ({ value: 'tracked' }),
  );

  const { TrackedView, provideTrackedView } = craftService(
    { name: 'trackedView', providedIn: 'toProvide' },
    function* (inputs: { readonly label: Input<string> }) {
      const { label } = inputs;

      const service = yield* TypeSpecService();
      return { label, service };
    },
  );

  const trackedComponent = craftComponent(
    'trackedComponent',
    { providers: [provideTrackedView()] },
    function* (inputs: { readonly label: Input<string> }) {
      const { label, service } = yield* TrackedView(inputs);
      return p(`${label()}: ${service.value}`);
    },
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

  // The logic is a service now, so the component depends on that service — and
  // the service it needs in turn hangs under it.
  type _DependencyWasInferred = Expect<
    'TypeSpecService' extends keyof ComponentDependencies['deps']['trackedView']['dependencies']
      ? true
      : false
  >;
  type _OnlyExpectedDependencyWasInferred = Expect<
    Equal<keyof ComponentDependencies['deps'], 'trackedView'>
  >;
  type _PublicInputWasInferred = Expect<
    Equal<keyof ComponentDependencies['publicProperties'], 'label'>
  >;
  type _LazyFragmentPreservesDependencies = Expect<
    Equal<LazyDependencies, ComponentDependencies>
  >;
  type _RawRoutePreservesDependencies = Expect<
    'trackedView' extends keyof RawRouteDependencies['deps'] ? true : false
  >;
  type _DependencyScopeWasPreserved = Expect<
    Equal<
      ComponentDependencies['deps']['trackedView']['dependencies']['TypeSpecService']['providedIn'],
      'toProvide'
    >
  >;
  type _OwnServiceWasProvided = Expect<
    Equal<keyof ComponentDependencies['provided'], 'trackedView'>
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

  const { ComponentDepsUnionFirstView, provideComponentDepsUnionFirstView } =
    craftService(
      { name: 'componentDepsUnionFirstView', providedIn: 'toProvide' },
      () => ({}),
    );

  const first = craftComponent(
    'componentDepsUnionFirst',
    { providers: [provideComponentDepsUnionFirstView()] },
    function* () {
      yield* ComponentDepsUnionFirstView();
      return p('first');
    },
  );
  const { ComponentDepsUnionSecondView, provideComponentDepsUnionSecondView } =
    craftService(
      { name: 'componentDepsUnionSecondView', providedIn: 'toProvide' },
      () => ({}),
    );

  const second = craftComponent(
    'componentDepsUnionSecond',
    { providers: [provideComponentDepsUnionSecondView()] },
    function* () {
      yield* ComponentDepsUnionSecondView();
      return p('second');
    },
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

it('propagates a service used by state-machine transitions into the component DI check', () => {
  const { TransitionPolicy } = craftService(
    { name: 'TransitionPolicy', providedIn: 'toProvide' },
    () => ({ canEnter: () => true }),
  );

  const {
    StateMachineTransitionDependencyView,
    provideStateMachineTransitionDependencyView,
  } = craftService(
    { name: 'stateMachineTransitionDependencyView', providedIn: 'toProvide' },
    function* () {
      const machine = yield* craftStateMachine(
        function* () {
          return {};
        },
        function* (_, transit) {
          const policy = yield* TransitionPolicy();

          return {
            idle: transitionStep(function* () {
              yield* initStateMachine(() =>
                transit().pipe(transitionGuard(() => policy.canEnter())),
              );
            }),
          };
        },
        function* () {
          return { idle: {} };
        },
      );

      return { machine };
    },
  );

  const component = craftComponent(
    'stateMachineTransitionDependency',
    { providers: [provideStateMachineTransitionDependencyView()] },
    function* () {
      yield* StateMachineTransitionDependencyView();
      return p('machine');
    },
  );

  type ComponentDependencies = ComponentDepsOf<typeof component>;

  type _DependencyWasInferred = Expect<
    Equal<
      keyof ComponentDependencies['deps']['stateMachineTransitionDependencyView']['dependencies'],
      'TransitionPolicy'
    >
  >;
  type _OwnServiceWasProvided = Expect<
    Equal<
      keyof ComponentDependencies['provided'],
      'stateMachineTransitionDependencyView'
    >
  >;
  type _MissingProviderKeyWasDetected = Expect<
    Equal<keyof ComponentDependencies['missingProvider'], 'TransitionPolicy'>
  >;
  type _MissingProviderTypeWasPreserved = Expect<
    Equal<
      ComponentDependencies['missingProvider']['TransitionPolicy'],
      GetServiceDependencies<typeof TransitionPolicy>
    >
  >;
  type _ComponentDepsHasRequiredMissingProvider = Expect<
    ComponentDependencies extends { missingProvider: object } ? true : false
  >;
  type BoundaryDependencies = {
    deps: ComponentDependencies['deps'];
    provided: ComponentDependencies['provided'];
    publicProperties: {};
    missingProvider: ComponentDependencies['missingProvider'];
  };
  type _MissingProviderWasDetected = Expect<
    Equal<
      RouteCheckedDI<
        BoundaryDependencies,
        never,
        never,
        'StateMachineTransitionDependency'
      >,
      [
        'The TransitionPolicy service is not provided in StateMachineTransitionDependency',
      ]
    >
  >;
  type MissingRouteCheck = RouteCheckedDI<
    BoundaryDependencies,
    never,
    never,
    'StateMachineTransitionDependency'
  >;
  // @ts-expect-error CanRun rejects the route contract while the provider is absent.
  type _MissingCanRun = CanRun<MissingRouteCheck>;

  type _ProvidedCheck = RouteCheckedDI<
    ComponentDependencies,
    'TransitionPolicy',
    never,
    'StateMachineTransitionDependency'
  >;
  expectTypeOf<_ProvidedCheck>().toEqualTypeOf<true>();
  expectTypeOf<CanRun<_ProvidedCheck>>().toEqualTypeOf<true>();
});

it('propagates an Effect service used by transitionGuardEffect into the route DI check', () => {
  type EffectTransitionPolicyShape = {
    readonly canEnter: () => Effect.Effect<boolean, never, SyncOp>;
  };
  class EffectTransitionPolicy extends Context.Service<
    EffectTransitionPolicy,
    EffectTransitionPolicyShape
  >()('types-spec/EffectTransitionPolicy') {}

  const policyLayer = Layer.succeed(EffectTransitionPolicy, {
    canEnter: () =>
      Effect.gen(function* () {
        yield* SyncOp;
        return true;
      }),
  });

  const {
    EffectStateMachineTransitionDependencyView,
    provideEffectStateMachineTransitionDependencyView,
  } = craftService(
    {
      name: 'effectStateMachineTransitionDependencyView',
      providedIn: 'toProvide',
    },
    function* () {
      const machine = yield* craftStateMachine(
        function* () {
          return {};
        },
        function* (_, transit) {
          return {
            idle: transitionStep(function* () {
              yield* initStateMachine(() =>
                transit().pipe(
                  transitionGuardEffect(() =>
                    Effect.gen(function* () {
                      yield* SyncOp;
                      const policy = yield* EffectTransitionPolicy;
                      return yield* policy.canEnter();
                    }),
                  ),
                ),
              );
            }),
          };
        },
        function* () {
          return { idle: {} };
        },
      );

      return { machine };
    },
  );

  const component = craftComponent(
    'effectStateMachineTransitionDependency',
    { providers: [provideEffectStateMachineTransitionDependencyView()] },
    function* () {
      yield* EffectStateMachineTransitionDependencyView();
      return p('machine');
    },
  );

  type ComponentDependencies = ComponentDepsOf<typeof component>;
  type _EffectDependencyWasInferred = Expect<
    Equal<
      keyof ComponentDependencies['deps']['effectStateMachineTransitionDependencyView']['dependencies'],
      'types-spec/EffectTransitionPolicy'
    >
  >;
  type _EffectMissingProviderWasDetected = Expect<
    Equal<
      keyof ComponentDependencies['missingProvider'],
      'types-spec/EffectTransitionPolicy'
    >
  >;

  const missingRoutes = craftRoutes('effectGuardMissing', [
    {
      path: 'checkout',
      ...loadCraftComponent(async () => component),
    },
  ]);
  type MissingEffectServices = ProvidedEffectServicesOfRoute<
    typeof missingRoutes.effectGuardMissingRoutes._routes,
    'checkout'
  >;
  type MissingRouteCheck = RouteCheckedDI<
    ComponentDependencies,
    never,
    MissingEffectServices,
    'path: "checkout"'
  >;
  type _MissingRouteMessage = Expect<
    Equal<
      MissingRouteCheck,
      [
        'The types-spec/EffectTransitionPolicy service is not provided in path: "checkout"',
      ]
    >
  >;
  // @ts-expect-error CanRun rejects the route when the Effect Layer is absent.
  type _MissingCanRun = CanRun<MissingRouteCheck>;

  const providedRoutes = craftRoutes('effectGuardProvided', [
    {
      path: 'checkout',
      ...loadCraftComponent(async () => component, [
        provideLayer(policyLayer),
      ] as const),
    },
  ]);
  type ProvidedEffectServices = ProvidedEffectServicesOfRoute<
    typeof providedRoutes.effectGuardProvidedRoutes._routes,
    'checkout'
  >;
  type ProvidedRouteCheck = RouteCheckedDI<
    ComponentDependencies,
    never,
    ProvidedEffectServices,
    'path: "checkout"'
  >;
  expectTypeOf<CanRun<ProvidedRouteCheck>>().toEqualTypeOf<true>();
});

it('does not treat unbranded Angular providers as Craft service providers', () => {
  const { MissingProvider } = craftService(
    { name: 'MissingProvider', providedIn: 'toProvide' },
    () => ({ value: 'missing' }),
  );

  const { UnbrandedProviderView, provideUnbrandedProviderView } = craftService(
    { name: 'unbrandedProviderView', providedIn: 'toProvide' },
    function* () {
      const service = yield* MissingProvider();
      return { service };
    },
  );

  const component = craftComponent(
    'unbrandedProviderComponent',
    {
      providers: [
        provideUnbrandedProviderView(),
        provideHostName('component:unbrandedProviderComponent'),
      ],
    },
    function* () {
      const { service } = yield* UnbrandedProviderView();
      return p(service.value);
    },
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
    { name: 'TemplateDependency', providedIn: 'toProvide' },
    () => ({ value: 'template' }),
  );

  const { TemplateDependencyChildView, provideTemplateDependencyChildView } =
    craftService(
      { name: 'templateDependencyChildView', providedIn: 'toProvide' },
      function* () {
        const service = yield* TemplateDependency();
        return { service };
      },
    );

  const child = craftComponent(
    'templateDependencyChild',
    { providers: [provideTemplateDependencyChildView()] },
    function* () {
      const { service } = yield* TemplateDependencyChildView();
      return p(service.value);
    },
  );

  const nestedNode = div([p('before'), child({}), p('after')]);
  type NestedNodeDependencies = CraftNodeChildrenDependencies<
    typeof nestedNode
  >;
  type _NestedNodeDependencyWasPreserved = Expect<
    Equal<keyof NestedNodeDependencies['missingProvider'], 'TemplateDependency'>
  >;

  const { TemplateDependencyParentView, provideTemplateDependencyParentView } =
    craftService(
      { name: 'templateDependencyParentView', providedIn: 'toProvide' },
      () => ({}),
    );

  const parent = craftComponent(
    'templateDependencyParent',
    { providers: [provideTemplateDependencyParentView()] },
    function* () {
      yield* TemplateDependencyParentView();
      return nestedNode;
    },
  );

  type ParentDependencies = ComponentDepsOf<typeof parent>;
  type _ChildDependencyWasPropagated = Expect<
    Equal<keyof ParentDependencies['missingProvider'], 'TemplateDependency'>
  >;
});

it('keeps the component props untouched when a directive is piped', () => {
  const { CardView, provideCardView } = craftService(
    { name: 'cardView', providedIn: 'toProvide' },
    (inputs: { readonly user: Input<User> }) => {
      const { user } = inputs;
      return { user, label: 'card' };
    },
  );

  const card = craftComponent(
    'card',
    { providers: [provideCardView()] },
    function* (inputs: { readonly user: Input<User> }) {
      const { user } = yield* CardView(inputs);
      return p(function* () {
        return (yield* user()).name;
      });
    },
  ).pipe(
    craftDirective(
      'withPermission',
      {},
      {
        service: overrideService(CardView, (base) => ({
          ...base,
          label: `${base.label} (restricted)`,
        })),
      },
    ),
  );

  // A directive enriches or restricts a service façade; it never adds a prop.
  expectTypeOf<PropsOf<typeof card>>().toEqualTypeOf<{
    user: () => Generator<unknown, User, unknown>;
  }>();
  card({
    user: function* () {
      return { id: 1, name: 'Ada' };
    },
  });

  craftDirective(
    'takesAMemberAway',
    {},
    {
      // @ts-expect-error a directive may not drop a member of the contract.
      service: overrideService(CardView, () => ({ label: 'only a label' })),
    },
  );
});

it('preserves template dependencies when Craft directives are applied', () => {
  const { DirectiveTemplateDependency } = craftService(
    { name: 'DirectiveTemplateDependency', providedIn: 'toProvide' },
    () => ({ value: 'directive-template' }),
  );

  const {
    DirectiveTemplateDependencyChildView,
    provideDirectiveTemplateDependencyChildView,
  } = craftService(
    { name: 'directiveTemplateDependencyChildView', providedIn: 'toProvide' },
    function* () {
      const service = yield* DirectiveTemplateDependency();
      return { service };
    },
  );

  const child = craftComponent(
    'directiveTemplateDependencyChild',
    { providers: [provideDirectiveTemplateDependencyChildView()] },
    function* () {
      const { service } = yield* DirectiveTemplateDependencyChildView();
      return p(service.value);
    },
  );

  const withTemplate = craftDirective(
    'withTemplate',
    {},
    {
      template: (baseTemplate) =>
        function* () {
          return yield* baseTemplate();
        },
    },
  );

  const {
    DirectiveTemplateDependencyParentView,
    provideDirectiveTemplateDependencyParentView,
  } = craftService(
    { name: 'directiveTemplateDependencyParentView', providedIn: 'toProvide' },
    () => ({}),
  );

  const piped = craftComponent(
    'directiveTemplateDependencyParent',
    { providers: [provideDirectiveTemplateDependencyParentView()] },
    function* () {
      yield* DirectiveTemplateDependencyParentView();
      return div([child({})]);
    },
  ).pipe(withTemplate);

  const {
    NodeDirectiveTemplateDependencyParentView,
    provideNodeDirectiveTemplateDependencyParentView,
  } = craftService(
    {
      name: 'nodeDirectiveTemplateDependencyParentView',
      providedIn: 'toProvide',
    },
    () => ({}),
  );

  const nodePiped = craftComponent(
    'nodeDirectiveTemplateDependencyParent',
    { providers: [provideNodeDirectiveTemplateDependencyParentView()] },
    function* () {
      yield* NodeDirectiveTemplateDependencyParentView();
      return div([child({})]).pipe(withTemplate);
    },
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

it('propagates component-carried dependencies from a reader used as text', () => {
  type TranslationReader = (() => Generator<unknown, string, unknown>) &
    ComponentDepsCarrier<{
      ClientCurrency: {
        readonly providedIn: 'toProvide';
        readonly dependencies: Record<never, never>;
      };
    }>;
  const reader = (() =>
    function* () {
      return 'translated';
    }) as unknown as TranslationReader;
  const {
    TranslationReaderDependencyView,
    provideTranslationReaderDependencyView,
  } = craftService(
    { name: 'translationReaderDependencyView', providedIn: 'toProvide' },
    () => ({}),
  );

  const component = craftComponent(
    'translationReaderDependency',
    { providers: [provideTranslationReaderDependencyView()] },
    function* () {
      yield* TranslationReaderDependencyView();
      return p(reader);
    },
  );

  const paragraph = p(reader);
  type ParagraphDependencies = CraftNodeChildrenDependencies<
    typeof paragraph extends { readonly children: infer Children }
      ? Children
      : never
  >;
  type _ParagraphDependencyWasPropagated = Expect<
    Equal<keyof ParagraphDependencies, 'ClientCurrency'>
  >;
  type Dependencies = ComponentDepsOf<typeof component>;
  type _ReaderDependencyWasPropagated = Expect<
    Equal<keyof Dependencies['missingProvider'], 'ClientCurrency'>
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
  const { ContractIconView, provideContractIconView } = craftService(
    { name: 'contractIconView', providedIn: 'toProvide' },
    () => ({}),
  );

  const icon = craftComponent(
    'contractIcon',
    { providers: [provideContractIconView()] },
    function* () {
      yield* ContractIconView();
      return p('icon');
    },
  );
  const { ContractParentView, provideContractParentView } = craftService(
    { name: 'contractParentView', providedIn: 'toProvide' },
    () => ({}),
  );

  const parent = craftComponent(
    'contractParent',
    { providers: [provideContractParentView()] },
    function* () {
      yield* ContractParentView();
      return div([icon()]);
    },
  );

  type Contract = SetupTestComponentTemplate<typeof parent, [typeof icon]>;
  type _ContractIsValid = Expect<Equal<Contract['valid'], true>>;
  type _RootElementIsFound = Expect<
    Equal<
      TemplateHasElement<
        TemplateChildren<ComponentTemplateOf<typeof parent>>,
        'div'
      >,
      true
    >
  >;
});

it('reports a missing child component in the type-only template contract', () => {
  const { ContractMissingView, provideContractMissingView } = craftService(
    { name: 'contractMissingView', providedIn: 'toProvide' },
    () => ({}),
  );

  const missing = craftComponent(
    'contractMissing',
    { providers: [provideContractMissingView()] },
    function* () {
      yield* ContractMissingView();
      return p('missing');
    },
  );
  const { ContractMissingParentView, provideContractMissingParentView } =
    craftService(
      { name: 'contractMissingParentView', providedIn: 'toProvide' },
      () => ({}),
    );

  const parent = craftComponent(
    'contractMissingParent',
    { providers: [provideContractMissingParentView()] },
    function* () {
      yield* ContractMissingParentView();
      return div([missing()]);
    },
  );

  type Contract = SetupTestComponentTemplate<typeof parent, []>;
  type _MissingComponentIsDiagnosed = Expect<
    Contract extends { readonly error: string } ? true : false
  >;
});

it('keeps exact child component references and validates their props', () => {
  const { ContractPropsChildView, provideContractPropsChildView } =
    craftService(
      { name: 'contractPropsChildView', providedIn: 'toProvide' },
      (inputs: { readonly value: Input<number> }) => {
        const { value } = inputs;
        return { value };
      },
    );

  const child = craftComponent(
    'contractPropsChild',
    { providers: [provideContractPropsChildView()] },
    function* (inputs: { readonly value: Input<number> }) {
      const { value } = yield* ContractPropsChildView(inputs);
      return p(function* () {
        return String(yield* value());
      });
    },
  );
  const node = child({
    value: function* () {
      return 1;
    },
  });
  const { ContractPropsParentView, provideContractPropsParentView } =
    craftService(
      { name: 'contractPropsParentView', providedIn: 'toProvide' },
      () => ({}),
    );

  const parent = craftComponent(
    'contractPropsParent',
    { providers: [provideContractPropsParentView()] },
    function* () {
      yield* ContractPropsParentView();
      return node;
    },
  );

  type _ReferenceIsExact = Expect<
    Equal<(typeof node)['component'], typeof child>
  >;
  type Contract = SetupTestComponentTemplate<typeof parent, [typeof child]>;
  type _ContractIsValid = Expect<Equal<Contract['valid'], true>>;
  type _UsesExactChild = Expect<
    Equal<
      TemplateUsesComponent<
        TemplateChildren<ComponentTemplateOf<typeof parent>>,
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
  const {
    ContractInvalidPropsParentView,
    provideContractInvalidPropsParentView,
  } = craftService(
    { name: 'contractInvalidPropsParentView', providedIn: 'toProvide' },
    () => ({}),
  );

  const invalidParent = craftComponent(
    'contractInvalidPropsParent',
    { providers: [provideContractInvalidPropsParentView()] },
    function* () {
      yield* ContractInvalidPropsParentView();
      return invalidNode;
    },
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
  const { ContextPropertyBindingView, provideContextPropertyBindingView } =
    craftService(
      { name: 'contextPropertyBindingView', providedIn: 'toProvide' },
      () => ({
        disabled: craftMethod('disabled', function* () {
          return true;
        }),
        enabled: craftMethod('enabled', function* () {
          return true;
        }),
      }),
    );

  const component = craftComponent(
    'contextPropertyBinding',
    { providers: [provideContextPropertyBindingView()] },
    function* () {
      const { disabled } = yield* ContextPropertyBindingView();
      return button({ disabled }, '+');
    },
  );

  type Template = TemplateChildren<ComponentTemplateOf<typeof component>>;
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

  const {
    NestedContextPropertyBindingView,
    provideNestedContextPropertyBindingView,
  } = craftService(
    { name: 'nestedContextPropertyBindingView', providedIn: 'toProvide' },
    () => ({
      counter: {
        disabled: craftMethod('disabled', function* () {
          return true;
        }),
      },
    }),
  );

  const nestedComponent = craftComponent(
    'nestedContextPropertyBinding',
    { providers: [provideNestedContextPropertyBindingView()] },
    function* () {
      const { counter } = yield* NestedContextPropertyBindingView();
      return button({ disabled: counter.disabled }, '+');
    },
  );
  type NestedTemplate = TemplateChildren<
    ComponentTemplateOf<typeof nestedComponent>
  >;
  type _NestedPropertyDelegatesToContext = Expect<
    Equal<
      TemplateDelegatesToContext<
        NestedTemplate,
        'button',
        'disabled',
        'disabled'
      >,
      true
    >
  >;

  const {
    DerivedStatePropertyBindingView,
    provideDerivedStatePropertyBindingView,
  } = craftService(
    { name: 'derivedStatePropertyBindingView', providedIn: 'toProvide' },
    function* () {
      const counter = yield* state('counter', 0, ({ state }) => ({
        disabled: craftComputed('disabled', function* () {
          return (yield* state()) % 2 === 0;
        }),
      }));
      return { counter };
    },
  );

  const derivedStateComponent = craftComponent(
    'derivedStatePropertyBinding',
    { providers: [provideDerivedStatePropertyBindingView()] },
    function* () {
      const { counter } = yield* DerivedStatePropertyBindingView();
      return button({ disabled: counter.disabled }, '+');
    },
  );
  type DerivedTemplate = TemplateChildren<
    ComponentTemplateOf<typeof derivedStateComponent>
  >;
  type _DerivedStateUsesContextValue = Expect<
    Equal<TemplateRendersStateWhen<DerivedTemplate, 'disabled'>, true>
  >;

  const { DirectStateContextView, provideDirectStateContextView } =
    craftService(
      { name: 'directStateContextView', providedIn: 'toProvide' },
      () =>
        state('counter', 0, ({ update }) => ({
          increment: () => update((value) => value + 1),
        })),
    );

  const directStateComponent = craftComponent(
    'directStateContext',
    { providers: [provideDirectStateContextView()] },
    function* () {
      const counter = yield* DirectStateContextView();

      const current: number = craftUse(counter());
      return button({ click: counter.increment }, `${current}`);
    },
  );
});

it('diagnoses imperative callbacks when the template contract is requested', () => {
  const {
    ContractImperativeCallbackParentView,
    provideContractImperativeCallbackParentView,
  } = craftService(
    { name: 'contractImperativeCallbackParentView', providedIn: 'toProvide' },
    () => ({}),
  );

  const imperative = div({ click: () => undefined }, 'click');
  const parent = craftComponent(
    'contractImperativeCallbackParent',
    { providers: [provideContractImperativeCallbackParentView()] },
    function* () {
      yield* ContractImperativeCallbackParentView();
      return imperative;
    },
  );

  type Contract = SetupTestComponentTemplate<typeof parent>;
  type _ImperativeCallbackIsDiagnosed = Expect<
    Contract extends { readonly error: string } ? true : false
  >;
});

it('checks output callback arguments on a child component', () => {
  const { ContractOutputChildView, provideContractOutputChildView } =
    craftService(
      { name: 'contractOutputChildView', providedIn: 'toProvide' },
      (inputs: { readonly onSelected: Output<(id: number) => void> }) => {
        const { onSelected } = inputs;
        return { onSelected };
      },
    );

  const child = craftComponent(
    'contractOutputChild',
    { providers: [provideContractOutputChildView()] },
    function* (inputs: { readonly onSelected: Output<(id: number) => void> }) {
      const { onSelected } = yield* ContractOutputChildView(inputs);
      return p('child');
    },
  );
  const onSelected = function* (id: number) {
    return id;
  };
  const { ContractOutputParentView, provideContractOutputParentView } =
    craftService(
      { name: 'contractOutputParentView', providedIn: 'toProvide' },
      () => ({}),
    );

  const parent = craftComponent(
    'contractOutputParent',
    { providers: [provideContractOutputParentView()] },
    function* () {
      yield* ContractOutputParentView();
      return child({ onSelected });
    },
  );

  type _OutputSignature = Expect<
    Equal<
      TemplateHasOutput<
        TemplateChildren<ComponentTemplateOf<typeof parent>>,
        typeof child,
        'onSelected',
        typeof onSelected
      >,
      true
    >
  >;
});

it('diagnoses imperative output callbacks in the template contract', () => {
  const {
    ContractImperativeOutputChildView,
    provideContractImperativeOutputChildView,
  } = craftService(
    { name: 'contractImperativeOutputChildView', providedIn: 'toProvide' },
    (inputs: { readonly onSelected: Output<(id: number) => void> }) => {
      const { onSelected } = inputs;
      return { onSelected };
    },
  );

  const child = craftComponent(
    'contractImperativeOutputChild',
    { providers: [provideContractImperativeOutputChildView()] },
    function* (inputs: { readonly onSelected: Output<(id: number) => void> }) {
      yield* ContractImperativeOutputChildView(inputs);
      return p('child');
    },
  );
  const {
    ContractImperativeOutputParentView,
    provideContractImperativeOutputParentView,
  } = craftService(
    { name: 'contractImperativeOutputParentView', providedIn: 'toProvide' },
    () => ({}),
  );

  const parent = craftComponent(
    'contractImperativeOutputParent',
    { providers: [provideContractImperativeOutputParentView()] },
    function* () {
      yield* ContractImperativeOutputParentView();
      return child({ onSelected: (id: number) => id });
    },
  );

  type Contract = SetupTestComponentTemplate<typeof parent, [typeof child]>;
  // An output is a plain callback now: the parent's own template is the
  // generator, so nothing forces the handler to be one.
  type _ImperativeOutputIsAccepted = Expect<
    Contract extends { readonly error: string } ? false : true
  >;
});

it('resolves the component loaded by defer in the type-only contract', () => {
  const { ContractDeferredChildView, provideContractDeferredChildView } =
    craftService(
      { name: 'contractDeferredChildView', providedIn: 'toProvide' },
      () => ({}),
    );

  const child = craftComponent(
    'contractDeferredChild',
    { providers: [provideContractDeferredChildView()] },
    function* () {
      yield* ContractDeferredChildView();
      return p('deferred');
    },
  );
  const { ContractDeferredParentView, provideContractDeferredParentView } =
    craftService(
      { name: 'contractDeferredParentView', providedIn: 'toProvide' },
      () => ({}),
    );

  const deferred = deferNode(async () => child);
  const parent = craftComponent(
    'contractDeferredParent',
    { providers: [provideContractDeferredParentView()] },
    function* () {
      yield* ContractDeferredParentView();
      return deferred;
    },
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
  const { ContractDynamicFirstView, provideContractDynamicFirstView } =
    craftService(
      { name: 'contractDynamicFirstView', providedIn: 'toProvide' },
      () => ({}),
    );

  const first = craftComponent(
    'contractDynamicFirst',
    { providers: [provideContractDynamicFirstView()] },
    function* () {
      yield* ContractDynamicFirstView();
      return p('first');
    },
  );
  const { ContractDynamicSecondView, provideContractDynamicSecondView } =
    craftService(
      { name: 'contractDynamicSecondView', providedIn: 'toProvide' },
      () => ({}),
    );

  const second = craftComponent(
    'contractDynamicSecond',
    { providers: [provideContractDynamicSecondView()] },
    function* () {
      yield* ContractDynamicSecondView();
      return p('second');
    },
  );
  const dynamic = {
    kind: 'component',
    // eslint-disable-next-line no-constant-condition -- this fixture preserves a union of both branches.
    component: (true ? first : second) as typeof first | typeof second,
    props: {},
  } as ComponentNode<{}, {}, typeof first | typeof second>;
  const { ContractDynamicParentView, provideContractDynamicParentView } =
    craftService(
      { name: 'contractDynamicParentView', providedIn: 'toProvide' },
      () => ({}),
    );

  const dynamicParent = craftComponent(
    'contractDynamicParent',
    { providers: [provideContractDynamicParentView()] },
    function* () {
      yield* ContractDynamicParentView();
      return dynamic;
    },
  );

  type DynamicContract = SetupTestComponentTemplate<
    typeof dynamicParent,
    [typeof first, typeof second]
  >;
  type _DynamicComponentIsDiagnosed = Expect<
    DynamicContract extends { readonly error: string } ? true : false
  >;

  const { ContractBranchMissingView, provideContractBranchMissingView } =
    craftService(
      { name: 'contractBranchMissingView', providedIn: 'toProvide' },
      () => ({}),
    );

  const missingBranch = craftComponent(
    'contractBranchMissing',
    { providers: [provideContractBranchMissingView()] },
    function* () {
      yield* ContractBranchMissingView();
      return p('missing branch');
    },
  );
  const branchParent = craftComponent(
    'contractBranchParent',
    {},
    // eslint-disable-next-line no-constant-condition -- this fixture checks conditional branch diagnostics.
    () => (true ? p('ok') : missingBranch()),
  );
  type BranchContract = SetupTestComponentTemplate<typeof branchParent>;
  type _BranchFailureIsDiagnosed = Expect<
    BranchContract extends { readonly error: string } ? true : false
  >;
});

it('tracks named elements through conditional template branches', () => {
  const { NamedContractView, provideNamedContractView } = craftService(
    { name: 'namedContractView', providedIn: 'toProvide' },
    function* () {
      const isAuth = yield* state(
        'isAuth',
        computed(() => true),
      );
      return { isAuth };
    },
  );

  const component = craftComponent(
    'namedContractComponent',
    { providers: [provideNamedContractView()] },
    function* () {
      const { isAuth } = yield* NamedContractView();
      return ifNode(
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
      );
    },
  );

  type Template = TemplateChildren<ComponentTemplateOf<typeof component>>;
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
  const { RenderedStateContractView, provideRenderedStateContractView } =
    craftService(
      { name: 'renderedStateContractView', providedIn: 'toProvide' },
      function* () {
        const isAdult = yield* state('isAdult', true);
        const isAuth = yield* state('isAuth', true);
        return { isAdult, isAuth };
      },
    );

  const component = craftComponent(
    'renderedStateContractComponent',
    { providers: [provideRenderedStateContractView()] },
    function* () {
      const { isAdult, isAuth } = yield* RenderedStateContractView();
      return ifNode(
        isAuth,
        () => button('increment', {}, isAdult),
        () => p('signed out'),
      );
    },
  );

  type Template = TemplateChildren<ComponentTemplateOf<typeof component>>;
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
  const { NamedListContractView, provideNamedListContractView } = craftService(
    { name: 'namedListContractView', providedIn: 'toProvide' },
    function* () {
      const counterList = yield* state('counterList', [1, 2]);
      return { counterList };
    },
  );

  const component = craftComponent(
    'namedListContractComponent',
    { providers: [provideNamedListContractView()] },
    function* () {
      const { counterList } = yield* NamedListContractView();
      return forNode(
        counterList,
        { track: (item) => item, empty: () => p('empty') },
        () => button('item', {}, 'item'),
      );
    },
  );

  type Template = TemplateChildren<ComponentTemplateOf<typeof component>>;
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
  const {
    NestedTranslatedLabelsContractView,
    provideNestedTranslatedLabelsContractView,
  } = craftService(
    { name: 'nestedTranslatedLabelsContractView', providedIn: 'toProvide' },
    function* () {
      const items = yield* state(
        'items',
        [{ key: 'first' }, { key: 'second' }],
        insertSelect('item', ({ state: selectedItem }) => ({
          // Named, because a template contract identifies a member by the name
          // its primitive carries.
          translatedLabel: craftComputed('translatedLabel', function* () {
            return `translated:${(yield* selectedItem()).key}`;
          }),
        })),
      );
      return { items };
    },
  );

  const component = craftComponent(
    'nestedTranslatedLabelsContractComponent',
    { providers: [provideNestedTranslatedLabelsContractView()] },
    function* () {
      const { items } = yield* NestedTranslatedLabelsContractView();
      return forNode(items, { track: (item) => item.key }, (_item, index) =>
        span(
          'itemLabel',
          {
            'aria-label': items.selectItem(index)?.translatedLabel,
          },
          function* () {
            const label = items.selectItem(index)?.translatedLabel;
            return label ? yield* label() : '';
          },
        ),
      );
    },
  );

  type Template = TemplateChildren<ComponentTemplateOf<typeof component>>;
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
        'translatedLabel',
        { when: { items: 'nonEmpty' } }
      >,
      true
    >
  >;
});

it('tracks available actions through conditional template branches', () => {
  const { AvailableActionContractView, provideAvailableActionContractView } =
    craftService(
      { name: 'availableActionContractView', providedIn: 'toProvide' },
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
    );

  const component = craftComponent(
    'availableActionContractComponent',
    { providers: [provideAvailableActionContractView()] },
    function* () {
      const { isAuth, increment } = yield* AvailableActionContractView();
      return ifNode(
        isAuth,
        () => button('increment', { click: increment }, '+'),
        () => p('signed out'),
      );
    },
  );

  type Template = TemplateChildren<ComponentTemplateOf<typeof component>>;
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
  const {
    SynchronousReactiveTemplateReadsView,
    provideSynchronousReactiveTemplateReadsView,
  } = craftService(
    { name: 'synchronousReactiveTemplateReadsView', providedIn: 'toProvide' },
    function* () {
      const users = yield* state('users', [{ id: 1, name: 'Ada' }]);
      return { users };
    },
  );

  const component = craftComponent(
    'synchronousReactiveTemplateReads',
    { providers: [provideSynchronousReactiveTemplateReadsView()] },
    function* () {
      const { users } = yield* SynchronousReactiveTemplateReadsView();
      return [
        span(String(craftUse(users()).length)),
        forNode(
          () => craftUse(users()),
          { track: (user) => user.id },
          (user) => p(user.name),
        ),
      ];
    },
  );

  void component;
});

it('accepts nullable each sources', () => {
  let items!: readonly { key: string }[] | null | undefined;

  forNode(items, { track: (item) => item.key }, (item) =>
    p(function* () {
      return (yield* item()).key;
    }),
  );
});
