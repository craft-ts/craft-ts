import type {
  CraftComponent,
  ComponentTemplateOf,
  FactoryContext,
  Output,
  PropsOf,
  TemplateMethodUse,
} from './types';
import type { Yieldable, YieldableMethod } from '@craft-ng/core';
import type {
  AngularComponentNode,
  ComponentNode,
  CraftDirectiveNode,
  CraftNodeChildren,
  DeferNode,
  EachNode,
  ElementNodeBase,
} from './render/vnode';

export type TemplateContractError<Message extends string> = {
  readonly error: Message;
};

type IsAny<Value> = 0 extends 1 & Value ? true : false;

type IsUnion<Value, Whole = Value> = Value extends any
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

type ContractErrors<Result> = Extract<Result, TemplateContractError<string>>;

type ContractResult<Result> = [ContractErrors<Result>] extends [never]
  ? true
  : ContractErrors<Result>;

type Registered<
  Component,
  Registry extends readonly CraftComponent<any, any>[],
> = [Component] extends [Registry[number]] ? true : false;

type ComponentName<Component> =
  Component extends CraftComponent<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer Name
  >
    ? Name
    : 'anonymous';

type ComponentPropsMatch<
  ActualProps,
  Component extends CraftComponent<any, any>,
> =
  IsAny<ActualProps> extends true
    ? TemplateContractError<`Props for component ${ComponentName<Component>} could not be inferred.`>
    : InvalidComponentProps<ActualProps, Component>;

type InvalidComponentProps<
  ActualProps,
  Component extends CraftComponent<any, any>,
> = {
  [Key in keyof PropsOf<Component>]-?: Key extends keyof ActualProps
    ? ActualProps[Key] extends PropsOf<Component>[Key]
      ? never
      : TemplateContractError<`Prop ${Key & string} on component ${ComponentName<Component>} has an incompatible type.`>
    : TemplateContractError<`Prop ${Key & string} is missing on component ${ComponentName<Component>}.`>;
}[keyof PropsOf<Component>] extends never
  ? true
  : {
      [Key in keyof PropsOf<Component>]-?: Key extends keyof ActualProps
        ? ActualProps[Key] extends PropsOf<Component>[Key]
          ? never
          : TemplateContractError<`Prop ${Key & string} on component ${ComponentName<Component>} has an incompatible type.`>
        : TemplateContractError<`Prop ${Key & string} is missing on component ${ComponentName<Component>}.`>;
    }[keyof PropsOf<Component>];

type IsTemplateCallback<Value> = Value extends
  | Yieldable<any, any, any>
  | YieldableMethod<any, any, any>
  ? true
  : false;

type InvalidCallback<Message extends string, Value> =
  IsTemplateCallback<Value> extends true
    ? never
    : TemplateContractError<Message>;

type DomEventKey = keyof GlobalEventHandlersEventMap & string;

type InvalidElementCallbacks<Props> = {
  [Key in keyof Props & string]: Key extends DomEventKey
    ? Props[Key] extends (...args: any[]) => any
      ? InvalidCallback<
          `Event ${Key} must use a generator callback or a branded Craft method.`,
          Props[Key]
        >
      : never
    : Key extends `on${Capitalize<DomEventKey>}`
      ? Props[Key] extends (...args: any[]) => any
        ? InvalidCallback<
            `Event ${Key} must use a generator callback or a branded Craft method.`,
            Props[Key]
          >
        : never
      : never;
}[keyof Props & string];

type FactoryOf<Component> =
  Component extends CraftComponent<any, any, infer Factory> ? Factory : never;

type OutputKeys<Component> = {
  [Key in keyof FactoryContext<FactoryOf<Component>>]: FactoryContext<
    FactoryOf<Component>
  >[Key] extends Output<(...args: any[]) => any>
    ? Key
    : never;
}[keyof FactoryContext<FactoryOf<Component>>];

type InvalidOutputCallbacks<
  ActualProps,
  Component extends CraftComponent<any, any>,
> = {
  [Key in OutputKeys<Component> & string]: Key extends keyof ActualProps
    ? ActualProps[Key] extends (...args: any[]) => any
      ? InvalidCallback<
          `Output ${Key} on component ${ComponentName<Component>} must use a generator callback or a branded Craft method.`,
          ActualProps[Key]
        >
      : never
    : never;
}[OutputKeys<Component> & string];

