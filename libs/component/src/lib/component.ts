import {
  CRAFT_REGISTRATION_TARGET,
  type CraftComponentDependencies,
} from '@craft-ng/core';
import {
  CRAFT_COMPONENT,
  CRAFT_DIRECTIVE,
  type ComponentFactory,
  type ComponentMeta,
  type ComponentCompositionDefinition,
  type ComponentInitializationExceptionCodesForTemplate,
  type ComponentTemplate,
  type ContentRequirementsOfContext,
  type CraftComponent,
  type FactoryContext,
  type FactoryYielded,
  type PropsFromFactory,
  type StyleOwner,
  type TemplateDependencies,
} from './types';
import type { HostProps } from './hyperscript';
import type { ComponentNode } from './render/vnode';
import {
  applyHostPropsToChildren,
  currentCraftRenderContext,
  mergeHostProps,
  pipeCraftNode,
} from './render/vnode';

type ProvidersFromMeta<Meta extends ComponentMeta> = Meta extends {
  readonly providers: infer Providers;
}
  ? Providers
  : readonly [];

function mergeStyles(
  ...sources: readonly (string | readonly string[] | undefined)[]
): readonly string[] {
  return sources.flatMap((source) =>
    typeof source === 'string' ? [source] : (source ?? []),
  );
}

type ContentSlotNamesForFactory<Factory extends ComponentFactory> = {
  [Key in keyof PropsFromFactory<Factory>]: NonNullable<
    PropsFromFactory<Factory>[Key]
  > extends (...args: any[]) => any
    ? Key
    : never;
}[keyof PropsFromFactory<Factory>] &
  string;

type ValidContentStyles<
  Meta extends ComponentMeta,
  Factory extends ComponentFactory,
> = Meta extends { readonly contentStyles?: infer Styles }
  ? Exclude<
      keyof NonNullable<Styles>,
      ContentSlotNamesForFactory<NoInfer<Factory>>
    > extends never
    ? unknown
    : never
  : unknown;

export function craftComponent<
  const Name extends string,
  const Meta extends ComponentMeta,
  Factory extends ComponentFactory,
  Template extends ComponentTemplate<FactoryContext<Factory>>,
>(
  name: Name,
  meta: Meta & ValidContentStyles<Meta, Factory>,
  factory: Factory,
  template: Template,
): CraftComponent<
  PropsFromFactory<Factory>,
  CraftComponentDependencies<
    FactoryYielded<Factory>,
    FactoryContext<Factory>,
    ProvidersFromMeta<Meta>,
    PropsFromFactory<Factory>,
    TemplateDependencies<Template>
  >,
  Factory,
  Meta,
  Factory,
  TemplateDependencies<Template>,
  Template,
  Name,
  ComponentInitializationExceptionCodesForTemplate<
    Factory,
    ProvidersFromMeta<Meta>,
    Template
  >,
  ContentRequirementsOfContext<FactoryContext<Factory>>
