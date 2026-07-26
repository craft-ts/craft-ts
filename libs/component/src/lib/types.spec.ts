import { expectTypeOf, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import {
  craftRoutes,
  craftService,
  provideHostName,
  type ComponentDepsOf,
  type RouteCheckedDI,
} from '@craft-ng/core';
import { loadCraftComponent } from './bridge';
import { craftComponent } from './component';
import { craftDirective } from './directive';
import { div, p } from './hyperscript';
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
      [
        'The TypeSpecService service is not provided in this component',
      ]
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
      [
        'The MissingProvider service is not provided in this component',
      ]
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
