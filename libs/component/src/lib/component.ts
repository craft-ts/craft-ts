import type { CraftComponentDependencies } from '@craft-ng/core';
import {
  CRAFT_COMPONENT,
  CRAFT_DIRECTIVE,
  type ComponentFactory,
  type ComponentMeta,
  type ComponentTemplate,
  type CraftComponent,
  type FactoryContext,
  type FactoryYielded,
  type PropsFromContext,
} from './types';
import type { HostProps } from './hyperscript';
import type { ComponentNode } from './render/vnode';
import {
  applyHostPropsToChildren,
  mergeHostProps,
} from './render/vnode';

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
  template: ComponentTemplate<FactoryContext<Factory>>,
): CraftComponent<
  PropsFromContext<FactoryContext<Factory>>,
  CraftComponentDependencies<
    FactoryYielded<Factory>,
    FactoryContext<Factory>,
    ProvidersFromMeta<Meta>,
    PropsFromContext<FactoryContext<Factory>>
  >,
  Factory,
  Meta
> {
  return createCraftComponent({
    meta,
    factory,
    template,
  });
}

function createCraftComponent<
  const Meta extends ComponentMeta,
  Factory extends ComponentFactory,
>(definition: {
  readonly meta: Meta;
  readonly factory: Factory;
  readonly template: ComponentTemplate<FactoryContext<Factory>>;
}): CraftComponent<
  PropsFromContext<FactoryContext<Factory>>,
  CraftComponentDependencies<
    FactoryYielded<Factory>,
    FactoryContext<Factory>,
    ProvidersFromMeta<Meta>,
    PropsFromContext<FactoryContext<Factory>>
  >,
  Factory,
  Meta
> {
  type Props = PropsFromContext<FactoryContext<Factory>>;
  type ComponentDeps = CraftComponentDependencies<
    FactoryYielded<Factory>,
    FactoryContext<Factory>,
    ProvidersFromMeta<Meta>,
    Props
  >;

  // Keep host props in the template pipeline. This lets a directive pass
  // additional host props to its base template while preserving props that
  // were already supplied by the component caller.
  const hostAwareTemplate: ComponentTemplate<FactoryContext<Factory>> = (
    context,
    hostProps,
  ) => {
    const effectiveHostProps = mergeHostProps(
      definition.meta.host ?? {},
      hostProps ?? {},
    );
    return applyHostPropsToChildren(
      definition.template(context, effectiveHostProps),
      effectiveHostProps,
    );
  };

  const craftComponent = ((
    props: Props & HostProps = {} as Props & HostProps,
  ): ComponentNode<Props & HostProps> => ({
    kind: 'component',
    component: craftComponent,
    props,
  })) as CraftComponent<Props, ComponentDeps, Factory, Meta>;

  Object.defineProperty(craftComponent, CRAFT_COMPONENT, {
    value: { ...definition, template: hostAwareTemplate },
    enumerable: false,
  });

  Object.defineProperty(craftComponent, 'pipe', {
    value: (directive: {
      readonly [CRAFT_DIRECTIVE]: {
        readonly logic: (baseLogic: ComponentFactory) => ComponentFactory;
        readonly template: (
          baseTemplate: ComponentTemplate<any>,
        ) => ComponentTemplate<any>;
      };
    }) =>
      createCraftComponent({
        meta: definition.meta,
        factory: directive[CRAFT_DIRECTIVE].logic(definition.factory),
        template: directive[CRAFT_DIRECTIVE].template(hostAwareTemplate),
      }),
    enumerable: false,
  });

  return craftComponent;
}