> {
  return createCraftComponent<Name, Meta, Factory, Template>({
    name,
    meta,
    factory,
    template,
    styleOwners: [{ name, styles: mergeStyles(meta.styles, meta.stylesUrl) }],
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
  readonly composition?: ComponentCompositionDefinition;
}): CraftComponent<
  PropsFromFactory<Factory>,
  CraftComponentDependencies<
    FactoryYielded<Factory>,
    FactoryContext<Factory>,
    ProvidersFromMeta<Meta>,
    PropsFromFactory<Factory>,
    TemplateDependencies<Template>
  >,
  Factory,
  Meta,
  Factory,
  TemplateDependencies<Template>,
  Template,
  Name,
  ComponentInitializationExceptionCodesForTemplate<
    Factory,
    ProvidersFromMeta<Meta>,
    Template
  >,
  ContentRequirementsOfContext<FactoryContext<Factory>>
> {
  type Props = PropsFromFactory<Factory>;
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
  ): ComponentNode<Props & HostProps, ComponentDeps> => {
    const node = {
      kind: 'component',
      component: craftComponent as unknown as CraftComponent<
        any,
        ComponentDeps
      >,
      props,
      declarationContext: currentCraftRenderContext(),
    } as unknown as ComponentNode<Props & HostProps, ComponentDeps>;
    if ('key' in props) {
      Object.defineProperty(node, 'key', {
        configurable: false,
        enumerable: false,
        get: () => (props as Record<string, unknown>)['key'],
      });
    }
    Object.defineProperty(node, 'pipe', {
      value: (directive: unknown) => pipeCraftNode(node, directive as never),
      enumerable: false,
    });
    return node;
  }) as unknown as CraftComponent<
    Props,
    ComponentDeps,
    Factory,
    Meta,
    Factory,
    TemplateDependencies<Template>,
    Template,
    Name,
    ComponentInitializationExceptionCodesForTemplate<
      Factory,
      ProvidersFromMeta<Meta>,
      Template
    >
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

  Object.defineProperty(craftComponent, CRAFT_REGISTRATION_TARGET, {
    value: { kind: 'component', name: definition.name },
    enumerable: false,
  });

  Object.defineProperty(craftComponent, 'pipe', {
    value: (
      ...directives: {
        readonly [CRAFT_DIRECTIVE]?: {
          readonly name: string;
          readonly meta: {
            readonly styles?: string | readonly string[];
            readonly stylesUrl?: string | readonly string[];
          };
          readonly logic: (baseLogic: ComponentFactory) => ComponentFactory;
          readonly template: (
            baseTemplate: ComponentTemplate<any>,
          ) => ComponentTemplate<any>;
          readonly componentOperator?: ComponentCompositionDefinition;
        };
        (...args: any[]): unknown;
      }[]
    ) =>
      directives.reduce<unknown>((current, directive) => {
        const currentComponent = current as CraftComponent<any>;
        const resolvedDirective = (
          CRAFT_DIRECTIVE in directive ? directive : directive(currentComponent)
        ) as {
          readonly [CRAFT_DIRECTIVE]: {
            readonly name: string;
            readonly meta: {
              readonly styles?: string | readonly string[];
              readonly stylesUrl?: string | readonly string[];
            };
            readonly logic: (baseLogic: ComponentFactory) => ComponentFactory;
            readonly template: (
              baseTemplate: ComponentTemplate<any>,
            ) => ComponentTemplate<any>;
            readonly componentOperator?: ComponentCompositionDefinition;
          };
        };
        const currentDefinition = currentComponent[CRAFT_COMPONENT];
        const currentTemplate = currentDefinition.template;
        return createCraftComponent<any, any, any, any>({
          name: currentDefinition.name,
          meta: currentDefinition.meta,
          factory: resolvedDirective[CRAFT_DIRECTIVE].logic(
            currentDefinition.factory,
          ),
          template:
            resolvedDirective[CRAFT_DIRECTIVE].template(currentTemplate),
          styleOwners: [
            ...currentDefinition.styleOwners,
            {
              name: resolvedDirective[CRAFT_DIRECTIVE].name,
              styles: mergeStyles(
                resolvedDirective[CRAFT_DIRECTIVE].meta.styles,
                resolvedDirective[CRAFT_DIRECTIVE].meta.stylesUrl,
              ),
              definition: resolvedDirective[CRAFT_DIRECTIVE],
              registrationTarget: resolvedDirective,
            },
          ],
          scopeDefinition: currentDefinition.scopeDefinition,
          composition: mergeComponentComposition(
            currentDefinition.composition,
            resolvedDirective[CRAFT_DIRECTIVE].componentOperator,
          ),
        });
      }, craftComponent),
    enumerable: false,
  });

  return craftComponent;
}

function mergeComponentComposition(
  existing: ComponentCompositionDefinition | undefined,
  next: ComponentCompositionDefinition | undefined,
): ComponentCompositionDefinition | undefined {
  if (!existing && !next) {
    return undefined;
  }

  const providers = [
    ...(existing?.providers ?? []),
    ...(next?.providers ?? []),
  ];
  const catchHandlers = next?.catchHandlers ?? existing?.catchHandlers;
  const catchTagHandlers = next?.catchTagHandlers ?? existing?.catchTagHandlers;
  const catchBlockPosition =
    next?.catchBlockPosition ?? existing?.catchBlockPosition;

  return {
    ...(providers.length ? { providers } : {}),
    ...(catchHandlers ? { catchHandlers } : {}),
    ...(catchTagHandlers ? { catchTagHandlers } : {}),
    ...(catchBlockPosition ? { catchBlockPosition } : {}),
  };
}