type ComponentOfNode<Node> = Node extends {
  readonly component: infer Component;
}
  ? Component extends CraftComponent<any, any>
    ? Component
    : never
  : never;

type VisitChildren<
  Children,
  Registry extends readonly CraftComponent<any, any>[],
  Seen extends readonly unknown[],
> = Children extends readonly (infer Child)[]
  ? VisitChildren<Child, Registry, Seen>
  : Children extends ElementNodeBase<any, any, infer Props, infer Nested>
    ? InvalidElementCallbacks<Props> | VisitChildren<Nested, Registry, Seen>
    : Children extends ComponentNode<infer ActualProps, any, any>
      ?
          | ComponentPropsMatch<ActualProps, ComponentOfNode<Children>>
          | InvalidOutputCallbacks<ActualProps, ComponentOfNode<Children>>
          | VisitComponent<ComponentOfNode<Children>, Registry, Seen>
      : Children extends CraftDirectiveNode<any>
        ? VisitChildren<Children['node'], Registry, Seen>
        : Children extends EachNode<
              infer _Item,
              infer _Key,
              infer _Dependencies
            >
          ? VisitChildren<
              | ReturnType<Children['itemTemplate']>
              | (Children['empty'] extends (...args: any[]) => infer Empty
                  ? Empty
                  : never),
              Registry,
              Seen
            >
          : Children extends DeferNode<infer Loaded, infer _Dependencies>
            ? VisitChildren<
                Loaded extends CraftComponent<any, any>
                  ? ComponentNode<PropsOf<Loaded>, {}, Loaded>
                  : ReturnType<Children['resolve']>,
                Registry,
                Seen
              >
            : Children extends AngularComponentNode
              ? TemplateContractError<'Angular component nodes are external to the Craft template contract and must be tested separately.'>
              : true;

type VisitComponent<
  Component extends CraftComponent<any, any>,
  Registry extends readonly CraftComponent<any, any>[],
  Seen extends readonly unknown[],
> =
  IsAny<Component> extends true
    ? TemplateContractError<'Dynamic component references cannot be resolved.'>
    : IsUnion<Component> extends true
      ? TemplateContractError<'Union component references cannot be resolved by the template contract; register a concrete component.'>
      : Registered<Component, Registry> extends true
        ? Component extends Seen[number]
          ? true
          : VisitChildren<
              ReturnType<ComponentTemplateOf<Component>>,
              Registry,
              [...Seen, Component]
            >
        : TemplateContractError<`Component ${ComponentName<Component>} is missing from the template registry.`>;

type RootVisit<
  Component extends CraftComponent<any, any>,
  Registry extends readonly CraftComponent<any, any>[],
> = VisitChildren<
  ReturnType<ComponentTemplateOf<Component>>,
  Registry,
  [Component]
>;

export type TemplateContractAssertions<
  Component extends CraftComponent<any, any>,
  Registry extends readonly CraftComponent<any, any>[],
> = {
  readonly component: Component;
  readonly registry: Registry;
  readonly valid: true;
};

/**
 * Type-only template setup contract. It never creates an Angular fixture or
 * touches the DOM; invalid child registrations resolve to a diagnostic type.
 */
export type SetupTestComponentTemplate<
  Component extends CraftComponent<any, any>,
  Registry extends readonly CraftComponent<any, any>[] = [],
> =
  ContractResult<RootVisit<Component, Registry>> extends infer Result
    ? Result extends TemplateContractError<any>
      ? Result
      : TemplateContractAssertions<Component, Registry>
    : never;

type ElementMatching<Children, Tag extends string, Props> =
  Children extends ElementNodeBase<any, infer ActualTag, infer ActualProps>
    ? ActualTag extends Tag
      ? [Props] extends [never]
        ? true
        : ActualProps extends Props
          ? Props extends ActualProps
            ? true
            : false
          : false
      : false
    : never;

type FindElement<
  Children,
  Tag extends string,
  Props = never,
