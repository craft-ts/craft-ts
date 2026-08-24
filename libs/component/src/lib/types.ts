import type {
  AnyCraftException,
  ComponentDepsCarrier,
  CraftComponentDependencies,
  CraftServiceProvider,
  ExtractCraftGenExceptions,
  ResolveGeneratorResult,
  Yieldable,
  YieldableMethod,
  NamedYieldableValue,
  CatchTagExhaustiveCodesCheck,
  CraftRegistrationTarget,
  CraftNodeDirectiveMount,
  CRAFT_FIELD_VALIDATION_CASES,
  CraftFieldValidationCasesCarrier,
  ReactiveReadRequest,
  DEEP_YIELDABLE,
  YIELDABLE_DEPENDENCY,
  YieldableReactiveValue,
} from '@craft-ts/core';
import { CRAFT_SERVICE_PROVIDER_BRAND } from '@craft-ts/core';
import type {
  CraftChannels,
  EmptyChannels,
  ɵRAW_REACTIVE_VALUE as RAW_REACTIVE_VALUE,
  REACTIVE_VALUE_TYPE,
  YIELDABLE_VALUE,
} from '@craft-ts/core';
import type { HostProps } from './hyperscript';
import type { StaticLocatorCriteria } from './locator';
import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  CraftNodeChildrenCssVars,
  CraftNodeChildrenPendingSources,
  CraftNodeChildrenHeadingNeed,
  CraftNodeChildrenSettledExceptions,
  CraftNodeChildrenExceptions,
  CraftNodeChildrenFieldExceptions,
  CraftNodeChildrenRawFieldExceptions,
  CraftNodeChildrenHandledExceptionCodes,
  CraftNodeDepsCarrier,
  ComponentNode,
  ComponentTemplateChannels,
  ContentDependenciesFromProps,
  ElementNodeBase,
} from './render/vnode';
import type {
  CssVarContract,
  CssVarsAfterCall,
  CssVarsCallProps,
  CssVarsContractOfMeta,
  CssVarsMetaDeclaration,
  MergeCssVarContracts,
} from './css-vars.type';
import type {
  FieldExceptionBlockDirective,
  FieldExceptionBlockExhaustiveCheck,
  FieldExceptionBlockPartialCheck,
  FieldExceptionBlockOptions,
  FieldExceptionHandlerFieldExceptions,
  FieldExceptionHandlerChildren,
  FieldExceptionHandlers,
  ResidualFieldValidationCases,
  ResidualFieldValidationCasesByIdentity,
  FieldValidationHandledIdentitiesOf,
  UnhandledFieldValidationCases,
} from './field-exception-block';

export type CraftProvider = unknown;
type HostReader<T> = () => T;
type HostSignal<T> = HostReader<T> &
  Omit<
    YieldableReactiveValue<T, string>,
    | typeof RAW_REACTIVE_VALUE
    | typeof REACTIVE_VALUE_TYPE
    | typeof YIELDABLE_VALUE
  >;

declare const INPUT_BRAND: unique symbol;
declare const OUTPUT_BRAND: unique symbol;
declare const TEMPLATE_METHOD_USE: unique symbol;
declare const COMPONENT_TEMPLATE_NAME: unique symbol;
declare const COMPONENT_INITIALIZATION_EXCEPTIONS: unique symbol;
declare const COMPONENT_FIELD_EXCEPTIONS: unique symbol;
declare const COMPONENT_LOGIC_OUTPUT: unique symbol;
declare const COMPONENT_OPERATOR_PROVIDERS: unique symbol;
declare const COMPONENT_OPERATOR_CODES: unique symbol;
export const CONTENT_STYLE_POLICY = Symbol('craft-content-style-policy');
export const CONTENT_OUTPUT = Symbol('craft-content-output');
export const CONTENT_REQUIREMENT = Symbol('craft-content-requirement');
export const CONTENT_RENDERABLE = Symbol('craft-content-renderable');
export const CONTENT_DECLARATION_CONTEXT = Symbol(
  'craft-content-declaration-context',
);
export const PROJECTION_CONTRACT = Symbol('craft-projection-contract');
export const CRAFT_TEMPLATE = Symbol('craft-template');

/** Type-only carrier for exceptions raised while evaluating a component input. */
export declare const CRAFT_INPUT_EXCEPTIONS: unique symbol;

export type CraftInputExceptionsCarrier<Exceptions extends string = string> = {
  readonly [CRAFT_INPUT_EXCEPTIONS]?: Exceptions;
};

/**
 * A component input is a yieldable reader.
 *
 * Inputs deliberately use the same read contract as Craft primitives: callers
 * can pass a primitive reader directly and component logic/templates consume
 * it with `yield* input()`.
 */
export type Input<T> = Yieldable<[], T> & {
  readonly [INPUT_BRAND]?: T;
};

export type Output<Handler extends (...args: any[]) => unknown> = Handler & {
  readonly [OUTPUT_BRAND]: Handler;
};

/** A callback that a Craft template may delegate with `yield*`. */
export type YieldableTemplateCallback<
  Args extends unknown[] = unknown[],
  Result = unknown,
  Yielded = unknown,
  ContextMethod extends string = never,
> = (
  ...args: Args
) => Generator<Yielded | TemplateMethodUse<ContextMethod>, Result, unknown>;

export type TemplateMethodUse<ContextMethod extends string> = {
  readonly [TEMPLATE_METHOD_USE]: ContextMethod;
};

/**
 * Projects branded Craft methods and outputs to generator callbacks only while
 * a template is type-checked. Inputs already use the generator reader
 * contract, while ordinary render-time functions stay unchanged.
 */
type ContextPathKey<
  Prefix extends string,
  Key extends PropertyKey,
> = Key extends string | number
  ? Prefix extends ''
    ? `${Key}`
    : `${Prefix}.${Key}`
  : Prefix;

type ProjectTemplateObject<
  Value extends object,
  ContextMethod extends string,
