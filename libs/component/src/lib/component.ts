import {
  CRAFT_REGISTRATION_TARGET,
  type CraftComponentDependencies,
  type UnmetRequirements,
} from '@craft-ts/core';
import {
  CRAFT_COMPONENT,
  CRAFT_DIRECTIVE,
  type ComponentFactory,
  type ComponentMeta,
  type ComponentCompositionDefinition,
  type ComponentInitializationExceptionCodesForTemplate,
  type ComponentTemplate,
  type ComponentResidualFieldExceptions,
  type ContentRequirementsOfContext,
  type CraftComponent,
  type FactoryContext,
  type FactoryYielded,
  type PropsFromFactory,
  type StyleOwner,
  type TemplateDependencies,
  type TemplateCssVars,
  type TemplateHeadingNeed,
  type TemplatePendingSources,
  type TemplateSettledExceptions,
  type ValidComponentFactoryInputs,
} from './types';
import type { CssVarsContractOfMeta } from './css-vars.type';
import { forwardedCssVarStyles } from './css-vars';
import type { HostProps } from './hyperscript';
import type { ComponentNode, ComponentTemplateChannels } from './render/vnode';
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
  [Key in keyof ObjectFactoryInput<Factory>]: NonNullable<
    ObjectFactoryInput<Factory>[Key]
  > extends (...args: any[]) => any
    ? Key
    : never;
}[keyof ObjectFactoryInput<Factory>] &
  string;

type ObjectFactoryInput<Factory extends ComponentFactory> =
  Parameters<Factory> extends [infer Input]
    ? Input extends (...args: any[]) => any
      ? never
      : Input extends object
        ? Input
        : never
    : never;

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

type IsAny<Value> = 0 extends 1 & Value ? true : false;

/**
 * A template may only render an async source (`settledValue`, or a
 * `craftComputed` that consumed one with `yield* settled(...)`) from inside a
 * `pendingNode` boundary. Anything left uncovered fails here, on the template
 * argument, naming the sources that have nowhere to show their loading state.
 */
type ValidPendingSources<Template> =
  IsAny<TemplatePendingSources<Template>> extends true
    ? unknown
    : // `string` means the template's children were not narrowed at all (a
      // broadly typed template): there is no source to point at.
      string extends TemplatePendingSources<Template>
      ? unknown
      : [TemplatePendingSources<Template>] extends [never]
        ? unknown
        : {
            readonly ERROR_async_source_rendered_outside_a_pendingNode: TemplatePendingSources<Template>;
          };

/**
 * A template may only render a value whose settled read can raise an exception
 * from inside a `catchNode`. Anything left uncovered fails here, on the
 * template argument, naming the codes with nowhere to be handled.
 */
type ValidSettledExceptions<Template> =
  IsAny<TemplateSettledExceptions<Template>> extends true
    ? unknown
    : string extends TemplateSettledExceptions<Template>
      ? unknown
      : [TemplateSettledExceptions<Template>] extends [never]
        ? unknown
        : {
            readonly ERROR_settled_read_exception_not_caught_by_a_catchNode: TemplateSettledExceptions<Template>;
          };

/**
 * A reusable child may render `heading()` without a local `headingSection` —
 * the need bubbles. The *parent* that calls that child must wrap the call in
 * `headingSection` (same DNA as `pendingNode` on the parent, not the child).
 */
/**
 * A sealing component must leave no context requirement open.
 *
 * The message is composed from the payload itself — an id and a sentence the
 * vocabulary wrote — so this layer names the thing precisely while knowing
 * nothing about what it is. The requester is named because the id is the
 * requester's own, and the sentence says where to declare the answer.
 */
type ValidSeals<Meta, Template> = Meta extends { readonly seals: unknown }
  ? [UnmetRequirements<ComponentTemplateChannels<Template>>] extends [never]
    ? unknown
    : {
        readonly ERROR_unmet_context_requirement: UnmetRequirements<
          ComponentTemplateChannels<Template>
        >;
      }
  : unknown;

type ValidHeadingNeed<Template> =
  IsAny<TemplateHeadingNeed<Template>> extends true
    ? unknown
    : string extends TemplateHeadingNeed<Template>
      ? unknown
      : [Extract<TemplateHeadingNeed<Template>, 'heading-from-child'>] extends [
            never,
          ]
        ? unknown
        : {
            readonly ERROR_child_heading_rendered_outside_a_headingSection: 'heading-from-child';
          };

type ValidInheritedCssVars<Meta extends ComponentMeta, Template> =
  IsAny<TemplateCssVars<Template>['inherited']> extends true
    ? unknown
    : Exclude<
          TemplateCssVars<Template>['inherited'],
          CssVarsContractOfMeta<Meta>['declared']
        > extends infer Missing
      ? [Missing] extends [never]
        ? unknown
        : {
            readonly ERROR_css_var_marked_inherit_is_not_declared_here: Missing;
          }
      : never;

export function craftComponent<
  const Name extends string,
  const Meta extends ComponentMeta,
  Factory extends ComponentFactory,
  Template extends ComponentTemplate<FactoryContext<Factory>>,
>(
  name: Name,
  meta: Meta & ValidContentStyles<Meta, Factory>,
  factory: Factory & ValidComponentFactoryInputs<Factory>,
  template: Template &
    ValidInheritedCssVars<Meta, NoInfer<Template>> &
    ValidPendingSources<NoInfer<Template>> &
    ValidSettledExceptions<NoInfer<Template>> &
    ValidHeadingNeed<NoInfer<Template>> &
    ValidSeals<Meta, NoInfer<Template>>,
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
  ContentRequirementsOfContext<FactoryContext<Factory>>,
  ComponentResidualFieldExceptions<Factory, Template>
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
  ContentRequirementsOfContext<FactoryContext<Factory>>,
  ComponentResidualFieldExceptions<Factory, Template>
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
    const children = definition.template(context, hostProps);
    const forwardedStyles = forwardedCssVarStyles(children);
    const withForwardedDefaults = mergeHostProps(definition.meta.host ?? {}, {
      style: forwardedStyles,
    });
    const effectiveHostProps = mergeHostProps(
      withForwardedDefaults,
      hostProps ?? {},
    );
    return applyHostPropsToChildren(children, effectiveHostProps);
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
    >,
    ContentRequirementsOfContext<FactoryContext<Factory>>,
    ComponentResidualFieldExceptions<Factory, Template>
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
  const catchNodePosition =
    next?.catchNodePosition ?? existing?.catchNodePosition;
  const fieldExceptionHandlers =
    next?.fieldExceptionHandlers ?? existing?.fieldExceptionHandlers;
  const fieldExceptionOptions =
    next?.fieldExceptionOptions ?? existing?.fieldExceptionOptions;

  return {
    ...(providers.length ? { providers } : {}),
    ...(catchHandlers ? { catchHandlers } : {}),
    ...(catchTagHandlers ? { catchTagHandlers } : {}),
    ...(catchNodePosition ? { catchNodePosition } : {}),
    ...(fieldExceptionHandlers ? { fieldExceptionHandlers } : {}),
    ...(fieldExceptionOptions ? { fieldExceptionOptions } : {}),
  };
}