> = Children extends readonly (infer Child)[]
  ? FindElement<Child, Tag, Props>
  : Children extends ElementNodeBase<any, infer ActualTag, any>
    ? ActualTag extends Tag
      ? ElementMatching<Children, Tag, Props>
      : FindElement<Children['children'], Tag, Props>
    : Children extends CraftDirectiveNode<any>
      ? FindElement<Children['node'], Tag, Props>
      : Children extends ComponentNode<any, any, infer Component>
        ? FindElement<ReturnType<ComponentTemplateOf<Component>>, Tag, Props>
        : Children extends EachNode<any, any>
          ? FindElement<
              | ReturnType<Children['itemTemplate']>
              | (Children['empty'] extends (...args: any[]) => infer Empty
                  ? Empty
                  : never),
              Tag,
              Props
            >
          : Children extends DeferNode<infer Loaded>
            ? FindElement<
                Loaded extends CraftComponent<any, any>
                  ? ReturnType<ComponentTemplateOf<Loaded>>
                  : ReturnType<Children['resolve']>,
                Tag,
                Props
              >
            : false;

export type TemplateHasElement<
  Children extends CraftNodeChildren,
  Tag extends string,
> = FindElement<Children, Tag>;

/** Checks the exact tag and props of a matching element. */
export type TemplateHasElementWithProps<
  Children extends CraftNodeChildren,
  Tag extends string,
  Props extends object,
> = FindElement<Children, Tag, Props>;

type VisitProperty<
  Children,
  Tag extends string,
  Property extends string,
  Value,
> = Children extends readonly (infer Child)[]
  ? VisitProperty<Child, Tag, Property, Value>
  : Children extends ElementNodeBase<
        any,
        infer ActualTag,
        infer Props,
        infer Nested
      >
    ? ActualTag extends Tag
      ? Property extends keyof Props
        ? NonNullable<Props[Property]> extends Value
          ? true
          : false
        : false
      : VisitProperty<Nested, Tag, Property, Value>
    : Children extends CraftDirectiveNode<any>
      ? VisitProperty<Children['node'], Tag, Property, Value>
      : Children extends ComponentNode<any, any, infer Component>
        ? VisitProperty<
            ReturnType<ComponentTemplateOf<Component>>,
            Tag,
            Property,
            Value
          >
        : Children extends EachNode<any, any>
          ? VisitProperty<
              (
                | ReturnType<Children['itemTemplate']>
                | (Children['empty'] extends (...args: any[]) => infer Empty
                    ? Empty
                    : never)
              ) &
                CraftNodeChildren,
              Tag,
              Property,
              Value
            >
          : Children extends DeferNode<infer Loaded>
            ? VisitProperty<
                Loaded extends CraftComponent<any, any>
                  ? ReturnType<ComponentTemplateOf<Loaded>>
                  : ReturnType<Children['resolve']>,
                Tag,
                Property,
                Value
              >
            : false;

/** Checks the type of a static or dynamic property on an element. */
export type TemplateHasProperty<
  Children extends CraftNodeChildren,
  Tag extends string,
  Property extends string,
  Value,
> = VisitProperty<Children, Tag, Property, Value>;

type VisitYieldableProperty<
  Children,
  Tag extends string,
  Property extends string,
  Result,
> = Children extends readonly (infer Child)[]
  ? VisitYieldableProperty<Child, Tag, Property, Result>
  : Children extends ElementNodeBase<
        any,
        infer ActualTag,
        infer Props,
        infer Nested
      >
    ? ActualTag extends Tag
      ? Property extends keyof Props
        ? NonNullable<Props[Property]> extends (
            ...args: infer Args
          ) => Generator<any, infer ActualResult, any>
          ? Args extends []
            ? ActualResult extends Result
              ? Result extends ActualResult
                ? true
                : false
              : false
            : false
          : false
        : false
      : VisitYieldableProperty<Nested, Tag, Property, Result>
    : Children extends CraftDirectiveNode<any>
      ? VisitYieldableProperty<Children['node'], Tag, Property, Result>
      : Children extends ComponentNode<any, any, infer Component>
        ? VisitYieldableProperty<
            ReturnType<ComponentTemplateOf<Component>>,
            Tag,
            Property,
            Result
          >
        : Children extends EachNode<any, any>
          ? VisitYieldableProperty<
              (
                | ReturnType<Children['itemTemplate']>
                | (Children['empty'] extends (...args: any[]) => infer Empty
                    ? Empty
                    : never)
              ) &
                CraftNodeChildren,
              Tag,
              Property,
              Result
            >
          : Children extends DeferNode<infer Loaded>
            ? VisitYieldableProperty<
                Loaded extends CraftComponent<any, any>
                  ? ReturnType<ComponentTemplateOf<Loaded>>
                  : ReturnType<Children['resolve']>,
                Tag,
                Property,
                Result
              >
            : false;