> = {
  [Key in keyof Value as Key extends typeof YIELDABLE_VALUE
    ? never
    : Key extends typeof RAW_REACTIVE_VALUE
      ? never
      : Key extends typeof REACTIVE_VALUE_TYPE
        ? never
        : Key extends typeof YIELDABLE_DEPENDENCY
          ? never
          : Key extends typeof DEEP_YIELDABLE
            ? never
            : Key extends '__craftDeepYieldable'
              ? never
              : Key]: Key extends typeof CRAFT_FIELD_VALIDATION_CASES
    ? Value[Key]
    : ProjectTemplateValue<Value[Key], ContextPathKey<ContextMethod, Key>>;
};

type ProjectTemplateSignalProperties<
  Value extends object,
  ContextMethod extends string,
> = {
  [Key in keyof Value as Key extends typeof YIELDABLE_VALUE
    ? never
    : Key extends typeof REACTIVE_VALUE_TYPE
      ? never
      : Key extends keyof HostSignal<any>
        ? never
        : Key]: ProjectTemplateValue<
    Value[Key],
    ContextPathKey<ContextMethod, Key>
  >;
};

// Brand-only check: `Value extends RenderableContent` expands CraftNodeChildren
// and cycles back here through component nodes (TS2456).
type ProjectTemplateValue<Value, ContextMethod extends string> = Value extends {
  readonly [CONTENT_RENDERABLE]: true;
}
  ? Value
  : Value extends ProjectionUnit<any>
    ? Value
    : Value extends { readonly __craftDeepYieldable: true }
      ? ProjectTemplateDeepYieldableValue<Value, ContextMethod>
      : Value extends {
            readonly [REACTIVE_VALUE_TYPE]: infer ReactiveState;
          }
        ? YieldableTemplateCallback<
            [],
            ReactiveState,
            ReactiveReadRequest<ReactiveState>,
            ContextMethod
          > & {
            readonly [YIELDABLE_VALUE]: ContextMethod;
          } & ProjectTemplateObject<Value & object, ContextMethod>
        : Value extends YieldableMethod<infer Args, infer Result, infer Yielded>
          ? Value extends NamedYieldableValue<
              infer _Name extends string,
              infer _Value
            >
            ? NamedYieldableValue<
                ContextMethod,
                YieldableTemplateCallback<Args, Result, Yielded, ContextMethod>
              >
            : YieldableTemplateCallback<Args, Result, Yielded, ContextMethod>
          : Value extends NamedYieldableValue<
                infer _Name extends string,
                infer _Value
              >
            ? Value extends HostSignal<infer State>
              ? NamedYieldableValue<
                  ContextMethod,
                  () => State & TemplateMethodUse<ContextMethod>
                > &
                  ProjectTemplateSignalProperties<Value & object, ContextMethod>
              : Value extends object
                ? ProjectTemplateObject<Value & object, ContextMethod>
                : Value
            : Value extends {
                  readonly [OUTPUT_BRAND]: infer Handler extends (
                    ...args: any[]
                  ) => unknown;
                }
              ? YieldableTemplateCallback<
                  Parameters<Handler>,
                  ReturnType<Handler>,
                  unknown,
                  ContextMethod
                >
              : Value extends HostSignal<infer State>
                ? NamedYieldableValue<
                    ContextMethod,
                    () => State & TemplateMethodUse<ContextMethod>
                  > &
                    ProjectTemplateObject<Value, ContextMethod>
                : Value extends readonly (infer Item)[]
                  ? readonly ProjectTemplateValue<Item, ContextMethod>[]
                  : Value extends (
                        ...args: infer Args
                      ) => Generator<infer Yielded, infer Result, any>
                    ? (
                        ...args: Args
                      ) => Generator<
                        Yielded | TemplateMethodUse<ContextMethod>,
                        Result,
                        unknown
                      >
                    : Value extends (...args: infer Args) => infer Result
                      ? ((
                          ...args: Args
                        ) => ProjectTemplateValue<Result, ContextMethod>) &
                          ProjectTemplateObject<Value & object, ContextMethod>
                      : Value extends object
                        ? ProjectTemplateObject<Value, ContextMethod>
                        : Value;

type ProjectTemplateDeepYieldableValue<
  Value,
  ContextMethod extends string,
> = Value extends (
  ...args: infer Args
) => Generator<infer Yielded, infer Result, any>
  ? ((
      ...args: Args
    ) => Generator<
      Yielded | TemplateMethodUse<ContextMethod>,
      Result,
      unknown
    >) &
      ProjectTemplateObject<Value & object, ContextMethod>
  : ProjectTemplateObject<Value & object, ContextMethod>;

type DirectTemplateContextMethod<Context> =
  Context extends NamedYieldableValue<infer Name extends string, any>
    ? Name
    : '';

export type YieldableTemplateContext<Context> = Context extends {
  readonly [REACTIVE_VALUE_TYPE]: unknown;
}
  ? ProjectTemplateValue<Context, DirectTemplateContextMethod<Context>>
  : {
      [Key in keyof Context]: ProjectTemplateValue<
        Context[Key],
        ContextPathKey<'', Key>
      >;
    };

/** Public call-site shape of an {@link Input}. */
export type InputValue<T> = Yieldable<[], T>;

export type ContentStylePolicy = 'isolated' | 'allow-container-styles';

/** A lazily evaluated, declaration-context-preserving piece of Craft content. */
export type RenderableContent<
  Output extends CraftNodeChildren = CraftNodeChildren,
> = (() => Output) &
  CraftNodeDepsCarrier<CraftNodeChildrenDependencies<Output>> & {
    readonly [CONTENT_RENDERABLE]: true;
  };

export type ContentSlot<Output extends CraftNodeChildren = CraftNodeChildren> =
  RenderableContent<Output>;

export type ContentOptions = {
  readonly allowContainerStyles?: boolean;
};

export type ContentRequirement = {
  readonly selector: ContentSelector;
};

