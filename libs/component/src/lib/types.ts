import type { Provider } from '@angular/core';
import type {
  AnyCraftException,
  ComponentDepsCarrier,
  CraftComponentDependencies,
  CraftServiceProvider,
  ExtractCraftGenExceptions,
  ResolveGeneratorResult,
  YieldableMethod,
  NamedYieldableValue,
  CatchTagExhaustiveCodesCheck,
} from '@craft-ng/core';
import { CRAFT_SERVICE_PROVIDER_BRAND } from '@craft-ng/core';
import type { YIELDABLE_VALUE } from '@craft-ng/core';
import type { Signal } from '@angular/core';
import type { HostProps } from './hyperscript';
import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  CraftNodeChildrenExceptions,
  CraftNodeChildrenHandledExceptionCodes,
  CraftNodeDepsCarrier,
  ComponentNode,
} from './render/vnode';

declare const INPUT_BRAND: unique symbol;
declare const OUTPUT_BRAND: unique symbol;
declare const TEMPLATE_METHOD_USE: unique symbol;
declare const COMPONENT_TEMPLATE_NAME: unique symbol;
declare const COMPONENT_INITIALIZATION_EXCEPTIONS: unique symbol;
declare const COMPONENT_OPERATOR_PROVIDERS: unique symbol;
declare const COMPONENT_OPERATOR_CODES: unique symbol;
export const CRAFT_TEMPLATE = Symbol('craft-template');
export const CONTENT_INPUT = Symbol('craft-content-input');

export type Input<T> = (() => T) & {
  readonly [INPUT_BRAND]: T;
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
 * a template is type-checked. Inputs and render-time functions stay unchanged.
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
    : Key]: ProjectTemplateValue<
    Value[Key],
    ContextPathKey<ContextMethod, Key>
  >;
};

type ProjectTemplateSignalProperties<
  Value extends object,
  ContextMethod extends string,
> = {
  [Key in keyof Value as Key extends typeof YIELDABLE_VALUE
    ? never
    : Key extends keyof Signal<any>
      ? never
      : Key]: ProjectTemplateValue<
    Value[Key],
    ContextPathKey<ContextMethod, Key>
  >;
};

type ProjectTemplateValue<Value, ContextMethod extends string> =
  Value extends ContentInput<infer _Slots extends object>
    ? Value
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
        ? Value extends Signal<infer State>
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
          : Value extends Signal<infer State>
            ? (() => State & TemplateMethodUse<ContextMethod>) &
                ProjectTemplateObject<Value, ContextMethod>
            : Value extends readonly (infer Item)[]
              ? readonly ProjectTemplateValue<Item, ContextMethod>[]
              : Value extends (...args: infer Args) => infer Result
                ? (...args: Args) => ProjectTemplateValue<Result, ContextMethod>
                : Value extends object
                  ? ProjectTemplateObject<Value, ContextMethod>
                  : Value;

export type YieldableTemplateContext<Context> = {
  [Key in keyof Context]: ProjectTemplateValue<
    Context[Key],
    ContextPathKey<'', Key>
  >;
};

export type InputValue<T> = () => T;

/** A lazily evaluated, declaration-context-preserving piece of Craft content. */
export type CraftFragment<
  Output extends CraftNodeChildren = CraftNodeChildren,
> = (() => Output) &
  CraftNodeDepsCarrier<CraftNodeChildrenDependencies<Output>>;

/** A reusable, parameterized Craft fragment. */
export interface CraftTemplate<
  Context,
  Output extends CraftNodeChildren = CraftNodeChildren,
> extends CraftNodeDepsCarrier<CraftNodeChildrenDependencies<Output>> {
  (context: Context): Output;
  readonly [CRAFT_TEMPLATE]: true;
}

/** The slot map accepted by a component factory. */
export type ContentInput<Slots extends object> = Slots & {
  readonly [CONTENT_INPUT]: Slots;
};

export type ContentInputValue<Value> =
  Value extends ContentInput<infer Slots extends object> ? Slots : never;

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

export type HostRequiredLogic<Context extends object> = (
  ...args: any[]
) => Context;

export type HostTemplate<Context extends object> = ComponentTemplate<Context>;

export type LogicDecorator = (baseLogic: ComponentFactory) => ComponentFactory;

export type TemplateDecorator = (
  baseTemplate: ComponentTemplate<any>,
) => ComponentTemplate<any>;

export const CRAFT_DIRECTIVE = Symbol('craft-directive');
declare const CRAFT_DIRECTIVE_DEPS: unique symbol;

export interface CraftDirective<
  Logic extends LogicDecorator = LogicDecorator,
  Template extends (
    baseTemplate: ComponentTemplate<any>,
  ) => any = TemplateDecorator,
  TemplateDependencies extends object = {},
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

export type PropsFromContext<Context> = Simplify<{
  [Key in keyof Context as Context[Key] extends Input<unknown>
    ? Key
    : Context[Key] extends ContentInput<object>
      ? Key
      : Context[Key] extends Output<(...args: any[]) => unknown>
        ? Key
        : never]: Context[Key] extends Input<infer Value>
    ? InputValue<Value>
    : Context[Key] extends ContentInput<infer Slots extends object>
      ? Slots
      : Context[Key] extends Output<infer Handler>
        ? Handler
        : never;
}>;

export const CRAFT_COMPONENT = Symbol('craft-component');

export interface ComponentMeta<
  Providers extends readonly Provider[] = readonly Provider[],
> {
  readonly providers?: Providers;
  readonly host?: Readonly<Record<string, unknown>>;
  readonly styles?: string | readonly string[];
}