/** Checks that an element property is driven by a no-argument generator. */
export type TemplateHasYieldableProperty<
  Children extends CraftNodeChildren,
  Tag extends string,
  Property extends string,
  Result,
> = TemplateHasProperty<
  Children,
  Tag,
  Property,
  Yieldable<[], Result, unknown>
>;

type VisitContextUse<
  Children,
  Tag extends string,
  Property extends string,
  ContextMethod extends string,
> = Children extends readonly (infer Child)[]
  ? VisitContextUse<Child, Tag, Property, ContextMethod>
  : Children extends ElementNodeBase<
        any,
        infer ActualTag,
        infer Props,
        infer Nested
      >
    ? ActualTag extends Tag
      ? Property extends keyof Props
        ? NonNullable<Props[Property]> extends (
            ...args: any[]
          ) => Generator<infer Yielded, infer Returned, any>
          ? TemplateMethodUse<ContextMethod> extends Yielded | Returned
            ? true
            : Extract<
                  Yielded | Returned,
                  TemplateMethodUse<ContextMethod>
                > extends never
              ? false
              : true
          : false
        : false
      : VisitContextUse<Nested, Tag, Property, ContextMethod>
    : Children extends CraftDirectiveNode<any>
      ? VisitContextUse<Children['node'], Tag, Property, ContextMethod>
      : Children extends ComponentNode<any, any, infer Component>
        ? VisitContextUse<
            ReturnType<ComponentTemplateOf<Component>>,
            Tag,
            Property,
            ContextMethod
          >
        : Children extends EachNode<any, any>
          ? VisitContextUse<
              (
                | ReturnType<Children['itemTemplate']>
                | (Children['empty'] extends (...args: any[]) => infer Empty
                    ? Empty
                    : never)
              ) &
                CraftNodeChildren,
              Tag,
              Property,
              ContextMethod
            >
          : Children extends DeferNode<infer Loaded>
            ? VisitContextUse<
                Loaded extends CraftComponent<any, any>
                  ? ReturnType<ComponentTemplateOf<Loaded>>
                  : ReturnType<Children['resolve']>,
                Tag,
                Property,
                ContextMethod
              >
            : false;

/** Checks that a property callback delegates to a named template context member. */
export type TemplateDelegatesToContext<
  Children extends CraftNodeChildren,
  Tag extends string,
  Property extends string,
  ContextMethod extends string = Property,
> = VisitContextUse<Children, Tag, Property, ContextMethod>;

type EventHandlerOf<
  Props,
  EventName extends string,
> = EventName extends keyof Props
  ? Props[EventName]
  : `on${Capitalize<EventName>}` extends keyof Props
    ? Props[`on${Capitalize<EventName>}`]
    : never;

type VisitEvent<
  Children,
  Tag extends string,
  EventName extends string,
  Handler extends (...args: any[]) => any,
> = Children extends readonly (infer Child)[]
  ? VisitEvent<Child, Tag, EventName, Handler>
  : Children extends ElementNodeBase<any, infer ActualTag, infer Props>
    ? ActualTag extends Tag
      ? EventHandlerOf<Props, EventName> extends Handler
        ? Handler extends EventHandlerOf<Props, EventName>
          ? true
          : false
        : false
      : VisitEvent<Children['children'], Tag, EventName, Handler>
    : Children extends CraftDirectiveNode<any>
      ? VisitEvent<Children['node'], Tag, EventName, Handler>
      : Children extends ComponentNode<any, any, infer Component>
        ? VisitEvent<
            ReturnType<ComponentTemplateOf<Component>>,
            Tag,
            EventName,
            Handler
          >
        : false;

type VisitOutput<
  Children,
  Target extends CraftComponent<any, any>,
  Name extends keyof PropsOf<Target> & string,
  Handler extends (...args: any[]) => any,