/** A content slot whose DOM shape is checked at each component call site. */
export type RequiredContent<Requirement extends ContentRequirement> =
  RenderableContent & { readonly [CONTENT_REQUIREMENT]: Requirement };

/**
 * Styles explicitement exposés par un composant à son contenu projeté.
 *
 * `styles` s'applique au template propre du composant. `contentStyles` ne
 * s'applique qu'à un contenu rendu via `renderContent(slotName, content)` lorsque
 * le parent a activé `allowContainerStyles` sur ce fragment.
 *
 * Le contenu projeté conserve l'injecteur de son lieu de déclaration. Ces
 * styles peuvent affecter les nœuds DOM ordinaires du fragment, mais ne
 * traversent pas les frontières des composants Craft ou Angular imbriqués.
 */
export type ContentStyles<SlotName extends string> = Partial<
  Record<SlotName, string>
>;

/** Contraintes DOM statiques qu'un fragment projeté doit satisfaire. */
export type ContentSelector = {
  readonly tag?: keyof HTMLElementTagNameMap;
  readonly class?: string;
  readonly [dataAttribute: `data-${string}`]: string | undefined;
  readonly [ariaAttribute: `aria-${string}`]: string | undefined;
};

export type ContentSelectorCondition = ContentRequirement;

/** A reusable, parameterized Craft fragment. */
export interface CraftTemplate<
  Context,
  Output extends CraftNodeChildren = CraftNodeChildren,
> extends CraftNodeDepsCarrier<CraftNodeChildrenDependencies<Output>> {
  (context: Context): Output;
  readonly [CRAFT_TEMPLATE]: true;
}

/**
 * Contrats DOM vérifiés statiquement chez l'appelant. Le type est volontairement
 * structurel : `content(...)` ne connaît pas le slot consommateur.
 */
export type ContentRequirementOf<Value> = Value extends {
  readonly [CONTENT_REQUIREMENT]: infer Requirement extends ContentRequirement;
}
  ? Requirement
  : never;

type SlotOutput<Value> = Value extends (...args: any[]) => infer Output
  ? Output
  : never;

/** Dependencies declared by the renderers stored in a slot map. */
export type ContentDependencies<Slots extends object> =
  CraftNodeChildrenDependencies<SlotOutput<NonNullable<Slots[keyof Slots]>>>;

export type ComponentFactory = (...args: any[]) => any;

export type FactoryContext<Factory extends ComponentFactory> = Awaited<
  ResolveGeneratorResult<ReturnType<Factory>>
>;

type DirectComponentLogicFieldExceptions<Value> = 0 extends 1 & Value
  ? never
  : Value extends CraftFieldValidationCasesCarrier<infer Cases>
    ? unknown extends Cases
      ? never
      : Cases
    : never;

/** Typed field-validation cases exposed by a component logic factory. */
export type ComponentLogicFieldExceptions<Context> =
  | DirectComponentLogicFieldExceptions<Context>
  | (Context extends (...args: any[]) => any
      ? never
      : Context extends object
        ? {
            [Key in keyof Context]: DirectComponentLogicFieldExceptions<
              Context[Key]
            >;
          }[keyof Context]
        : never);

type ComponentTemplateFieldExceptions<Template> = Template extends (
  ...args: any[]
) => any
  ? CraftNodeChildrenRawFieldExceptions<ReturnType<Template>>
  : never;

export type ComponentResidualFieldExceptions<Factory, Template> = 0 extends 1 &
  Factory
  ? any
  : 0 extends 1 & Template
    ? any
    : Factory extends ComponentFactory
      ? Template extends (...args: any[]) => any
        ?
            | ResidualFieldValidationCasesByIdentity<
                ComponentLogicFieldExceptions<FactoryContext<Factory>>,
                FieldValidationHandledIdentitiesOf<
                  ComponentTemplateFieldExceptions<Template>
                >
              >
            | UnhandledFieldValidationCases<
                ComponentTemplateFieldExceptions<Template>
              >
        : never
      : never;

export type FactoryYielded<Factory extends ComponentFactory> =
  ReturnType<Factory> extends Generator<infer Yielded, any, any>
    ? Yielded
    : never;

export type ComponentTemplate<
  Context = unknown,
  Output extends CraftNodeChildren = CraftNodeChildren,
> = (
  context: YieldableTemplateContext<Context>,
  hostProps?: HostProps,
) => Output;

type NamedComponentTemplate<Template, Name extends string> = Template & {
  readonly [COMPONENT_TEMPLATE_NAME]?: Name;
};

export type ComponentTemplateNameOf<Template> = Template extends {
  readonly [COMPONENT_TEMPLATE_NAME]?: infer Name extends string;
}
  ? Name
  : string;

export type TemplateDependencies<Template> = Template extends (
  ...args: any[]
) => infer Output
  ? CraftNodeChildrenDependencies<Output>
  : {};

export type TemplateCssVars<Template> = Template extends (
  ...args: any[]
) => infer Output
  ? CraftNodeChildrenCssVars<Output>
  : import('./css-vars.type').EmptyCssVarContract;

/** Async sources a template renders without covering them with a `pendingBlock`. */
export type TemplatePendingSources<Template> = Template extends (
  ...args: any[]
) => infer Output
  ? CraftNodeChildrenPendingSources<Output>
  : never;

/**
 * Heading outline a template still exposes. Local `heading()` is `'heading'`.
 * A child component with an uncovered `heading()` is `'heading-from-child'`.
 */
export type TemplateHeadingNeed<Template> = Template extends (
  ...args: any[]
) => infer Output
  ? CraftNodeChildrenHeadingNeed<Output>
  : never;

/**
 * Exception codes a template can reach through a settled read without covering
 * them with a `catchBlock`.
 */
export type TemplateSettledExceptions<Template> = Template extends (
  ...args: any[]
) => infer Output
  ? CraftNodeChildrenSettledExceptions<Output>
  : never;

export type HostRequiredLogic<Context extends object> = (
  ...args: any[]
) => Context;

