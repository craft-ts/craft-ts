import type {
  CraftComponentDependencies,
  ResolveGeneratorResult,
} from '@craft-ng/core';
import {
  CRAFT_COMPONENT,
  type ComponentFactory,
  type ComponentMeta,
  type CraftComponent,
  type PropsFromContext,
} from './types';
import type { ComponentNode, CraftNodeChildren } from './render/vnode';

type FactoryContext<Factory extends ComponentFactory> = Awaited<
  ResolveGeneratorResult<ReturnType<Factory>>
>;

type FactoryYielded<Factory extends ComponentFactory> =
  ReturnType<Factory> extends Generator<infer Yielded, any, any>
    ? Yielded
    : never;

type ProvidersFromMeta<Meta extends ComponentMeta> = Meta extends {
  readonly providers: infer Providers;
}
  ? Providers
  : readonly [];

export function component<
  const Meta extends ComponentMeta,
  Factory extends ComponentFactory,
>(
  meta: Meta,
  factory: Factory,
  template: (context: FactoryContext<Factory>) => CraftNodeChildren,
): CraftComponent<
  PropsFromContext<FactoryContext<Factory>>,
  CraftComponentDependencies<
    FactoryYielded<Factory>,
    FactoryContext<Factory>,
    ProvidersFromMeta<Meta>,
    PropsFromContext<FactoryContext<Factory>>
  >
> {
  type Props = PropsFromContext<FactoryContext<Factory>>;
  type ComponentDeps = CraftComponentDependencies<
    FactoryYielded<Factory>,
    FactoryContext<Factory>,
    ProvidersFromMeta<Meta>,
    Props
  >;

  const definition = {
    meta,
    factory,
    template,
  };

  const craftComponent = ((
    props: Props = {} as Props,
  ): ComponentNode<Props> => ({
    kind: 'component',
    component: craftComponent,
    props,
  })) as CraftComponent<Props, ComponentDeps>;

  Object.defineProperty(craftComponent, CRAFT_COMPONENT, {
    value: definition,
    enumerable: false,
  });

  return craftComponent;
}