> = Children extends readonly (infer Child)[]
  ? VisitOutput<Child, Target, Name, Handler>
  : Children extends ElementNodeBase<any, any, any, infer Nested>
    ? VisitOutput<Nested, Target, Name, Handler>
    : Children extends CraftDirectiveNode<any>
      ? VisitOutput<Children['node'], Target, Name, Handler>
      : Children extends ComponentNode<infer Props, any, infer Actual>
        ? [Actual] extends [Target]
          ? Name extends keyof Props
            ? Props[Name] extends Handler
              ? Handler extends Props[Name]
                ? true
                : false
              : false
            : false
          : VisitOutput<
              ReturnType<ComponentTemplateOf<Actual>>,
              Target,
              Name,
              Handler
            >
        : Children extends EachNode<any, any>
          ? VisitOutput<
              | ReturnType<Children['itemTemplate']>
              | (Children['empty'] extends (...args: any[]) => infer Empty
                  ? Empty
                  : never),
              Target,
              Name,
              Handler
            >
          : Children extends DeferNode<infer Loaded>
            ? VisitOutput<
                Loaded extends CraftComponent<any, any>
                  ? ReturnType<ComponentTemplateOf<Loaded>>
                  : ReturnType<Children['resolve']>,
                Target,
                Name,
                Handler
              >
            : false;

/** Checks an event callback and therefore preserves its argument type. */
export type TemplateHasEvent<
  Children extends CraftNodeChildren,
  Tag extends string,
  EventName extends string,
  Handler extends (...args: any[]) => any,
> = VisitEvent<Children, Tag, EventName, Handler>;

/** Checks that a DOM event is a generator callback with the given arguments. */
export type TemplateHasYieldableEvent<
  Children extends CraftNodeChildren,
  Tag extends string,
  EventName extends string,
  Args extends unknown[],
> = VisitYieldableEvent<Children, Tag, EventName, Args>;

/** Checks a branded Craft method used directly as a DOM event callback. */
export type TemplateHasYieldableMethodEvent<
  Children extends CraftNodeChildren,
  Tag extends string,
  EventName extends string,
  Args extends unknown[],
> = TemplateHasEvent<Children, Tag, EventName, YieldableMethod<Args, any, any>>;

type VisitYieldableEvent<
  Children,
  Tag extends string,
  EventName extends string,
  Args extends unknown[],
> = Children extends readonly (infer Child)[]
  ? VisitYieldableEvent<Child, Tag, EventName, Args>
  : Children extends ElementNodeBase<any, infer ActualTag, infer Props>
    ? ActualTag extends Tag
      ? EventHandlerOf<Props, EventName> extends (
          ...args: infer ActualArgs
        ) => Generator<any, any, any>
        ? ActualArgs extends Args
          ? Args extends ActualArgs
            ? true
            : false
          : false
        : false
      : VisitYieldableEvent<Children['children'], Tag, EventName, Args>
    : Children extends CraftDirectiveNode<any>
      ? VisitYieldableEvent<Children['node'], Tag, EventName, Args>
      : Children extends ComponentNode<any, any, infer Component>
        ? VisitYieldableEvent<
            ReturnType<ComponentTemplateOf<Component>>,
            Tag,
            EventName,
            Args
          >
        : false;

/** Checks an output callback passed to a concrete Craft child component. */
export type TemplateHasOutput<
  Children extends CraftNodeChildren,
  Component extends CraftComponent<any, any>,
  Name extends keyof PropsOf<Component> & string,
  Handler extends (...args: any[]) => any,
> = VisitOutput<Children, Component, Name, Handler>;

export type TemplateUsesComponent<
  Children extends CraftNodeChildren,
  Component extends CraftComponent<any, any>,
> = Children extends readonly (infer Child)[]
  ? TemplateUsesComponent<Child & CraftNodeChildren, Component>
  : Children extends ComponentNode<any, any, infer Actual>
    ? [Actual] extends [Component]
      ? true
      : TemplateUsesComponent<
          ReturnType<ComponentTemplateOf<Actual>>,
          Component
        >
    : Children extends ElementNodeBase<any, any, any, infer Nested>
      ? TemplateUsesComponent<Nested, Component>
      : Children extends CraftDirectiveNode<any>
        ? TemplateUsesComponent<Children['node'], Component>
        : Children extends EachNode<any, any>
          ? TemplateUsesComponent<
              (
                | ReturnType<Children['itemTemplate']>
                | (Children['empty'] extends (...args: any[]) => infer Empty
                    ? Empty
                    : never)
              ) &
                CraftNodeChildren,
              Component
            >
          : Children extends DeferNode<infer Loaded>
            ? Loaded extends CraftComponent<any, any>
              ? [Loaded] extends [Component]
                ? true
                : TemplateUsesComponent<
                    ReturnType<ComponentTemplateOf<Loaded>>,
                    Component
                  >
              : TemplateUsesComponent<
                  ReturnType<Children['resolve']>,
                  Component
                >
            : false;