export type HostTemplate<Context extends object> = ComponentTemplate<Context>;

export type LogicDecorator = (baseLogic: ComponentFactory) => ComponentFactory;

export type TemplateDecorator = (
  baseTemplate: ComponentTemplate<any>,
) => ComponentTemplate<any>;

type DirectiveInstance<Logic extends LogicDecorator> =
  ReturnType<Logic> extends ComponentFactory
    ? FactoryContext<ReturnType<Logic>>
    : unknown;

export const CRAFT_DIRECTIVE = Symbol('craft-directive');
declare const CRAFT_DIRECTIVE_DEPS: unique symbol;

export interface CraftDirective<
  Logic extends LogicDecorator = LogicDecorator,
  Template extends (
    baseTemplate: ComponentTemplate<any>,
  ) => any = TemplateDecorator,
  TemplateDependencies extends object = {},
> extends CraftRegistrationTarget<
    string,
    'directive',
    DirectiveInstance<Logic>
  > {
  readonly [CRAFT_DIRECTIVE]: {
    readonly name: string;
    readonly meta: DirectiveMeta;
    readonly logic: Logic;
    readonly template: Template;
    readonly componentOperator?: ComponentOperatorDefinition;
  };
  readonly [CRAFT_DIRECTIVE_DEPS]?: TemplateDependencies;
}

export type CraftDirectiveTemplateDependencies<Directive> =
  Directive extends CraftDirective<any, any, infer Dependencies extends object>
    ? Dependencies
    : {};

export function isCraftDirective(value: unknown): value is CraftDirective {
  return typeof value === 'function' && CRAFT_DIRECTIVE in value;
}

type Simplify<T> = { [K in keyof T]: T[K] } & {};

type IsInputContextValue<Value> = Value extends object
  ? typeof INPUT_BRAND extends keyof Value
    ? true
    : false
  : false;

type InputValueOfContextValue<Value> =
  IsInputContextValue<Value> extends true
    ? Value extends Yieldable<[], infer Result>
      ? Result
      : never
    : never;

export type PropsFromContext<Context> = Simplify<{
  [Key in keyof Context as IsInputContextValue<Context[Key]> extends true
    ? Key
    : Context[Key] extends RenderableContent
      ? Key
      : ContentRequirementOf<Context[Key]> extends never
        ? Context[Key] extends Output<(...args: any[]) => unknown>
          ? Key
          : never
        : Key]: IsInputContextValue<Context[Key]> extends true
    ? InputValue<InputValueOfContextValue<Context[Key]>>
    : Context[Key] extends RenderableContent
      ? Context[Key]
      : ContentRequirementOf<Context[Key]> extends never
        ? Context[Key] extends Output<infer Handler>
          ? Handler
          : never
        : Context[Key];
}>;

export const CRAFT_COMPONENT = Symbol('craft-component');

type ComponentProvider = (CraftProvider & any) | (CraftProvider & any)[];

export interface ComponentMeta<
  Providers extends readonly ComponentProvider[] = readonly ComponentProvider[],
  SlotName extends string = string,
> {
  readonly providers?: Providers;
  readonly host?: Readonly<Record<string, unknown>>;
  readonly styles?: string | readonly string[];
  /** CSS text imported from an external stylesheet with the build text loader. */
  readonly stylesUrl?: string | readonly string[];
  /** Explicit contract for opaque external styles. */
  readonly cssVars?: CssVarsMetaDeclaration;
  /** Styles exposed explicitly to opted-in projected fragments, by slot. */
  readonly contentStyles?: ContentStyles<SlotName>;
}

export interface DirectiveMeta {
  readonly styles?: string | readonly string[];
  /** CSS text imported from an external stylesheet with the build text loader. */
  readonly stylesUrl?: string | readonly string[];
  /** Optional behavior mounted against the concrete DOM node being decorated. */
  readonly node?: {
    readonly inputs?: readonly string[];
    readonly mount: CraftNodeDirectiveMount<any>;
  };
}

export interface StyleOwner {
  readonly name: string;
  readonly styles?: string | readonly string[];
  readonly definition?: object;
  readonly registrationTarget?: unknown;
}

export interface ComponentDefinition<Context = unknown> {
  readonly name: string;
  readonly meta: ComponentMeta;
  readonly factory: ComponentFactory;
  readonly template: ComponentTemplate<Context>;
  readonly styleOwners: readonly StyleOwner[];
  readonly scopeDefinition: object;
  readonly composition?: ComponentCompositionDefinition;
}

export type ComponentExceptionHandler = (
  exception: AnyCraftException,
) => CraftNodeChildren;

export type ComponentExceptionHandlerOptions = {
  /** Keep the component template visible while rendering the fallback. */
  readonly showSource?: boolean;
  /** Place the fallback before or after the source block. */
  readonly position?: 'before' | 'after';
};

export type ComponentExceptionHandlerDefinition =
  ComponentExceptionHandlerOptions & {
    readonly render: ComponentExceptionHandler;
  };

export type ComponentExceptionHandlerEntry =
  | ComponentExceptionHandler
  | ComponentExceptionHandlerDefinition;

export type ComponentExceptionHandlerChildren<Handler> = Handler extends (
  ...args: any[]
) => infer Children
  ? Children
  : Handler extends { readonly render: (...args: any[]) => infer Children }
    ? Children
    : never;

export type ComponentExceptionGenerator = (
  exception: AnyCraftException,
) => Generator<unknown, void, unknown>;

export type ComponentCompositionDefinition = {
  readonly providers?: readonly CraftServiceProvider[];
  readonly catchHandlers?: Readonly<
    Record<string, ComponentExceptionHandlerEntry>
  >;
  readonly catchTagHandlers?: Readonly<
    Record<string, ComponentExceptionGenerator>
  >;
  readonly catchBlockPosition?: 'before' | 'after';
  readonly fieldExceptionHandlers?: FieldExceptionHandlers;
  readonly fieldExceptionOptions?: Required<
    Pick<FieldExceptionBlockOptions, 'mode' | 'position'>
  > &
    Pick<FieldExceptionBlockOptions, 'visibility'>;
};

