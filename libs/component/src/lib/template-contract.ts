import type {
  CraftComponent,
  ComponentTemplateOf,
  ComponentTemplateNameOf,
  FactoryContext,
  Output,
  PropsOf,
  TemplateMethodUse,
} from './types';
import type {
  NamedYieldableValue,
  Yieldable,
  YieldableMethod,
} from '@craft-ts/core';
import type {
  ComponentNode,
  CraftDirectiveNode,
  CraftNodeChildren,
  DeferNode,
  EachNode,
  IfBlockNode,
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
          : Children extends IfBlockNode<
                infer ConditionName,
                any,
                infer True,
                infer False
              >
            ? FindElement<True | False, Tag, Props>
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

type VisibilityValue = boolean | 'nonEmpty' | 'empty';
type Visibility = Readonly<Record<string, VisibilityValue>>;

type VisibilityMatches<
  Actual extends Visibility,
  Expected extends Visibility,
> = keyof Expected extends never
  ? keyof Actual extends never
    ? true
    : false
  : {
      [Key in keyof Expected]: Key extends keyof Actual
        ? Actual[Key] extends Expected[Key]
          ? Expected[Key] extends Actual[Key]
            ? never
            : false
          : false
        : false;
    }[keyof Expected] extends never
    ? true
    : {
        [Key in keyof Expected]: Key extends keyof Actual
          ? Actual[Key] extends Expected[Key]
            ? Expected[Key] extends Actual[Key]
              ? never
              : false
            : false
          : false;
      }[keyof Expected];

type StateMarkerMatches<Value, StateName extends string> =
  Value extends NamedYieldableValue<infer ActualName extends string, any>
    ? ActualName extends StateName
      ? true
      : false
    : Value extends TemplateMethodUse<StateName>
      ? true
      : false;

type ValueUsesState<Value, StateName extends string> =
  IsAny<Value> extends true
    ? false
    : StateMarkerMatches<Value, StateName> extends true
      ? true
      : Value extends (
            ...args: any[]
          ) => Generator<infer Yielded, infer Returned, any>
        ? TemplateMethodUse<StateName> extends Yielded | Returned
          ? true
          : false
        : Value extends (...args: any[]) => infer Returned
          ? Returned extends TemplateMethodUse<StateName>
            ? true
            : false
          : Value extends readonly (infer Item)[]
            ? ValueUsesState<Item, StateName>
            : Value extends object
              ? true extends {
                  [Key in keyof Value]: ValueUsesState<Value[Key], StateName>;
                }[keyof Value]
                ? true
                : false
              : false;

type RenderPropsUseState<Props, StateName extends string> = true extends {
  [Key in keyof Props & string]: Key extends DomEventKey
    ? false
    : Key extends `on${Capitalize<DomEventKey>}`
      ? false
      : ValueUsesState<Props[Key], StateName>;
}[keyof Props & string]
  ? true
  : false;

type VisitRenderedState<
  Children,
  StateName extends string,
  Expected extends Visibility,
  Current extends Visibility = {},
  Seen extends readonly unknown[] = [],
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? false
  : Children extends readonly (infer Child)[]
    ? VisitRenderedState<
        Child,
        StateName,
        Expected,
        Current,
        Seen,
        [...Depth, unknown]
      >
    : Children extends ElementNodeBase<any, any, infer Props, infer Nested>
      ?
          | (RenderPropsUseState<Props, StateName> extends true
              ? VisibilityMatches<Current, Expected>
              : false)
          | VisitRenderedState<
              Nested,
              StateName,
              Expected,
              Current,
              Seen,
              [...Depth, unknown]
            >
      : Children extends CraftDirectiveNode<any>
        ? VisitRenderedState<
            Children['node'],
            StateName,
            Expected,
            Current,
            Seen,
            [...Depth, unknown]
          >
        : Children extends ComponentNode<any, any, infer Component>
          ? Component extends Seen[number]
            ? false
            : VisitRenderedState<
                ReturnType<ComponentTemplateOf<Component>>,
                StateName,
                Expected,
                Current,
                [...Seen, Component],
                [...Depth, unknown]
              >
          : Children extends EachNode<
                any,
                any,
                any,
                infer SourceName,
                infer Item,
                infer Empty
              >
            ?
                | VisitRenderedState<
                    Item,
                    StateName,
                    Expected,
                    Extract<SourceName, string> extends never
                      ? Current
                      : AddVisibility<
                          Current,
                          Extract<SourceName, string>,
                          'nonEmpty'
                        >,
                    Seen,
                    [...Depth, unknown]
                  >
                | VisitRenderedState<
                    Empty,
                    StateName,
                    Expected,
                    Extract<SourceName, string> extends never
                      ? Current
                      : AddVisibility<
                          Current,
                          Extract<SourceName, string>,
                          'empty'
                        >,
                    Seen,
                    [...Depth, unknown]
                  >
            : Children extends IfBlockNode<
                  infer ConditionName,
                  any,
                  infer True,
                  infer False
                >
              ?
                  | VisitRenderedState<
                      True,
                      StateName,
                      Expected,
                      AddVisibility<Current, ConditionName, true>,
                      Seen,
                      [...Depth, unknown]
                    >
                  | VisitRenderedState<
                      False,
                      StateName,
                      Expected,
                      AddVisibility<Current, ConditionName, false>,
                      Seen,
                      [...Depth, unknown]
                    >
              : Children extends DeferNode<infer Loaded>
                ? VisitRenderedState<
                    Loaded extends CraftComponent<any, any>
                      ? ReturnType<ComponentTemplateOf<Loaded>>
                      : ReturnType<Children['resolve']>,
                    StateName,
                    Expected,
                    Current,
                    Seen,
                    [...Depth, unknown]
                  >
                  : ValueUsesState<Children, StateName> extends true
                    ? VisibilityMatches<Current, Expected>
                    : false;

type RenderedStateResult<Result> =
  true extends Extract<Result, true> ? true : false;

/** Checks that a named reactive value is used by a rendered binding. */
export type TemplateRendersStateWhen<
  Children,
  StateName extends string,
  Conditions extends { readonly when?: Visibility } = {},
> = RenderedStateResult<
  VisitRenderedState<
    Children,
    StateName,
    Conditions extends { readonly when: infer When extends Visibility }
      ? When
      : {}
  >
>;

type ActionHandlerAvailable<Handler> = IsTemplateCallback<Handler>;

type ActionElementMatches<
  Props,
  LocalName,
  EventName extends string,
  ExpectedLocalName extends string,
> = LocalName extends ExpectedLocalName
  ? ExpectedLocalName extends LocalName
    ? EventHandlerOf<Props, EventName> extends infer Handler
      ? ActionHandlerAvailable<Handler>
      : false
    : false
  : false;

type VisitAvailableAction<
  Children,
  EventName extends string,
  LocalName extends string,
  Expected extends Visibility,
  Current extends Visibility = {},
  Seen extends readonly unknown[] = [],
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? false
  : Children extends readonly (infer Child)[]
    ? VisitAvailableAction<
        Child,
        EventName,
        LocalName,
        Expected,
        Current,
        Seen,
        [...Depth, unknown]
      >
    : Children extends ElementNodeBase<
          any,
          any,
          infer Props,
          infer Nested,
          infer ActualLocalName
        >
      ?
          | (ActionElementMatches<
              Props,
              ActualLocalName,
              EventName,
              LocalName
            > extends true
              ? VisibilityMatches<Current, Expected>
              : false)
          | VisitAvailableAction<
              Nested,
              EventName,
              LocalName,
              Expected,
              Current,
              Seen,
              [...Depth, unknown]
            >
      : Children extends CraftDirectiveNode<any>
        ? VisitAvailableAction<
            Children['node'],
            EventName,
            LocalName,
            Expected,
            Current,
            Seen,
            [...Depth, unknown]
          >
        : Children extends ComponentNode<any, any, infer Component>
          ? Component extends Seen[number]
            ? false
            : VisitAvailableAction<
                ReturnType<ComponentTemplateOf<Component>>,
                EventName,
                LocalName,
                Expected,
                Current,
                [...Seen, Component],
                [...Depth, unknown]
              >
          : Children extends EachNode<
                any,
                any,
                any,
                infer SourceName,
                infer Item,
                infer Empty
              >
            ?
                | VisitAvailableAction<
                    Item,
                    EventName,
                    LocalName,
                    Expected,
                    Extract<SourceName, string> extends never
                      ? Current
                      : AddVisibility<
                          Current,
                          Extract<SourceName, string>,
                          'nonEmpty'
                        >,
                    Seen,
                    [...Depth, unknown]
                  >
                | VisitAvailableAction<
                    Empty,
                    EventName,
                    LocalName,
                    Expected,
                    Extract<SourceName, string> extends never
                      ? Current
                      : AddVisibility<
                          Current,
                          Extract<SourceName, string>,
                          'empty'
                        >,
                    Seen,
                    [...Depth, unknown]
                  >
            : Children extends IfBlockNode<
                  infer ConditionName,
                  any,
                  infer True,
                  infer False
                >
              ?
                  | VisitAvailableAction<
                      True,
                      EventName,
                      LocalName,
                      Expected,
                      AddVisibility<Current, ConditionName, true>,
                      Seen,
                      [...Depth, unknown]
                    >
                  | VisitAvailableAction<
                      False,
                      EventName,
                      LocalName,
                      Expected,
                      AddVisibility<Current, ConditionName, false>,
                      Seen,
                      [...Depth, unknown]
                    >
              : Children extends DeferNode<infer Loaded>
                ? VisitAvailableAction<
                    Loaded extends CraftComponent<any, any>
                      ? ReturnType<ComponentTemplateOf<Loaded>>
                      : ReturnType<Children['resolve']>,
                    EventName,
                    LocalName,
                    Expected,
                    Current,
                    Seen,
                    [...Depth, unknown]
                  >
                : false;

type AvailableActionResult<Result> =
  true extends Extract<Result, true> ? true : false;

/** Checks an event action on a named element and its visibility path. */
export type TemplateRenderAvailableActionWhen<
  Children,
  ActionKey extends `${string}:${string}`,
  Conditions extends { readonly when?: Visibility } = {},
> = ActionKey extends `${infer EventName}:${infer LocalName}`
  ? AvailableActionResult<
      VisitAvailableAction<
        Children,
        EventName,
        LocalName,
        Conditions extends { readonly when: infer When extends Visibility }
          ? When
          : {}
      >
    >
  : false;

type AddVisibility<
  Current extends Visibility,
  Key extends string,
  Value extends VisibilityValue,
> = Current & { readonly [K in Key]: Value };

type NamedElementMatches<
  Owner extends string,
  Identity extends string,
  Tag extends string,
  LocalName,
> = LocalName extends string
  ? Identity extends `${infer IdentityOwner}:${infer IdentityTag}:${infer IdentityLocal}`
    ? (
        [Owner] extends [never]
          ? true
          : Owner extends IdentityOwner
            ? true
            : false
      ) extends true
      ? [Tag, LocalName] extends [IdentityTag, IdentityLocal]
        ? true
        : false
      : false
    : false
  : false;

type LiteralString<Value> = Value extends string
  ? string extends Value
    ? never
    : Value
  : never;

type NamedElementIdentity<
  Owner extends string,
  Tag extends string,
  LocalName extends string,
> = string extends Owner
  ? `${string}:${Tag}:${LocalName}`
  : [Owner] extends [never]
    ? `${string}:${Tag}:${LocalName}`
    : `${Owner}:${Tag}:${LocalName}`;

type VisitNamedElementIdentities<
  Children,
  Owner extends string = never,
  Seen extends readonly unknown[] = [],
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? never
  : IsAny<Children> extends true
    ? never
    : Children extends readonly (infer Child)[]
      ? VisitNamedElementIdentities<Child, Owner, Seen, [...Depth, unknown]>
      : Children extends ElementNodeBase<
            any,
            infer Tag extends string,
            any,
            infer Nested,
            infer LocalName
          >
        ? LiteralString<Extract<LocalName, string>> extends infer Name extends
            string
          ?
              | NamedElementIdentity<Owner, Tag, Name>
              | VisitNamedElementIdentities<
                  Nested,
                  Owner,
                  Seen,
                  [...Depth, unknown]
                >
          : VisitNamedElementIdentities<
              Nested,
              Owner,
              Seen,
              [...Depth, unknown]
            >
        : Children extends CraftDirectiveNode<any>
          ? VisitNamedElementIdentities<
              Children['node'],
              Owner,
              Seen,
              [...Depth, unknown]
            >
          : Children extends ComponentNode<any, any, infer Component>
            ? IsAny<Component> extends true
              ? never
              : Component extends Seen[number]
                ? never
                : VisitNamedElementIdentities<
                    ReturnType<ComponentTemplateOf<Component>>,
                    ComponentName<Component>,
                    [...Seen, Component],
                    [...Depth, unknown]
                  >
            : Children extends EachNode<
                  any,
                  any,
                  any,
                  any,
                  infer Item,
                  infer Empty
                >
              ? VisitNamedElementIdentities<
                  Item | Empty,
                  Owner,
                  Seen,
                  [...Depth, unknown]
                >
              : Children extends IfBlockNode<any, any, infer True, infer False>
                ? VisitNamedElementIdentities<
                    True | False,
                    Owner,
                    Seen,
                    [...Depth, unknown]
                  >
                : Children extends DeferNode<infer Loaded>
                  ? VisitNamedElementIdentities<
                      Loaded extends CraftComponent<any, any>
                        ? ReturnType<ComponentTemplateOf<Loaded>>
                        : ReturnType<Children['resolve']>,
                      Owner,
                      Seen,
                      [...Depth, unknown]
                    >
                  : never;

type TemplateContractOutput<Template> = Template extends (
  ...args: any[]
) => infer Output
  ? Output
  : Template;

type TemplateContractOwner<Template> = Template extends (...args: any[]) => any
  ? ComponentTemplateNameOf<Template> extends infer Name extends string
    ? string extends Name
      ? never
      : Name
    : never
  : never;

/** Named element identities available for a template, for editor completion. */
export type TemplateNamedElementIdentity<Template> =
  VisitNamedElementIdentities<
    TemplateContractOutput<Template>,
    TemplateContractOwner<Template>
  >;

type TemplateContextOf<Template> = Template extends (
  context: infer Context,
  ...args: any[]
) => any
  ? Context
  : never;

type TemplateContextPathKeys<Value> = Exclude<
  keyof Value,
  keyof ((...args: never[]) => unknown) | symbol | number
> &
  string;

type TemplateContextPaths<
  Value,
  Prefix extends string = '',
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? never
  :
      | Prefix
      | (Value extends readonly unknown[]
          ? never
          : Value extends object
            ? {
                [Key in TemplateContextPathKeys<Value>]: TemplateContextPaths<
                  Value[Key],
                  Prefix extends '' ? Key : `${Prefix}.${Key}`,
                  [...Depth, unknown]
                >;
              }[TemplateContextPathKeys<Value>]
            : never);

/** Context paths available for a template callback, with editor completion. */
export type TemplateContextMethodOf<Template> = Extract<
  TemplateContextPaths<TemplateContextOf<Template>>,
  string
>;

type NamedElementPropsOf<
  Children,
  Identity extends string,
  Owner extends string = never,
  Seen extends readonly unknown[] = [],
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? never
  : IsAny<Children> extends true
    ? never
    : Children extends readonly (infer Child)[]
      ? NamedElementPropsOf<Child, Identity, Owner, Seen, [...Depth, unknown]>
      : Children extends ElementNodeBase<
            any,
            infer Tag,
            infer Props,
            infer Nested,
            infer LocalName
          >
        ? NamedElementMatches<
            Owner,
            Identity,
            Tag,
            Extract<LocalName, string>
          > extends true
          ? Props
          : NamedElementPropsOf<
              Nested,
              Identity,
              Owner,
              Seen,
              [...Depth, unknown]
            >
        : Children extends CraftDirectiveNode<any>
          ? NamedElementPropsOf<
              Children['node'],
              Identity,
              Owner,
              Seen,
              [...Depth, unknown]
            >
          : Children extends ComponentNode<any, any, infer Component>
            ? Component extends Seen[number]
              ? never
              : NamedElementPropsOf<
                  ReturnType<ComponentTemplateOf<Component>>,
                  Identity,
                  ComponentName<Component>,
                  [...Seen, Component],
                  [...Depth, unknown]
                >
            : Children extends EachNode<
                  any,
                  any,
                  any,
                  any,
                  infer Item,
                  infer Empty
                >
              ? NamedElementPropsOf<
                  Item | Empty,
                  Identity,
                  Owner,
                  Seen,
                  [...Depth, unknown]
                >
              : Children extends IfBlockNode<any, any, infer True, infer False>
                ? NamedElementPropsOf<
                    True | False,
                    Identity,
                    Owner,
                    Seen,
                    [...Depth, unknown]
                  >
                : Children extends DeferNode<infer Loaded>
                  ? NamedElementPropsOf<
                      Loaded extends CraftComponent<any, any>
                        ? ReturnType<ComponentTemplateOf<Loaded>>
                        : ReturnType<Children['resolve']>,
                      Identity,
                      Owner,
                      Seen,
                      [...Depth, unknown]
                    >
                  : never;

/** Properties declared on a named element, with editor completion. */
export type TemplateNamedElementProperty<
  Template,
  Identity extends TemplateNamedElementIdentity<Template>,
> = Extract<
  keyof NamedElementPropsOf<
    TemplateContractOutput<Template>,
    Identity,
    TemplateContractOwner<Template>
  >,
  string
>;

type TemplateContextUseResult<Result> =
  true extends Extract<Result, true> ? true : false;

type HandlerDelegatesToContext<
  Handler,
  ContextMethod extends string,
> = Handler extends (
  ...args: any[]
) => Generator<infer Yielded, infer Returned, any>
  ? TemplateMethodUse<ContextMethod> extends Yielded | Returned
    ? true
    : false
  : false;

type NamedElementDelegatesToContextOf<
  Children,
  Identity extends string,
  Property extends string,
  ContextMethod extends string,
  Owner extends string = never,
  Seen extends readonly unknown[] = [],
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? false
  : Children extends readonly (infer Child)[]
    ? NamedElementDelegatesToContextOf<
        Child,
        Identity,
        Property,
        ContextMethod,
        Owner,
        Seen,
        [...Depth, unknown]
      >
    : Children extends ElementNodeBase<
          any,
          infer Tag,
          infer Props,
          infer Nested,
          infer LocalName
        >
      ?
          | (NamedElementMatches<
              Owner,
              Identity,
              Tag,
              Extract<LocalName, string>
            > extends true
              ? Property extends keyof Props
                ? HandlerDelegatesToContext<Props[Property], ContextMethod>
                : false
              : false)
          | NamedElementDelegatesToContextOf<
              Nested,
              Identity,
              Property,
              ContextMethod,
              Owner,
              Seen,
              [...Depth, unknown]
            >
      : Children extends CraftDirectiveNode<any>
        ? NamedElementDelegatesToContextOf<
            Children['node'],
            Identity,
            Property,
            ContextMethod,
            Owner,
            Seen,
            [...Depth, unknown]
          >
        : Children extends ComponentNode<any, any, infer Component>
          ? Component extends Seen[number]
            ? false
            : NamedElementDelegatesToContextOf<
                ReturnType<ComponentTemplateOf<Component>>,
                Identity,
                Property,
                ContextMethod,
                ComponentName<Component>,
                [...Seen, Component],
                [...Depth, unknown]
              >
          : Children extends EachNode<
                any,
                any,
                any,
                any,
                infer Item,
                infer Empty
              >
            ? NamedElementDelegatesToContextOf<
                Item | Empty,
                Identity,
                Property,
                ContextMethod,
                Owner,
                Seen,
                [...Depth, unknown]
              >
            : Children extends IfBlockNode<any, any, infer True, infer False>
              ? NamedElementDelegatesToContextOf<
                  True | False,
                  Identity,
                  Property,
                  ContextMethod,
                  Owner,
                  Seen,
                  [...Depth, unknown]
                >
              : Children extends DeferNode<infer Loaded>
                ? NamedElementDelegatesToContextOf<
                    Loaded extends CraftComponent<any, any>
                      ? ReturnType<ComponentTemplateOf<Loaded>>
                      : ReturnType<Children['resolve']>,
                    Identity,
                    Property,
                    ContextMethod,
                    Owner,
                    Seen,
                    [...Depth, unknown]
                  >
                : false;

/** Checks that a named element property delegates to a context method. */
export type TemplateNamedElementDelegatesToContext<
  Template,
  Identity extends TemplateNamedElementIdentity<Template>,
  Property extends TemplateNamedElementProperty<Template, Identity>,
  ContextMethod extends TemplateContextMethodOf<Template>,
> = TemplateContextUseResult<
  NamedElementDelegatesToContextOf<
    TemplateContractOutput<Template>,
    Identity,
    Property,
    ContextMethod,
    TemplateContractOwner<Template>
  >
>;

type NamedElementRendersStateWhenOf<
  Children,
  Identity extends string,
  Property extends string,
  StateName extends string,
  Expected extends Visibility,
  Owner extends string = never,
  Current extends Visibility = {},
  Seen extends readonly unknown[] = [],
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? false
  : Children extends readonly (infer Child)[]
    ? NamedElementRendersStateWhenOf<
        Child,
        Identity,
        Property,
        StateName,
        Expected,
        Owner,
        Current,
        Seen,
        [...Depth, unknown]
      >
    : Children extends ElementNodeBase<
          any,
          infer Tag,
          infer Props,
          infer Nested,
          infer LocalName
        >
      ?
          | (NamedElementMatches<
              Owner,
              Identity,
              Tag,
              Extract<LocalName, string>
            > extends true
              ? Property extends keyof Props
                ? ValueUsesState<Props[Property], StateName> extends true
                  ? VisibilityMatches<Current, Expected>
                  : false
                : false
              : false)
          | NamedElementRendersStateWhenOf<
              Nested,
              Identity,
              Property,
              StateName,
              Expected,
              Owner,
              Current,
              Seen,
              [...Depth, unknown]
            >
      : Children extends CraftDirectiveNode<any>
        ? NamedElementRendersStateWhenOf<
            Children['node'],
            Identity,
            Property,
            StateName,
            Expected,
            Owner,
            Current,
            Seen,
            [...Depth, unknown]
          >
        : Children extends ComponentNode<any, any, infer Component>
          ? Component extends Seen[number]
            ? false
            : NamedElementRendersStateWhenOf<
                ReturnType<ComponentTemplateOf<Component>>,
                Identity,
                Property,
                StateName,
                Expected,
                ComponentName<Component>,
                Current,
                [...Seen, Component],
                [...Depth, unknown]
              >
          : Children extends EachNode<
                any,
                any,
                any,
                infer SourceName,
                infer Item,
                infer Empty
              >
            ?
                | NamedElementRendersStateWhenOf<
                    Item,
                    Identity,
                    Property,
                    StateName,
                    Expected,
                    Owner,
                    Extract<SourceName, string> extends never
                      ? Current
                      : AddVisibility<
                          Current,
                          Extract<SourceName, string>,
                          'nonEmpty'
                        >,
                    Seen,
                    [...Depth, unknown]
                  >
                | NamedElementRendersStateWhenOf<
                    Empty,
                    Identity,
                    Property,
                    StateName,
                    Expected,
                    Owner,
                    Extract<SourceName, string> extends never
                      ? Current
                      : AddVisibility<
                          Current,
                          Extract<SourceName, string>,
                          'empty'
                        >,
                    Seen,
                    [...Depth, unknown]
                  >
            : Children extends IfBlockNode<
                  infer ConditionName,
                  any,
                  infer True,
                  infer False
                >
              ?
                  | NamedElementRendersStateWhenOf<
                      True,
                      Identity,
                      Property,
                      StateName,
                      Expected,
                      Owner,
                      AddVisibility<Current, ConditionName, true>,
                      Seen,
                      [...Depth, unknown]
                    >
                  | NamedElementRendersStateWhenOf<
                      False,
                      Identity,
                      Property,
                      StateName,
                      Expected,
                      Owner,
                      AddVisibility<Current, ConditionName, false>,
                      Seen,
                      [...Depth, unknown]
                    >
              : Children extends DeferNode<infer Loaded>
                ? NamedElementRendersStateWhenOf<
                    Loaded extends CraftComponent<any, any>
                      ? ReturnType<ComponentTemplateOf<Loaded>>
                      : ReturnType<Children['resolve']>,
                    Identity,
                    Property,
                    StateName,
                    Expected,
                    Owner,
                    Current,
                    Seen,
                    [...Depth, unknown]
                  >
                : false;

/** Checks that a named element property is driven by a context state. */
export type TemplateNamedElementRendersStateWhen<
  Template,
  Identity extends TemplateNamedElementIdentity<Template>,
  Property extends TemplateNamedElementProperty<Template, Identity>,
  StateName extends TemplateContextMethodOf<Template>,
  Conditions extends { readonly when?: Visibility } = {},
> = TemplateContextUseResult<
  NamedElementRendersStateWhenOf<
    TemplateContractOutput<Template>,
    Identity,
    Property,
    StateName,
    Conditions extends { readonly when: infer When extends Visibility }
      ? When
      : {},
    TemplateContractOwner<Template>
  >
>;

type VisitNamedElement<
  Children,
  Identity extends string,
  Expected extends Visibility,
  Owner extends string = never,
  Current extends Visibility = {},
  Seen extends readonly unknown[] = [],
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? false
  : Children extends readonly (infer Child)[]
    ? VisitNamedElement<
        Child,
        Identity,
        Expected,
        Owner,
        Current,
        Seen,
        [...Depth, unknown]
      >
    : Children extends ElementNodeBase<
          any,
          infer Tag,
          any,
          infer Nested,
          infer LocalName
        >
      ?
          | (NamedElementMatches<
              Owner,
              Identity,
              Tag,
              Extract<LocalName, string>
            > extends true
              ? VisibilityMatches<Current, Expected>
              : false)
          | VisitNamedElement<
              Nested,
              Identity,
              Expected,
              Owner,
              Current,
              Seen,
              [...Depth, unknown]
            >
      : Children extends CraftDirectiveNode<any>
        ? VisitNamedElement<
            Children['node'],
            Identity,
            Expected,
            Owner,
            Current,
            Seen,
            [...Depth, unknown]
          >
        : Children extends ComponentNode<any, any, infer Component>
          ? Component extends Seen[number]
            ? false
            : VisitNamedElement<
                ReturnType<ComponentTemplateOf<Component>>,
                Identity,
                Expected,
                ComponentName<Component>,
                Current,
                [...Seen, Component],
                [...Depth, unknown]
              >
          : Children extends EachNode<
                any,
                any,
                any,
                infer SourceName,
                infer Item,
                infer Empty
              >
            ?
                | VisitNamedElement<
                    Item,
                    Identity,
                    Expected,
                    Owner,
                    Extract<SourceName, string> extends never
                      ? Current
                      : AddVisibility<
                          Current,
                          Extract<SourceName, string>,
                          'nonEmpty'
                        >,
                    Seen,
                    [...Depth, unknown]
                  >
                | VisitNamedElement<
                    Empty,
                    Identity,
                    Expected,
                    Owner,
                    Extract<SourceName, string> extends never
                      ? Current
                      : AddVisibility<
                          Current,
                          Extract<SourceName, string>,
                          'empty'
                        >,
                    Seen,
                    [...Depth, unknown]
                  >
            : Children extends IfBlockNode<
                  infer ConditionName,
                  any,
                  infer True,
                  infer False
                >
              ?
                  | VisitNamedElement<
                      True,
                      Identity,
                      Expected,
                      Owner,
                      AddVisibility<Current, ConditionName, true>,
                      Seen,
                      [...Depth, unknown]
                    >
                  | VisitNamedElement<
                      False,
                      Identity,
                      Expected,
                      Owner,
                      AddVisibility<Current, ConditionName, false>,
                      Seen,
                      [...Depth, unknown]
                    >
              : Children extends DeferNode<infer Loaded>
                ? VisitNamedElement<
                    Loaded extends CraftComponent<any, any>
                      ? ReturnType<ComponentTemplateOf<Loaded>>
                      : ReturnType<Children['resolve']>,
                    Identity,
                    Expected,
                    Owner,
                    Current,
                    Seen,
                    [...Depth, unknown]
                  >
                : false;

type NamedElementResult<Result> =
  true extends Extract<Result, true>
    ? true
    : Extract<Result, TemplateContractError<string>> extends never
      ? false
      : Extract<Result, TemplateContractError<string>>;

/** Checks a named element and the visibility path that renders it. */
export type TemplateRendersNamedElementWhen<
  Children,
  Identity extends TemplateNamedElementIdentity<Children>,
  Conditions extends { readonly when?: Visibility } = {},
> = NamedElementResult<
  VisitNamedElement<
    TemplateContractOutput<Children>,
    Identity,
    Conditions extends { readonly when: infer When extends Visibility }
      ? When
      : {},
    TemplateContractOwner<Children>
  >
>;