export interface DirectiveMeta {
  readonly styles?: string | readonly string[];
}

export interface StyleOwner {
  readonly name: string;
  readonly styles?: string | readonly string[];
  readonly definition?: object;
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
};

export type ComponentOperatorDefinition = ComponentCompositionDefinition;

/** Internal marker carried by operators that alter component composition. */
export const COMPONENT_OPERATOR = Symbol('craft-component-operator');
export const COMPONENT_CATCH_BLOCK = Symbol('craft-component-catch-block');

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

type ComponentCallProps<Props extends object> = Props & HostProps;

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
            | Extract<Output, { readonly code: string }>
        : never
      : never;

type ComponentFactoryExceptions<Factory extends ComponentFactory> =
  | ExtractCraftGenExceptions<FactoryYielded<Factory>>
  | Extract<FactoryContext<Factory>, { readonly code: string }>;

export type ComponentInitializationExceptions<
  Factory extends ComponentFactory,
  Providers,
> = ComponentFactoryExceptions<Factory> | ProviderExceptions<Providers>;

type ComponentExceptionCodes<Exceptions> = Exceptions extends {
  readonly code: infer Code extends string;
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

type ContentSlotsCheck<Actual, Expected> = Actual extends object
  ? Expected extends object
    ? Exclude<keyof Actual, keyof Expected> extends never
      ? unknown
      : never
    : unknown
  : unknown;

type ContentPropsCheck<Actual extends object, Expected extends object> = {
  [Key in keyof Actual & keyof Expected]: ContentSlotsCheck<
    Actual[Key],
    Expected[Key]
  >;
};

type AppliedDirectiveFactory<
  Factory extends ComponentFactory,
  Directive extends CraftDirective,
> =
  Directive extends ComponentOperator<any, any>
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

type PipedComponent<
  Factory extends ComponentFactory,
  Meta extends ComponentMeta,
  Directive extends CraftDirective,
  RootFactory extends ComponentFactory,
  ExistingComponentDeps extends object,
  ExistingExceptions extends string,
  TemplateDependencies extends object,
  Template extends ComponentTemplate<
    FactoryContext<Factory>
  > = ComponentTemplate<FactoryContext<Factory>>,
> =
  AppliedDirectiveFactory<Factory, Directive> extends infer NextFactory extends
    ComponentFactory
    ? CraftComponent<
        PropsFromContext<FactoryContext<NextFactory>>,
        MergePipedComponentDependencies<
          ExistingComponentDeps,
          CraftComponentDependencies<
            FactoryYielded<RootFactory> | FactoryYielded<NextFactory>,
            FactoryContext<NextFactory>,
            ProvidersFromMeta<Meta> | ComponentOperatorProviders<Directive>,
            PropsFromContext<FactoryContext<NextFactory>>,
            TemplateDependencies | CraftDirectiveTemplateDependencies<Directive>
          >
        >,
        NextFactory,
        Meta,
        RootFactory,
        TemplateDependencies | CraftDirectiveTemplateDependencies<Directive>,
        Template,
        string,
        ComponentExceptionsAfterOperator<
          Factory,
          Meta,
          Directive,
          ExistingExceptions
        > &
          ComponentOperatorExhaustiveCheck<
            Factory,
            Meta,
            Directive,
            ExistingExceptions
          >,
        ContentPropsOfContext<FactoryContext<NextFactory>>
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
  ContentProps extends object = {},
> extends ComponentDepsCarrier<ComponentDeps> {
  <CallProps extends ComponentCallProps<Props> = ComponentCallProps<Props>>(
    ...args: keyof Props extends never
      ? [props?: CallProps & ContentPropsCheck<CallProps, ContentProps>]
      : [props: CallProps & ContentPropsCheck<CallProps, ContentProps>]
  ): ComponentNode<
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
      InitializationExceptions
    >
  >;
  readonly [CRAFT_COMPONENT]: ComponentDefinition<unknown> & {
    readonly name: Name;
  };
  readonly [COMPONENT_INITIALIZATION_EXCEPTIONS]: InitializationExceptions;
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
          InitializationExceptions
        >,
      ) => Directive &
        ComponentOperatorExhaustiveCheck<
          Factory,
          Meta,
          Directive,
          InitializationExceptions,
          ComponentTemplateHandledExceptionCodes<Template>
        >,
    ): PipedComponent<
      Factory,
      Meta,
      Directive,
      RootFactory,
      ComponentDeps,
      InitializationExceptions,
      TemplateDependencies,
      Template
    >;
    <Directive extends CraftDirective>(
      directive: Directive &
        ComponentOperatorExhaustiveCheck<
          Factory,
          Meta,
          Directive,
          InitializationExceptions,
          ComponentTemplateHandledExceptionCodes<Template>
        >,
    ): PipedComponent<
      Factory,
      Meta,
      Directive,
      RootFactory,
      ComponentDeps,
      InitializationExceptions,
      TemplateDependencies,
      Template
    >;
    (
      ...directives: readonly [CraftDirective, CraftDirective]
    ): CraftComponent<any, any>;
  };
}

export type ComponentInitializationExceptionsOf<Component> = Component extends {
  readonly [COMPONENT_INITIALIZATION_EXCEPTIONS]: infer Exceptions extends
    string;
}
  ? Exceptions
  : never;

export type ContentPropsOfContext<Context> = Simplify<{
  [Key in keyof Context as Context[Key] extends ContentInput<object>
    ? Key
    : never]: Context[Key] extends ContentInput<infer Slots extends object>
    ? Slots
    : never;
}>;

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