export type ComponentOperatorDefinition = ComponentCompositionDefinition;

/** Internal marker carried by operators that alter component composition. */
export const COMPONENT_OPERATOR = Symbol('craft-component-operator');
export const COMPONENT_CATCH_BLOCK = Symbol('craft-component-catch-block');
export const COMPONENT_FIELD_EXCEPTION_BLOCK = Symbol(
  'craft-component-field-exception-block',
);
export const FIELD_EXCEPTION_BLOCK_DIRECTIVE = Symbol(
  'craft-field-exception-block-directive',
);

export type ComponentOperator<
  Providers extends
    readonly CraftServiceProvider[] = readonly CraftServiceProvider[],
  Codes extends string = never,
> = CraftDirective & {
  readonly [COMPONENT_OPERATOR_PROVIDERS]: Providers;
  readonly [COMPONENT_OPERATOR_CODES]: Codes;
  readonly [COMPONENT_OPERATOR]: ComponentCompositionDefinition &
    (Codes extends never
      ? { readonly kind: 'providers'; readonly providers: Providers }
      :
          | {
              readonly kind: 'catchTag';
              readonly catchTagHandlers: Record<
                Codes,
                ComponentExceptionGenerator
              >;
            }
          | {
              readonly kind: 'catchBlock';
              readonly catchHandlers: Record<
                Codes,
                ComponentExceptionHandlerEntry
              >;
              readonly catchBlockPosition?: 'before' | 'after';
            });
};

type PublicComponentProps<Props extends object> = {
  [Key in keyof Props]: NonNullable<Props[Key]> extends RenderableContent
    ? () => CraftNodeChildren
    : Props[Key];
};

type ComponentCallProps<
  Props extends object,
  Contract extends CssVarContract,
> = PublicComponentProps<Props> & HostProps & CssVarsCallProps<Contract>;

export type ComponentCssVars<Meta, Template> = MergeCssVarContracts<
  CssVarsContractOfMeta<Meta>,
  TemplateCssVars<Template>
>;

type CraftInputExceptionsOf<Value> =
  Value extends CraftInputExceptionsCarrier<infer Exceptions extends string>
    ? Exceptions
    : never;

export type ComponentInputExceptionsOf<Props extends object> =
  CraftInputExceptionsOf<Props[keyof Props]>;

type ProvidersFromMeta<Meta extends ComponentMeta> = Meta extends {
  readonly providers: infer Providers;
}
  ? Providers
  : readonly [];

export type ProviderExceptions<Providers> =
  Providers extends readonly (infer Provider)[]
    ? ProviderExceptions<Provider>
    : Providers extends {
          readonly [CRAFT_SERVICE_PROVIDER_BRAND]?: infer Metadata;
        }
      ? Metadata extends {
          readonly yielded: infer Yielded;
          readonly output: infer Output;
        }
        ?
            | ExtractCraftGenExceptions<Yielded>
            | Extract<Output, { readonly _tag: string }>
        : never
      : never;

type ComponentFactoryExceptions<Factory extends ComponentFactory> =
  | ExtractCraftGenExceptions<FactoryYielded<Factory>>
  | Extract<FactoryContext<Factory>, { readonly _tag: string }>;

export type ComponentInitializationExceptions<
  Factory extends ComponentFactory,
  Providers,
> = ComponentFactoryExceptions<Factory> | ProviderExceptions<Providers>;

type ComponentExceptionCodes<Exceptions> = Exceptions extends {
  readonly _tag: infer Code extends string;
}
  ? Code
  : never;

export type ComponentInitializationExceptionCodes<
  Factory extends ComponentFactory,
  Providers,
> = ComponentExceptionCodes<
  ComponentInitializationExceptions<Factory, Providers>
>;

export type ComponentInitializationExceptionCodesForTemplate<
  Factory extends ComponentFactory,
  Providers,
  Template extends ComponentTemplate<FactoryContext<Factory>>,
> = Exclude<
  ComponentInitializationExceptionCodes<Factory, Providers>,
  Extract<CraftNodeChildrenHandledExceptionCodes<ReturnType<Template>>, string>
>;

type ComponentOperatorProviders<Operator> = Operator extends {
  readonly [COMPONENT_OPERATOR_PROVIDERS]: infer Providers;
}
  ? Providers
  : readonly [];

type ComponentOperatorHandlers<Operator> = Operator extends {
  readonly [COMPONENT_OPERATOR_CODES]: infer Codes;
}
  ? Codes
  : never;

type ComponentOperatorExceptionCodes<Operator> = ComponentExceptionCodes<
  ProviderExceptions<ComponentOperatorProviders<Operator>>
>;

type ComponentOperatorFallbackExceptionCodes<Operator> = Operator extends {
  readonly [COMPONENT_OPERATOR]: {
    readonly catchHandlers: infer Handlers extends Record<
      string,
      ComponentExceptionHandlerEntry
    >;
  };
}
  ? CraftNodeChildrenExceptions<
      ComponentExceptionHandlerChildren<Handlers[keyof Handlers]>
    >
  : never;

type ComponentExceptionsBeforeOperator<
  Factory extends ComponentFactory,
  Meta extends ComponentMeta,
  Operator,
  ExistingExceptions extends string,
> =
  | ExistingExceptions
  | ComponentInitializationExceptionCodes<Factory, ProvidersFromMeta<Meta>>
  | ComponentOperatorExceptionCodes<Operator>;

type ComponentExceptionsAfterOperator<
  Factory extends ComponentFactory,
  Meta extends ComponentMeta,
  Operator,
  ExistingExceptions extends string = never,
