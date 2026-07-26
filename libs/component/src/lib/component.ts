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
  type TemplateDependencies,
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
  Template extends ComponentTemplate<FactoryContext<Factory>>,
>(
  name: Name,
  meta: Meta,
  factory: Factory,
  template: Template,
): CraftComponent<
  PropsFromContext<FactoryContext<Factory>>,
  CraftComponentDependencies<
    FactoryYielded<Factory>,
    FactoryContext<Factory>,
    ProvidersFromMeta<Meta>,
    PropsFromContext<FactoryContext<Factory>>,
    TemplateDependencies<Template>
  >,
  Factory,
  Meta,
  Factory,
  TemplateDependencies<Template>,
  Template,
  Name
> {
  return createCraftComponent<Name, Meta, Factory, Template>({
    name,
    meta,
    factory,
    template,
    styleOwners: [{ name, styles: meta.styles }],
    scopeDefinition: undefined,
  });
}

function createCraftComponent<
  const Name extends string,
  const Meta extends ComponentMeta,
  Factory extends ComponentFactory,
  Template extends ComponentTemplate<FactoryContext<Factory>>,
>(definition: {
  readonly name: Name;
  readonly meta: Meta;
  readonly factory: Factory;
  readonly template: Template;
  readonly styleOwners: readonly StyleOwner[];
  readonly scopeDefinition: object | undefined;
}): CraftComponent<
  PropsFromContext<FactoryContext<Factory>>,
  CraftComponentDependencies<
    FactoryYielded<Factory>,
    FactoryContext<Factory>,
    ProvidersFromMeta<Meta>,
    PropsFromContext<FactoryContext<Factory>>,
    TemplateDependencies<Template>
  >,
  Factory,
  Meta,
  Factory,
  TemplateDependencies<Template>,
  Template,
  Name
> {
  type Props = PropsFromContext<FactoryContext<Factory>>;
  type ComponentDeps = CraftComponentDependencies<
    FactoryYielded<Factory>,
    FactoryContext<Factory>,
    ProvidersFromMeta<Meta>,
    Props,
    TemplateDependencies<Template>
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
  ): ComponentNode<Props & HostProps, ComponentDeps> => ({
    kind: 'component',
    component: craftComponent,
    props,
  })) as CraftComponent<
    Props,
    ComponentDeps,
    Factory,
    Meta,
    Factory,
    TemplateDependencies<Template>,
    Template,
    Name
  >;

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
      createCraftComponent<any, any, any, any>({
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
