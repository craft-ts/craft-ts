import type { Provider } from '@angular/core';
import type {
  ComponentDepsCarrier,
  CraftComponentDependencies,
  ResolveGeneratorResult,
  YieldableMethod,
  Yieldable,
} from '@craft-ng/core';
import type { Signal } from '@angular/core';
import type { HostProps } from './hyperscript';
import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  ComponentNode,
} from './render/vnode';

declare const INPUT_BRAND: unique symbol;
declare const OUTPUT_BRAND: unique symbol;
declare const TEMPLATE_METHOD_USE: unique symbol;

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

type ProjectTemplateObject<Value extends object, ContextMethod extends string> = {
  [Key in keyof Value]: ProjectTemplateValue<
    Value[Key],
    ContextPathKey<ContextMethod, Key>
  >;
};

type ProjectTemplateValue<Value, ContextMethod extends string> =
  Value extends YieldableMethod<infer Args, infer Result, infer Yielded>
    ? YieldableTemplateCallback<Args, Result, Yielded, ContextMethod>
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
          : Value extends (...args: any[]) => any
            ? Value
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
    : Context[Key] extends Output<(...args: any[]) => unknown>
      ? Key
      : never]: Context[Key] extends Input<infer Value>
    ? InputValue<Value>
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
}

type ComponentCallProps<Props extends object> = Props & HostProps;

type ProvidersFromMeta<Meta extends ComponentMeta> = Meta extends {
  readonly providers: infer Providers;
}
  ? Providers
  : readonly [];

type AppliedDirectiveFactory<
  Factory extends ComponentFactory,
  Directive extends CraftDirective,
> =
  Directive extends CraftDirective<infer Logic, any>
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
            ProvidersFromMeta<Meta>,
            PropsFromContext<FactoryContext<NextFactory>>,
            TemplateDependencies | CraftDirectiveTemplateDependencies<Directive>
          >
        >,
        NextFactory,
        Meta,
        RootFactory,
        TemplateDependencies | CraftDirectiveTemplateDependencies<Directive>,
        Template
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
> extends ComponentDepsCarrier<ComponentDeps> {
  <CallProps extends ComponentCallProps<Props> = ComponentCallProps<Props>>(
    ...args: keyof Props extends never
      ? [props?: CallProps]
      : [props: CallProps]
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
      Name
    >
  >;
  readonly [CRAFT_COMPONENT]: ComponentDefinition<unknown> & {
    readonly name: Name;
  };
  readonly pipe: <Directive extends CraftDirective>(
    directive: Directive,
  ) => PipedComponent<
    Factory,
    Meta,
    Directive,
    RootFactory,
    ComponentDeps,
    TemplateDependencies,
    Template
  >;
}

export type ComponentTemplateOf<Component> =
  Component extends CraftComponent<
    any,
    any,
    any,
    any,
    any,
    any,
    infer Template extends ComponentTemplate<any>
  >
    ? Template
    : never;

export type PropsOf<Component> =
  Component extends CraftComponent<infer Props, any> ? Props : never;

export function isCraftComponent(
  value: unknown,
): value is CraftComponent<object> {
  return typeof value === 'function' && CRAFT_COMPONENT in value;
}