> = [ComponentOperatorHandlers<Operator>] extends [never]
  ? ComponentExceptionsBeforeOperator<
      Factory,
      Meta,
      Operator,
      ExistingExceptions
    >
  :
      | Exclude<
          ComponentExceptionsBeforeOperator<
            Factory,
            Meta,
            Operator,
            ExistingExceptions
          >,
          ComponentOperatorHandlers<Operator>
        >
      | ComponentOperatorFallbackExceptionCodes<Operator>;

type ComponentOperatorExhaustiveCheck<
  Factory extends ComponentFactory,
  Meta extends ComponentMeta,
  Operator,
  ExistingExceptions extends string,
  HandledByTemplate extends string = never,
> = [ComponentOperatorHandlers<Operator>] extends [never]
  ? unknown
  : CatchTagExhaustiveCodesCheck<
      ComponentExceptionsBeforeOperator<
        Factory,
        Meta,
        Operator,
        ExistingExceptions
      >,
      Record<Extract<ComponentOperatorHandlers<Operator>, string>, unknown>
    > &
      (Operator extends { readonly [COMPONENT_CATCH_BLOCK]: true }
        ? [
            Extract<ComponentOperatorHandlers<Operator>, HandledByTemplate>,
          ] extends [never]
          ? unknown
          : {
              'catchBlock.exhaustive has handlers for codes already handled by the template': Extract<
                ComponentOperatorHandlers<Operator>,
                HandledByTemplate
              >;
            }
        : unknown);

type ComponentTemplateHandledExceptionCodes<
  Template extends ComponentTemplate<any>,
> = Extract<
  CraftNodeChildrenHandledExceptionCodes<ReturnType<Template>>,
  string
>;

type NextContentSelectorDepth<Depth extends readonly unknown[]> = [
  ...Depth,
  unknown,
];

type IsAnyContentSelector<Value> = 0 extends 1 & Value ? true : false;

type ContentSelectorCandidate<
  Tag extends keyof HTMLElementTagNameMap,
  Criteria extends object,
> = {
  readonly tag: Tag;
  readonly criteria: Criteria;
};

type VisitProjectedContent<
  Node,
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? never
  : IsAnyContentSelector<Node> extends true
    ? never
    : Node extends readonly (infer Child)[]
      ? VisitProjectedContent<Child, NextContentSelectorDepth<Depth>>
      : Node extends ElementNodeBase<
            any,
            infer Tag extends keyof HTMLElementTagNameMap,
            infer Props,
            infer Children
          >
        ?
            | ContentSelectorCandidate<Tag, StaticLocatorCriteria<Props>>
            | VisitProjectedContent<Children, NextContentSelectorDepth<Depth>>
        : Node extends {
              readonly kind: 'directive';
              readonly node: infer DirectiveNode;
            }
          ? VisitProjectedContent<
              DirectiveNode,
              NextContentSelectorDepth<Depth>
            >
          : Node extends {
                readonly kind: 'if';
                readonly whenTrue: () => infer TrueChildren;
                readonly whenFalse?: () => infer FalseChildren;
              }
            ? VisitProjectedContent<
                TrueChildren | FalseChildren,
                NextContentSelectorDepth<Depth>
              >
            : Node extends {
                  readonly kind: 'each';
                  readonly itemTemplate: (...args: any[]) => infer ItemChildren;
                  readonly empty?: () => infer EmptyChildren;
                }
              ? VisitProjectedContent<
                  ItemChildren | EmptyChildren,
                  NextContentSelectorDepth<Depth>
                >
              : Node extends {
                    readonly kind: 'defer';
                    readonly resolve: (...args: any[]) => infer Resolved;
                  }
                ? VisitProjectedContent<
                    Resolved,
                    NextContentSelectorDepth<Depth>
                  >
                : never;

type ContentSelectorCriteria<Selector extends ContentSelector> = Omit<
  Selector,
  'tag'
>;

type ContentSelectorMatches<Candidate, Selector extends ContentSelector> =
  Candidate extends ContentSelectorCandidate<infer Tag, infer Available>
    ? Selector extends {
        readonly tag: infer WantedTag extends keyof HTMLElementTagNameMap;
      }
      ? Tag extends WantedTag
        ? ContentSelectorCriteria<Selector> extends Partial<Available>
          ? true
          : false
        : false
      : ContentSelectorCriteria<Selector> extends Partial<Available>
        ? true
        : false
    : false;

type MatchingProjectedContent<
  Candidates,
  Selector extends ContentSelector,
> = Candidates extends unknown
  ? ContentSelectorMatches<Candidates, Selector> extends true
    ? Candidates
    : never
  : never;

type ContentSelectorContractCheck<Output, Selector extends ContentSelector> = [
  MatchingProjectedContent<VisitProjectedContent<Output>, Selector>,
] extends [never]
  ? {
      readonly 'projected content does not satisfy the declared selector': Selector;
    }
  : unknown;

type ContentConditionsCheck<
  Actual extends object,
  Requirements extends object,
> = {
  [Key in keyof Actual & keyof Requirements]: Requirements[Key] extends {
    readonly selector: infer Selector extends ContentSelector;
  }
    ? ContentSelectorContractCheck<
        SlotOutput<NonNullable<Actual[Key]>>,
        Selector
      >
    : unknown;
};

type IsLogicInputObject<Value> = Value extends (...args: any[]) => any
  ? false
  : Value extends object
    ? true
    : false;

type LogicInputProps<Factory extends ComponentFactory> =
  Parameters<Factory> extends [infer Input]
    ? IsLogicInputObject<Input> extends true
      ? Simplify<Input & object>
      : never
    : never;

export type PropsFromFactory<Factory extends ComponentFactory> = [
  LogicInputProps<Factory>,
] extends [never]
  ? PropsFromContext<FactoryContext<Factory>>
  : LogicInputProps<Factory>;

type ContentRequirementsFromContext<Context> = Simplify<{
  [Key in keyof Context as ContentRequirementOf<Context[Key]> extends never
    ? never
    : Key]: ContentRequirementOf<Context[Key]>;
}>;

