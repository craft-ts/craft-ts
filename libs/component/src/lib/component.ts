import {
  CRAFT_REGISTRATION_TARGET,
  type CraftComponentDependencies,
  type CraftServiceTransform,
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
  type FactoryYielded,
  type PropsFromFactory,
  type StyleOwner,
  type TemplateDependencies,
  type TemplateCssVars,
  type TemplateHeadingNeed,
  type TemplateInput,
  type TemplatePendingSources,
  type TemplateSettledExceptions,
  type ValidComponentFactoryInputs,
} from './types';
import type { CssVarsContractOfMeta } from './css-vars.type';
import type { ComponentNode, ComponentTemplateChannels } from './render/vnode';
import type { HostProps } from './hyperscript';
import { currentCraftRenderContext, pipeCraftNode } from './render/vnode';

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
  [Key in keyof TemplateInput<Factory>]: NonNullable<
    TemplateInput<Factory>[Key]
  > extends (...args: any[]) => any
    ? Key
    : never;
}[keyof TemplateInput<Factory>] &
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

type ComponentOf<
  Name extends string,
  Meta extends ComponentMeta,
  Template extends ComponentFactory,
> = CraftComponent<
  PropsFromFactory<Template>,
  CraftComponentDependencies<
    FactoryYielded<Template>,
    unknown,
    ProvidersFromMeta<Meta>,
    PropsFromFactory<Template>,
    TemplateDependencies<Template>
  >,
  Template,
  Meta,
  Template,
  TemplateDependencies<Template>,
  Template,
  Name,
  ComponentInitializationExceptionCodesForTemplate<
    Template,
    ProvidersFromMeta<Meta>,
    Template
  >,
  ContentRequirementsOfContext<TemplateInput<Template>>,
  ComponentResidualFieldExceptions<Template, Template>
>;

/**
 * Declares a component: one function taking the component's inputs, reaching
 * its services with `yield*`, and returning what it renders.
 *
 * Local state does not live here — it lives in a `craftService` the component
 * provides, so a rerender reads the same instance instead of building a new one.
 */
export function craftComponent<
  const Name extends string,
  const Meta extends ComponentMeta,
  Template extends ComponentFactory,
>(
  name: Name,
  meta: Meta & ValidContentStyles<Meta, Template>,
  template: Template &
    ValidComponentFactoryInputs<Template, Meta> &
    ValidInheritedCssVars<Meta, NoInfer<Template>> &
    ValidPendingSources<NoInfer<Template>> &
    ValidSettledExceptions<NoInfer<Template>> &
    ValidHeadingNeed<NoInfer<Template>> &
    ValidSeals<Meta, NoInfer<Template>>,
): ComponentOf<Name, Meta, Template> {
  return createCraftComponent<Name, Meta, Template>({
    name,
    meta,
    template,
    service: [],
    styleOwners: [{ name, styles: mergeStyles(meta.styles, meta.stylesUrl) }],
    scopeDefinition: undefined,
  });
}

function createCraftComponent<
  const Name extends string,
  const Meta extends ComponentMeta,
  Template extends ComponentFactory,
>(definition: {
  readonly name: Name;
  readonly meta: Meta;
  readonly template: Template;
  readonly service: readonly CraftServiceTransform[];
  readonly styleOwners: readonly StyleOwner[];
  readonly scopeDefinition: object | undefined;
  readonly composition?: ComponentCompositionDefinition;
}): ComponentOf<Name, Meta, Template> {
  type Props = PropsFromFactory<Template>;
  type ComponentDeps = CraftComponentDependencies<
    FactoryYielded<Template>,
    unknown,
    ProvidersFromMeta<Meta>,
    Props,
    TemplateDependencies<Template>
  >;

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
  }) as unknown as ComponentOf<Name, Meta, Template>;

  const scopeDefinition = definition.scopeDefinition ?? {};
  const styleOwners = definition.styleOwners.map((owner, index) =>
    index === 0 && !owner.definition
      ? { ...owner, definition: scopeDefinition }
      : owner,
  );

  Object.defineProperty(craftComponent, CRAFT_COMPONENT, {
    value: {
      ...definition,
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
        readonly [CRAFT_DIRECTIVE]?: DirectiveDefinition;
        (...args: any[]): unknown;
      }[]
    ) =>
      directives.reduce<unknown>((current, directive) => {
        const currentComponent = current as CraftComponent<any>;
        const resolvedDirective = (
          CRAFT_DIRECTIVE in directive ? directive : directive(currentComponent)
        ) as { readonly [CRAFT_DIRECTIVE]: DirectiveDefinition };
        const applied = resolvedDirective[CRAFT_DIRECTIVE];
        const currentDefinition = currentComponent[CRAFT_COMPONENT];
        return createCraftComponent<any, any, any>({
          name: currentDefinition.name,
          meta: currentDefinition.meta,
          template: applied.template
            ? applied.template(currentDefinition.template)
            : currentDefinition.template,
          service: [...currentDefinition.service, ...applied.service],
          styleOwners: [
            ...currentDefinition.styleOwners,
            {
              name: applied.name,
              styles: mergeStyles(
                applied.meta.styles,
                applied.meta.stylesUrl,
              ),
              definition: applied,
              registrationTarget: resolvedDirective,
            },
          ],
          scopeDefinition: currentDefinition.scopeDefinition,
          composition: mergeComponentComposition(
            currentDefinition.composition,
            applied.componentOperator,
          ),
        });
      }, craftComponent),
    enumerable: false,
  });

  return craftComponent;
}

type DirectiveDefinition = {
  readonly name: string;
  readonly meta: {
    readonly styles?: string | readonly string[];
    readonly stylesUrl?: string | readonly string[];
  };
  readonly service: readonly CraftServiceTransform[];
  readonly template?: (baseTemplate: ComponentTemplate) => ComponentTemplate;
  readonly componentOperator?: ComponentCompositionDefinition;
};

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
