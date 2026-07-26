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
  type StyleOwner,
} from './types';
import type { HostProps } from './hyperscript';
import type { ComponentNode } from './render/vnode';
import { applyHostPropsToChildren, mergeHostProps } from './render/vnode';

type ProvidersFromMeta<Meta extends ComponentMeta> = Meta extends {
  readonly providers: infer Providers;
}
  ? Providers
  : readonly [];

export function craftComponent<
  const Name extends string,
  const Meta extends ComponentMeta,
  Factory extends ComponentFactory,
>(
  name: Name,
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
    name,
    meta,
    factory,
    template,
    styleOwners: [{ name, styles: meta.styles }],
    scopeDefinition: undefined,
  });
}

function createCraftComponent<
  const Meta extends ComponentMeta,
  Factory extends ComponentFactory,
>(definition: {
  readonly name: string;
  readonly meta: Meta;
  readonly factory: Factory;
  readonly template: ComponentTemplate<FactoryContext<Factory>>;
  readonly styleOwners: readonly StyleOwner[];
  readonly scopeDefinition: object | undefined;
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

  const scopeDefinition = definition.scopeDefinition ?? {};
  const styleOwners = definition.styleOwners.map((owner, index) =>
    index === 0 && !owner.definition
      ? { ...owner, definition: scopeDefinition }
      : owner,
  );

  Object.defineProperty(craftComponent, CRAFT_COMPONENT, {
    value: {
      ...definition,
      template: hostAwareTemplate,
      scopeDefinition,
      styleOwners,
    },
    enumerable: false,
  });

  Object.defineProperty(craftComponent, 'pipe', {
    value: (directive: {
      readonly [CRAFT_DIRECTIVE]: {
        readonly name: string;
        readonly meta: { readonly styles?: string | readonly string[] };
        readonly logic: (baseLogic: ComponentFactory) => ComponentFactory;
        readonly template: (
          baseTemplate: ComponentTemplate<any>,
        ) => ComponentTemplate<any>;
      };
    }) =>
      createCraftComponent({
        name: definition.name,
        meta: definition.meta,
        factory: directive[CRAFT_DIRECTIVE].logic(definition.factory),
        template: directive[CRAFT_DIRECTIVE].template(hostAwareTemplate),
        styleOwners: [
          ...definition.styleOwners,
          {
            name: directive[CRAFT_DIRECTIVE].name,
            styles: directive[CRAFT_DIRECTIVE].meta.styles,
            definition: directive[CRAFT_DIRECTIVE],
          },
        ],
        scopeDefinition,
      }),
    enumerable: false,
  });

  return craftComponent;
}