type ContentRequirementsOfFactory<Factory extends ComponentFactory> =
  ContentRequirementsFromContext<FactoryContext<Factory>>;

type ProjectionOutputOf<Component> = Component extends {
  readonly [COMPONENT_LOGIC_OUTPUT]: infer Output;
}
  ? Output
  : never;

export type ProjectionContractOf<Component> =
  ProjectionOutputOf<Component> extends {
    readonly contract: infer Contract;
  }
    ? Contract
    : never;

type ProjectionKeyOf<Component> =
  ProjectionOutputOf<Component> extends {
    readonly key: infer Key extends PropertyKey;
  }
    ? Key
    : never;

export type ProjectionUnit<
  Contract = unknown,
  Key extends PropertyKey = PropertyKey,
> = ComponentNode<any, any> & {
  readonly key: Key;
  readonly [PROJECTION_CONTRACT]?: Contract;
};

export type ProjectionSlot<Contract> = readonly ProjectionUnit<Contract>[];

export type ProjectionOf<Component> = [
  ProjectionContractOf<Component>,
] extends [never]
  ? never
  : ProjectionUnit<ProjectionContractOf<Component>, ProjectionKeyOf<Component>>;

type ComponentCallNode<
  CallProps extends object,
  ComponentDeps extends object,
  Component extends CraftComponent<any, ComponentDeps>,
  Factory extends ComponentFactory,
  InputProps extends object = {},
  CssVars extends
    CssVarContract = import('./css-vars.type').EmptyCssVarContract,
  Channels extends CraftChannels = EmptyChannels,
> =
  ComponentInputExceptionsOf<
    Pick<CallProps, keyof InputProps & keyof CallProps>
  > extends infer InputExceptions extends string
    ? FactoryContext<Factory> extends {
        readonly contract: infer Contract;
        readonly key: infer Key extends PropertyKey;
      }
      ? ComponentNode<
          CallProps,
          ComponentDeps,
          Component,
          ContentDependenciesFromProps<CallProps>,
          InputExceptions,
          CssVars,
          never,
          never,
          Channels
        > &
          ProjectionUnit<Contract, Key>
      : ComponentNode<
          CallProps,
          ComponentDeps,
          Component,
          ContentDependenciesFromProps<CallProps>,
          InputExceptions,
          CssVars,
          never,
          never,
          Channels
        >
    : never;

type AppliedDirectiveFactory<
  Factory extends ComponentFactory,
  Directive extends CraftDirective,
> = Directive extends { readonly [COMPONENT_FIELD_EXCEPTION_BLOCK]: true }
  ? Factory
  : Directive extends ComponentOperator<any, any>
    ? Factory
    : Directive extends CraftDirective<infer Logic, any>
      ? ReturnType<Logic> extends ComponentFactory
        ? ReturnType<Logic>
        : Factory
      : Factory;

type MissingProviderMap<Dependencies> = Dependencies extends {
  missingProvider: infer Missing extends object;
}
  ? Missing
  : {};

type MergePipedComponentDependencies<
  Existing extends object,
  Recomputed extends object,
> = Simplify<
  Omit<Recomputed, 'missingProvider'> & {
    missingProvider: Simplify<
      MissingProviderMap<Existing> & MissingProviderMap<Recomputed>
    >;
  }
>;

type ComponentFieldExceptionsAfterOperator<ExistingFieldExceptions, Directive> =
  Directive extends FieldExceptionBlockDirective<
    infer Handlers extends FieldExceptionHandlers,
    boolean
  >
    ?
        | ResidualFieldValidationCases<ExistingFieldExceptions, Handlers>
        | FieldExceptionHandlerFieldExceptions<Handlers>
    : ExistingFieldExceptions;

type ComponentFieldExceptionOperatorCheck<ExistingFieldExceptions, Directive> =
  Directive extends FieldExceptionBlockDirective<
    infer Handlers extends FieldExceptionHandlers,
    infer Exhaustive extends boolean
  >
    ? Exhaustive extends true
      ? FieldExceptionBlockExhaustiveCheck<ExistingFieldExceptions, Handlers>
      : FieldExceptionBlockPartialCheck<ExistingFieldExceptions, Handlers>
    : unknown;

type ComponentFieldExceptionFallbackExceptionCodes<Directive> =
  Directive extends FieldExceptionBlockDirective<
    infer Handlers extends FieldExceptionHandlers,
    boolean
  >
    ? CraftNodeChildrenExceptions<
        FieldExceptionHandlerChildren<Handlers[keyof Handlers]>
      >
    : never;

type PipedComponent<
  Factory extends ComponentFactory,
  Meta extends ComponentMeta,
  Directive extends CraftDirective,
  RootFactory extends ComponentFactory,
  ExistingComponentDeps extends object,
  ExistingExceptions extends string,
  ExistingFieldExceptions,
  TemplateDependencies extends object,
  Template extends ComponentTemplate<
    FactoryContext<Factory>
  > = ComponentTemplate<FactoryContext<Factory>>,
  Name extends string = string,
> =
  AppliedDirectiveFactory<Factory, Directive> extends infer NextFactory extends
    ComponentFactory
    ? CraftComponent<
        PropsFromFactory<NextFactory>,
        MergePipedComponentDependencies<
          ExistingComponentDeps,
          CraftComponentDependencies<
            FactoryYielded<RootFactory> | FactoryYielded<NextFactory>,
            FactoryContext<NextFactory>,
            ProvidersFromMeta<Meta> | ComponentOperatorProviders<Directive>,
            PropsFromFactory<NextFactory>,
            TemplateDependencies | CraftDirectiveTemplateDependencies<Directive>
          >
        >,
        NextFactory,
        Meta,
        RootFactory,
        TemplateDependencies | CraftDirectiveTemplateDependencies<Directive>,
        Template &
          ComponentTemplate<FactoryContext<NextFactory>, ReturnType<Template>>,
        Name,
        (
          | ComponentExceptionsAfterOperator<
              Factory,
              Meta,
              Directive,
              ExistingExceptions
            >
          | ComponentFieldExceptionFallbackExceptionCodes<Directive>
        ) &
          ComponentOperatorExhaustiveCheck<
            Factory,
            Meta,
            Directive,
            ExistingExceptions
          >,
        ContentRequirementsOfFactory<NextFactory>,
        ComponentFieldExceptionsAfterOperator<
          ExistingFieldExceptions,
          Directive
        >
      >
    : never;

export interface CraftComponent<
  Props extends object = Record<never, never>,
  ComponentDeps extends object = Record<never, never>,
  Factory extends ComponentFactory = ComponentFactory,
  Meta extends ComponentMeta = ComponentMeta,
  RootFactory extends ComponentFactory = Factory,
  TemplateDependencies extends object = never,
  Template extends ComponentTemplate<
    FactoryContext<Factory>
  > = ComponentTemplate<FactoryContext<Factory>>,
  Name extends string = string,
  InitializationExceptions extends string = string,
  ContentRequirements extends object = {},
  FieldExceptions = any,
> extends ComponentDepsCarrier<ComponentDeps>,
    CraftRegistrationTarget<Name, 'component', FactoryContext<Factory>> {
  <
    CallProps extends ComponentCallProps<
      Props,
      ComponentCssVars<Meta, Template>
    > = ComponentCallProps<Props, ComponentCssVars<Meta, Template>>,
  >(
    ...args: keyof Props extends never
      ? [
          props?: CallProps &
            ContentConditionsCheck<NoInfer<CallProps>, ContentRequirements>,
        ]
      : [
          props: CallProps &
            ContentConditionsCheck<NoInfer<CallProps>, ContentRequirements>,
        ]
  ): ComponentCallNode<
    CallProps,
    ComponentDeps,
    CraftComponent<
      Props,
      ComponentDeps,
      Factory,
      Meta,
      RootFactory,
      TemplateDependencies,
      Template,
      Name,
      InitializationExceptions,
      ContentRequirements,
      FieldExceptions
    >,
    Factory,
    Props,
    CssVarsAfterCall<ComponentCssVars<Meta, Template>, CallProps>,
    ComponentTemplateChannels<Template>
  >;
  readonly [CRAFT_COMPONENT]: ComponentDefinition<unknown> & {
    readonly name: Name;
    readonly factory: Factory;
  };
  readonly [COMPONENT_INITIALIZATION_EXCEPTIONS]: InitializationExceptions;
  readonly [COMPONENT_FIELD_EXCEPTIONS]: FieldExceptions;
  readonly [COMPONENT_LOGIC_OUTPUT]: FactoryContext<Factory>;
  readonly pipe: {
    <Directive extends CraftDirective>(
      directiveFactory: (
        component: CraftComponent<
          Props,
          ComponentDeps,
          Factory,
          Meta,
          RootFactory,
          TemplateDependencies,
          Template,
          Name,
          InitializationExceptions,
          ContentRequirements,
          FieldExceptions
        >,
      ) => Directive &
        ComponentOperatorExhaustiveCheck<
          Factory,
          Meta,
          Directive,
          InitializationExceptions,
          ComponentTemplateHandledExceptionCodes<Template>
        > &
        ComponentFieldExceptionOperatorCheck<FieldExceptions, Directive>,
    ): PipedComponent<
      Factory,
      Meta,
      Directive,
      RootFactory,
      ComponentDeps,
      InitializationExceptions,
      FieldExceptions,
      TemplateDependencies,
      Template,
      Name
    >;
    <Directive extends CraftDirective>(
      directive: Directive &
        ComponentOperatorExhaustiveCheck<
          Factory,
          Meta,
          Directive,
          InitializationExceptions,
          ComponentTemplateHandledExceptionCodes<Template>
        > &
        ComponentFieldExceptionOperatorCheck<FieldExceptions, Directive>,
    ): PipedComponent<
      Factory,
      Meta,
      Directive,
      RootFactory,
      ComponentDeps,
      InitializationExceptions,
      FieldExceptions,
      TemplateDependencies,
      Template,
      Name
    >;
    (
      ...directives: readonly [CraftDirective, CraftDirective]
    ): CraftComponent<any, any>;
  };
}

export type ComponentCssVarsOf<Component> =
  Component extends CraftComponent<
    any,
    any,
    any,
    infer Meta,
    any,
    any,
    infer Template,
    any,
    any,
    any,
    any
  >
    ? ComponentCssVars<Meta, Template>
    : import('./css-vars.type').EmptyCssVarContract;

export type ComponentNameOf<Component> =
  Component extends CraftComponent<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer Name,
    any,
    any,
    any
  >
    ? Name
    : string;

export type ComponentInitializationExceptionsOf<Component> = Component extends {
  readonly [COMPONENT_INITIALIZATION_EXCEPTIONS]: infer Exceptions extends
    string;
}
  ? Exceptions
  : never;

export type ComponentFieldExceptionsOf<Component> = Component extends {
  readonly [COMPONENT_FIELD_EXCEPTIONS]: infer FieldExceptions;
}
  ? Exclude<FieldExceptions, undefined>
  : never;

/** The value returned by a component's logic factory. */
export type ComponentLogicOutputOf<Component> = Component extends {
  readonly [COMPONENT_LOGIC_OUTPUT]: infer Output;
}
  ? Output
  : never;

export type ContentRequirementsOfContext<Context> =
  ContentRequirementsFromContext<Context>;

export type ComponentTemplateOf<Component> =
  Component extends CraftComponent<
    any,
    any,
    any,
    any,
    any,
    any,
    infer Template extends ComponentTemplate<any>,
    infer Name extends string
  >
    ? NamedComponentTemplate<Template, Name>
    : never;

export type PropsOf<Component> =
  Component extends CraftComponent<infer Props, any> ? Props : never;

export function isCraftComponent(
  value: unknown,
): value is CraftComponent<object> {
  return typeof value === 'function' && CRAFT_COMPONENT in value;
}
