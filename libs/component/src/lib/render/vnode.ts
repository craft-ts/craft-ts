import type {
  AnyCraftException,
  CraftChannels,
  CraftChannelsCarrier,
  CRAFT_CHANNELS,
  EmptyChannels,
  MergeChannelUnion,
  CraftNodeDirective,
  CraftLazyLoadHelpers,
  CatchTagExhaustiveCodesCheck,
  CraftSettledCodesOf,
  CraftSettledSourcesOf,
  ExtractCraftGenExceptions,
  ExtractCraftPendingSources,
  FieldValidationCasesOf,
  SsrMode,
} from '@craft-ts/core';
import { CRAFT_NODE_DIRECTIVE, isCraftNodeDirective } from '@craft-ts/core';
import type {
  CraftComponent,
  CraftDirectiveTemplateDependencies,
  ComponentInitializationExceptionsOf,
  ComponentFieldExceptionsOf,
  CraftTemplate,
  ContentStylePolicy,
  InputValue,
} from '../types';
import { isCraftDirective, type CraftDirective } from '../types';
import type { CssVarContract, EmptyCssVarContract } from '../css-vars.type';
import {
  CATCH_NODE_DIRECTIVE,
  type CatchDirective,
  type CatchHandlerChildren,
  type CatchHandlers,
  type CatchPosition,
} from '../catch-node';
import {
  PENDING_NODE_DIRECTIVE,
  type PendingDirective,
  type PendingHandlers,
  type PendingPosition,
  type PendingFallback,
  type PendingExhaustiveCheck,
  type PendingResidualSources,
} from '../pending-node';
import {
  FIELD_ERROR_NODE_DIRECTIVE,
  type FieldErrorDirective,
  type FieldErrorExhaustiveCheck,
  type FieldErrorPartialCheck,
  type FieldErrorOptions,
  type FieldExceptionHandlerFieldExceptions,
  type FieldExceptionHandlerChildren,
  type FieldExceptionHandlers,
  type FieldValidationHandledIdentities,
  type FieldValidationHandledIdentitiesCarrier,
  type ResidualFieldValidationCases,
  type UnhandledFieldValidationCases,
} from '../field-error-node';
import type {
  ForSchedulePolicy,
  ScheduleForDirective,
} from '../for-scheduling';
import {
  SCHEDULE_FOR_DIRECTIVE,
  isScheduleForDirective,
} from '../for-scheduling';

export type CraftHostInjector = unknown;
type HostInjector = CraftHostInjector & any;
type CraftHostType<T> = Function & {
  new (...args: any[]): T;
};

export declare const CRAFT_NODE_DEPS: unique symbol;
export const CRAFT_NODE_CSS_VARS: unique symbol = Symbol('craft-node-css-vars');
export const CRAFT_NODE_DIRECTIVES = Symbol('craft-node-directives');
declare const CRAFT_NODE_EXCEPTIONS: unique symbol;
declare const CRAFT_NODE_HANDLED_EXCEPTIONS: unique symbol;
declare const CRAFT_NODE_PENDING: unique symbol;
declare const CRAFT_NODE_SETTLED_EXCEPTIONS: unique symbol;
declare const CRAFT_NODE_HEADING_NEED: unique symbol;
export declare const CRAFT_NODE_FIELD_EXCEPTIONS: unique symbol;

let activeCraftRenderContext: unknown;

/** Internal bridge used by factories that create nodes while a template runs. */
export function withCraftRenderContext<T>(context: unknown, work: () => T): T {
  const previous = activeCraftRenderContext;
  activeCraftRenderContext = context;
  try {
    return work();
  } finally {
    activeCraftRenderContext = previous;
  }
}

export function currentCraftRenderContext(): unknown {
  return activeCraftRenderContext;
}

export type CraftNodeDepsCarrier<Dependencies extends object = {}> = {
  readonly [CRAFT_NODE_DEPS]?: Dependencies;
};

/** Type-only contract propagated from descendant component calls. */
export type CraftNodeCssVarsCarrier<
  Contract extends CssVarContract = EmptyCssVarContract,
> = {
  readonly __craftNodeCssVars__?: Contract;
};

type IsAny<Value> = 0 extends 1 & Value ? true : false;

export type CraftNodeExceptionsCarrier<Exceptions extends string = string> = {
  readonly [CRAFT_NODE_EXCEPTIONS]?: Exceptions;
};

export type CraftNodeHandledExceptionsCarrier<Codes extends string = string> = {
  readonly [CRAFT_NODE_HANDLED_EXCEPTIONS]?: Codes;
};

export type CraftNodeFieldExceptionsCarrier<Cases = never> = {
  readonly [CRAFT_NODE_FIELD_EXCEPTIONS]?: Cases;
};

/**
 * Type-only carrier for the async sources a subtree reads through a
 * `settledValue` (directly, or through a `craftComputed` that consumed one with
 * `yield* settled(...)`).
 *
 * It is the pending twin of {@link CraftNodeExceptionsCarrier}: sources bubble up
 * from children to parents until a `pendingNode` boundary clears them, and any
 * source still uncovered when the template reaches `craftComponent(...)` is a
 * compile error.
 */
export type CraftNodePendingCarrier<Sources extends string = string> = {
  readonly [CRAFT_NODE_PENDING]?: Sources;
};

/**
 * Type-only carrier for the exception codes a subtree can reach **through a
 * settled read** — codes that only become reachable because the template renders
 * the value, not because a component declared them.
 *
 * They travel apart from {@link CraftNodeExceptionsCarrier} on purpose:
 * `RequireCaughtComponentExceptions` fires on the children of the tag helper
 * that receives them, and a text binding has no place to host a boundary
 * (`span(userName)` would demand a `catchNode` inside `span`'s own children).
 * These bubble silently instead, are cleared by any ancestor `catchNode`, and
 * are checked once at `craftComponent(...)`.
 */
export type CraftNodeSettledExceptionsCarrier<Codes extends string = string> = {
  readonly [CRAFT_NODE_SETTLED_EXCEPTIONS]?: Codes;
};

/**
 * Type-only carrier for a relative heading outline. `heading()` marks a
 * subtree as needing a parent `headingSection` (or the route-level outline).
 * `headingSection` absorbs that need for its children.
 *
 * `'heading'` is a local `heading()` in this template (allowed on the
 * component that declares it). `'heading-from-child'` is a nested component
 * that still exposes an uncovered heading — the parent must wrap that call in
 * `headingSection`.
 */
export type CraftNodeHeadingNeedCarrier<Need extends string = never> = {
  readonly [CRAFT_NODE_HEADING_NEED]?: Need;
};

export type ChildHeadingNeed = 'heading-from-child';

export type RemapToChildHeadingNeed<Need> = [Need] extends [never]
  ? never
  : string extends Need
    ? never
    : ChildHeadingNeed;

type UnionToIntersection<Union> = (
  Union extends any ? (value: Union) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;

type CraftNodeChildrenDependenciesOf<Value> =
  IsAny<Value> extends true
    ? {}
    : string extends Value
      ? {}
      : Value extends readonly (infer Child)[]
        ? CraftNodeChildrenDependenciesOf<Child>
        : Value extends object
          ? typeof CRAFT_NODE_DEPS extends keyof Value
            ? Value extends CraftNodeDepsCarrier<
                infer Dependencies extends object
              >
              ? IsAny<Dependencies> extends true
                ? {}
                : Dependencies
              : {}
            : {}
          : {};

export type CraftNodeChildrenDependencies<Value> = {
  [Key in keyof UnionToIntersection<
    CraftNodeChildrenDependenciesOf<Value>
  >]: UnionToIntersection<CraftNodeChildrenDependenciesOf<Value>>[Key];
} & {};

type CraftNodeChildrenCssVarsOf<
  Value,
  Depth extends unknown[] = [],
> = Depth['length'] extends 8
  ? never
  : IsAny<Value> extends true
    ? never
    : Value extends readonly (infer Child)[]
      ? CraftNodeChildrenCssVarsOf<Child, [...Depth, unknown]>
      : Value extends CraftNodeCssVarsCarrier<infer Contract>
        ? Contract
        : never;

type CssVarField<
  Contracts,
  Key extends keyof CssVarContract,
> = Contracts extends CssVarContract ? Contracts[Key] : never;

export type CraftNodeChildrenCssVars<Value> = [CraftNodeChildren] extends [
  Value,
]
  ? EmptyCssVarContract
  : IsAny<Value> extends true
    ? CssVarContract
    : [CraftNodeChildrenCssVarsOf<Value>] extends [never]
      ? EmptyCssVarContract
      : {
          readonly required: CssVarField<
            CraftNodeChildrenCssVarsOf<Value>,
            'required'
          >;
          readonly optional: CssVarField<
            CraftNodeChildrenCssVarsOf<Value>,
            'optional'
          >;
          readonly declared: CssVarField<
            CraftNodeChildrenCssVarsOf<Value>,
            'declared'
          >;
          readonly inherited: CssVarField<
            CraftNodeChildrenCssVarsOf<Value>,
            'inherited'
          >;
          readonly nonInherited: CssVarField<
            CraftNodeChildrenCssVarsOf<Value>,
            'nonInherited'
          >;
          readonly unknownCss: true extends CssVarField<
            CraftNodeChildrenCssVarsOf<Value>,
            'unknownCss'
          >
            ? true
            : false;
        };

/**
 * Every channel set reachable from a value the tree holds — children, or a prop
 * that carries one. Recursive over arrays, since children arrive nested as
 * often as flat; distributive over unions, so siblings come back as a union of
 * channel sets rather than a single collapsed one.
 *
 * Kept raw (un-merged) on purpose: merging is what cancels obligations against
 * discharges, and that must happen once, at the node that contains both sides,
 * not at every level of array nesting on the way there.
 */
type CraftNodeRawChannelsOf<
  Value,
  Depth extends unknown[] = [],
> = Depth['length'] extends 8
  ? never
  : IsAny<Value> extends true
    ? never
    : Value extends readonly (infer Child)[]
      ? CraftNodeRawChannelsOf<Child, [...Depth, unknown]>
      : DeclaredChannelsOf<Value>;

/**
 * The channel a value declares, `never` if it declares none.
 *
 * The `keyof` guard is load-bearing: the carrier property is optional, so a
 * bare `extends CraftChannelsCarrier<infer C>` matches every type, and for a
 * plain `string` child TypeScript falls back to the constraint and yields
 * `CraftChannels` — whose `discharges` is `unknown`, which then erases every
 * obligation in the tree through `Exclude`. Same guard the deps carrier uses.
 */
type DeclaredChannelsOf<Value> = Value extends object
  ? typeof CRAFT_CHANNELS extends keyof Value
    ? Value extends CraftChannelsCarrier<infer Channels extends CraftChannels>
      ? Channels
      : never
    : never
  : never;

/** The single channel set a children list hands its parent. */
export type CraftNodeChildrenChannels<Value> = MergeChannelUnion<
  CraftNodeRawChannelsOf<Value>
>;

/**
 * What an element contributes: its own channel, its children's, and the ones
 * riding on its props. Props matter because that is where a style class and a
 * `provides(...)` arrive — an element that answers its child's demand does so
 * through a prop, and the answer has to meet the demand here.
 */
type ElementNodeChannels<
  Props extends object,
  Children extends CraftNodeChildren,
> = MergeChannelUnion<
  CraftNodeRawChannelsOf<Children> | CraftNodeRawChannelsOf<Props[keyof Props]>
>;

declare const CHANNEL_PROP: unique symbol;

/**
 * Props that carry a channel nothing else can reach.
 *
 * Only `PipedCraftNodeDirective` needs this: piping a node directive erases the
 * node's props and children, so the demands it had collected would vanish. A
 * phantom prop puts them back on the one path where deriving them is not
 * possible — and, being keyed by a `unique symbol`, it cannot collide with an
 * actual DOM property.
 */
type ChannelCarryingProps<Channels extends CraftChannels> = Readonly<
  Record<string, unknown>
> & {
  readonly [CHANNEL_PROP]?: CraftChannelsCarrier<Channels>;
};

export type CraftTextValue = string | number | bigint | boolean;

/**
 * A text binding. Two shapes, both already supported by the renderer:
 *
 * - a plain read — `() => user.name()`;
 * - a generator — the projected form of a `craftComputed` bound by reference
 *   (`span(fullName)`), whose yields carry its exception and pending markers.
 */
export type CraftTextBinding =
  | (() => CraftTextValue | null | undefined)
  | (() => Generator<any, CraftTextValue | null | undefined, any>);

type ElementNodeExceptions<
  Children extends CraftNodeChildren,
  Exceptions extends string,
> =
  string extends CraftNodeChildrenExceptions<Children>
    ? Exceptions
    : CraftNodeChildrenExceptions<Children>;

/**
 * The async sources an element still needs a `pendingNode` for: the ones read
 * by its children, the ones bound to its own props, plus any inherited from a
 * node it was piped from.
 */
type ElementNodePendingSources<
  Props extends object,
  Children extends CraftNodeChildren,
  PendingSources extends string,
> =
  | PendingSources
  | CraftNodeChildrenPendingSources<Children>
  | CraftNodeChildrenPendingSources<Props[keyof Props]>;

type ElementNodeSettledExceptions<
  Props extends object,
  Children extends CraftNodeChildren,
  SettledExceptions extends string,
> =
  | SettledExceptions
  | CraftNodeChildrenSettledExceptions<Children>
  | CraftNodeChildrenSettledExceptions<Props[keyof Props]>;

export interface ElementNodeBase<
  Dependencies extends object = {},
  Tag extends string = string,
  Props extends object = Readonly<Record<string, unknown>>,
  Children extends CraftNodeChildren = CraftNodeChildren,
  LocalName extends string | undefined = string | undefined,
  Exceptions extends string = string,
  HandledExceptions extends string = string,
  FieldExceptions = unknown,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<ElementNodeExceptions<Children, Exceptions>>,
    CraftChannelsCarrier<ElementNodeChannels<Props, Children>>,
    CraftNodeHandledExceptionsCarrier<HandledExceptions>,
    CraftNodePendingCarrier<
      ElementNodePendingSources<Props, Children, PendingSources>
    >,
    CraftNodeSettledExceptionsCarrier<
      ElementNodeSettledExceptions<Props, Children, SettledExceptions>
    >,
    CraftNodeHeadingNeedCarrier<CraftNodeChildrenHeadingNeed<Children>>,
    CraftNodeFieldExceptionsCarrier<
      FieldExceptions | CraftNodeChildrenRawFieldExceptions<Children>
    > {
  readonly kind: 'element';
  readonly tag: Tag;
  readonly localName?: LocalName;
  readonly props: Props;
  readonly children: Children;
  readonly [CRAFT_NODE_DIRECTIVES]?: readonly AppliedCraftNodeDirective[];
}

export interface ElementNode<
  Dependencies extends object = {},
  Tag extends string = string,
  Props extends object = Readonly<Record<string, unknown>>,
  Children extends CraftNodeChildren = CraftNodeChildren,
  LocalName extends string | undefined = string | undefined,
  Exceptions extends string = string,
  HandledExceptions extends string = string,
  FieldExceptions = never,
  CssVars extends CssVarContract = EmptyCssVarContract,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
> extends ElementNodeBase<
      Dependencies,
      Tag,
      Props,
      Children,
      LocalName,
      Exceptions,
      HandledExceptions,
      FieldExceptions,
      PendingSources,
      SettledExceptions
    >,
    CraftNodeCssVarsCarrier<CssVars> {
  readonly [CRAFT_NODE_EXCEPTIONS]: ElementNodeExceptions<Children, Exceptions>;
  readonly [CRAFT_NODE_FIELD_EXCEPTIONS]:
    | FieldExceptions
    | CraftNodeChildrenRawFieldExceptions<Children>;
  readonly pipe: CraftNodePipe<
    Dependencies,
    ElementNodeExceptions<Children, Exceptions>,
    FieldExceptions | CraftNodeChildrenRawFieldExceptions<Children>,
    ElementNodePendingSources<Props, Children, PendingSources>,
    ElementNodeSettledExceptions<Props, Children, SettledExceptions>,
    ElementNodeChannels<Props, Children>
  >;
}

type PipedNode<
  Dependencies extends object,
  Exceptions extends string,
  FieldExceptions,
  Directive extends CraftDirective,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
  Channels extends CraftChannels = EmptyChannels,
> =
  Directive extends PendingDirective<
    infer Handlers extends PendingHandlers | undefined,
    infer FallbackChildren extends CraftNodeChildren
  >
    ? PendingNode<
        Dependencies | CraftNodeChildrenDependencies<FallbackChildren>,
        Exceptions | CraftNodeChildrenExceptions<FallbackChildren>,
        FieldExceptions | CraftNodeChildrenRawFieldExceptions<FallbackChildren>,
        | PendingResidualSources<PendingSources, Handlers>
        // A fallback that suspends in turn needs a boundary of its own.
        | CraftNodeChildrenPendingSources<FallbackChildren>,
        // A pending boundary is not an exception boundary: settled exceptions
        // pass straight through it.
        | SettledExceptions
        | CraftNodeChildrenSettledExceptions<FallbackChildren>,
        // A pending boundary answers nothing and breaks nothing: whatever the
        // source demanded, the fallback's own demands join it.
        MergeChannelUnion<Channels | CraftNodeRawChannelsOf<FallbackChildren>>
      >
    : PipedNodeWithoutPending<
        Dependencies,
        Exceptions,
        FieldExceptions,
        Directive,
        PendingSources,
        SettledExceptions,
        Channels
      >;

type PipedNodeWithoutPending<
  Dependencies extends object,
  Exceptions extends string,
  FieldExceptions,
  Directive extends CraftDirective,
  PendingSources extends string,
  SettledExceptions extends string,
  Channels extends CraftChannels,
> =
  Directive extends FieldErrorDirective<
    infer FieldHandlers extends FieldExceptionHandlers,
    boolean
  >
    ? FieldErrorNode<
        Dependencies | CraftDirectiveTemplateDependencies<Directive>,
        | Exceptions
        | CraftNodeChildrenExceptions<
            FieldExceptionHandlerChildren<FieldHandlers[keyof FieldHandlers]>
          >,
        | ResidualFieldValidationCases<
            UnhandledFieldValidationCases<FieldExceptions>,
            FieldHandlers
          >
        | FieldExceptionHandlerFieldExceptions<FieldHandlers>
        | Extract<FieldExceptions, FieldValidationHandledIdentitiesCarrier<any>>
        | FieldValidationHandledIdentitiesCarrier<
            FieldValidationHandledIdentities<FieldExceptions, FieldHandlers>
          >,
        FieldHandlers,
        | PendingSources
        | CraftNodeChildrenPendingSources<
            FieldExceptionHandlerChildren<FieldHandlers[keyof FieldHandlers]>
          >,
        | SettledExceptions
        | CraftNodeChildrenSettledExceptions<
            FieldExceptionHandlerChildren<FieldHandlers[keyof FieldHandlers]>
          >,
        MergeChannelUnion<
          | Channels
          | CraftNodeRawChannelsOf<
              FieldExceptionHandlerChildren<FieldHandlers[keyof FieldHandlers]>
            >
        >
      >
    : Directive extends CatchDirective<
          infer Handlers extends CatchHandlers
        >
      ? CatchNode<
          Dependencies | CraftDirectiveTemplateDependencies<Directive>,
          | Exclude<Exceptions, Extract<keyof Handlers, string>>
          | CraftNodeChildrenExceptions<
              CatchHandlerChildren<Handlers[keyof Handlers]>
            >,
          Handlers,
          Directive[typeof CATCH_NODE_DIRECTIVE]['position'],
          FieldExceptions,
          | PendingSources
          | CraftNodeChildrenPendingSources<
              CatchHandlerChildren<Handlers[keyof Handlers]>
            >,
          // The boundary clears the settled codes it handles, and inherits any
          // its own handlers reach.
          | Exclude<SettledExceptions, Extract<keyof Handlers, string>>
          | CraftNodeChildrenSettledExceptions<
              CatchHandlerChildren<Handlers[keyof Handlers]>
            >,
          // An exception boundary is not a style boundary. A demand raised
          // under it still has to be answered above it, and the handlers'
          // own demands join in.
          MergeChannelUnion<
            | Channels
            | CraftNodeRawChannelsOf<
                CatchHandlerChildren<Handlers[keyof Handlers]>
              >
          >
        >
      : CraftDirectiveNode<
          Dependencies | CraftDirectiveTemplateDependencies<Directive>,
          Exceptions,
          FieldExceptions,
          PendingSources,
          SettledExceptions,
          Channels
        >;

type PipedCraftNodeDirective<
  Dependencies extends object,
  Exceptions extends string,
  FieldExceptions,
  Directive extends CraftNodeDirective<any>,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
  Channels extends CraftChannels = EmptyChannels,
> = ElementNode<
  Dependencies,
  string,
  ChannelCarryingProps<Channels>,
  CraftNodeChildren,
  string | undefined,
  Exceptions,
  string,
  FieldExceptions | FieldValidationCasesOf<Directive>,
  EmptyCssVarContract,
  PendingSources,
  SettledExceptions
>;

export type CraftNodePipe<
  Dependencies extends object = {},
  Exceptions extends string = string,
  FieldExceptions = never,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
  Channels extends CraftChannels = EmptyChannels,
> = {
  <Directive extends CraftDirective>(
    directive: (Directive extends ScheduleForDirective ? never : Directive) &
      (Directive extends PendingDirective<
        infer Handlers extends PendingHandlers | undefined,
        CraftNodeChildren
      >
        ? Handlers extends PendingHandlers
          ? PendingExhaustiveCheck<PendingSources, Handlers>
          : unknown
        : Directive extends CatchDirective<
              infer Handlers extends CatchHandlers
            >
          ? CatchTagExhaustiveCodesCheck<
              Exceptions | SettledExceptions,
              Record<Extract<keyof Handlers, string>, unknown>
            >
          : Directive extends FieldErrorDirective<
                infer FieldHandlers extends FieldExceptionHandlers,
                infer Exhaustive extends boolean
              >
            ? Exhaustive extends true
              ? [UnhandledFieldValidationCases<FieldExceptions>] extends [never]
                ? unknown
                : FieldErrorExhaustiveCheck<
                    UnhandledFieldValidationCases<FieldExceptions>,
                    FieldHandlers
                  >
              : [UnhandledFieldValidationCases<FieldExceptions>] extends [never]
                ? unknown
                : FieldErrorPartialCheck<
                    UnhandledFieldValidationCases<FieldExceptions>,
                    FieldHandlers
                  >
            : unknown),
  ): PipedNode<
    Dependencies,
    Exceptions,
    FieldExceptions,
    Directive,
    PendingSources,
    SettledExceptions,
    Channels
  >;
  <Directive extends CraftNodeDirective<any>>(
    directive: Directive,
  ): PipedCraftNodeDirective<
    Dependencies,
    Exceptions,
    FieldExceptions,
    Directive,
    PendingSources,
    SettledExceptions,
    Channels
  >;
  (directive: CraftHostType<unknown>): CraftNode;
};

export type ForNodePipe<
  Dependencies extends object = {},
  Exceptions extends string = string,
  FieldExceptions = never,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
  Item = unknown,
  Key = unknown,
  SourceName extends string | undefined = string | undefined,
  ItemChildren extends CraftNodeChildren = CraftNodeChildren,
  EmptyChildren extends CraftNodeChildren = CraftNodeChildren,
  Schedule extends ForSchedulePolicy | undefined =
    | ForSchedulePolicy
    | undefined,
> = CraftNodePipe<
  Dependencies,
  Exceptions,
  FieldExceptions,
  PendingSources,
  SettledExceptions
> & {
  <Policy extends ForSchedulePolicy>(
    directive: ScheduleForDirective<Policy>,
  ): ForNode<
    Item,
    Key,
    Dependencies,
    SourceName,
    ItemChildren,
    EmptyChildren,
    Policy
  >;
};

export interface AppliedCraftNodeDirective {
  readonly directive: CraftNodeDirective<any>;
  readonly inputs: Readonly<Record<string, unknown>>;
}

export interface CraftDirectiveNode<
  Dependencies extends object = {},
  Exceptions extends string = string,
  FieldExceptions = unknown,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
  Channels extends CraftChannels = EmptyChannels,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<Exceptions>,
    CraftChannelsCarrier<Channels>,
    CraftNodePendingCarrier<PendingSources>,
    CraftNodeSettledExceptionsCarrier<SettledExceptions>,
    CraftNodeFieldExceptionsCarrier<FieldExceptions> {
  readonly [CRAFT_NODE_EXCEPTIONS]: Exceptions;
  readonly [CRAFT_NODE_FIELD_EXCEPTIONS]: FieldExceptions;
  readonly kind: 'directive';
  readonly node: CraftNode;
  readonly directives: readonly CraftDirective[];
  readonly pipe: CraftNodePipe<
    Dependencies,
    Exceptions,
    FieldExceptions,
    PendingSources,
    SettledExceptions,
    Channels
  >;
}

export interface TextNode {
  readonly kind: 'text';
  readonly value: string;
}

/**
 * Internal VNode used to retain a text binding until it is mounted. Keeping
 * the callback intact lets the renderer give every binding its own reactive
 * effect instead of collecting its dependencies in the component render.
 */
export interface ReactiveTextNode {
  readonly kind: 'reactive-text';
  readonly binding: CraftTextBinding;
}

export interface ComponentNode<
  Props extends object = object,
  ComponentDeps extends object = {},
  Component extends CraftComponent<
    any,
    ComponentDeps,
    any,
    any,
    any,
    any,
    any,
    any,
    any
  > = CraftComponent<any, ComponentDeps, any, any, any, any, any, any, any>,
  ContentDependencies extends object = ContentDependenciesFromProps<Props>,
  InputExceptions extends string = never,
  CssVars extends CssVarContract = EmptyCssVarContract,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
  Channels extends CraftChannels = EmptyChannels,
> extends CraftNodeDepsCarrier<ComponentDeps & ContentDependencies>,
    CraftNodeCssVarsCarrier<CssVars>,
    CraftChannelsCarrier<ComponentNodeChannels<Props, Channels>>,
    CraftNodeExceptionsCarrier<
      ComponentInitializationExceptionsOf<Component> | InputExceptions
    >,
    CraftNodePendingCarrier<
      PendingSources | ContentPendingSourcesFromProps<Props>
    >,
    CraftNodeSettledExceptionsCarrier<
      SettledExceptions | ContentSettledExceptionsFromProps<Props>
    >,
    CraftNodeHeadingNeedCarrier<
      RemapToChildHeadingNeed<
        ComponentHeadingNeedOf<Component> | ContentHeadingNeedFromProps<Props>
      >
    >,
    CraftNodeFieldExceptionsCarrier<
      | ComponentFieldExceptionsOf<Component>
      | ContentFieldExceptionsFromProps<Props>
    > {
  readonly kind: 'component';
  readonly component: Component;
  readonly props: Props;
  /** Optional route/feature injector used as this component's DI parent. */
  readonly injector?: HostInjector;
  readonly declarationContext?: unknown;
  readonly [CRAFT_NODE_EXCEPTIONS]:
    | ComponentInitializationExceptionsOf<Component>
    | InputExceptions;
  readonly [CRAFT_NODE_FIELD_EXCEPTIONS]:
    | ComponentFieldExceptionsOf<Component>
    | ContentFieldExceptionsFromProps<Props>;
  readonly pipe: CraftNodePipe<
    ComponentDeps & ContentDependencies,
    ComponentInitializationExceptionsOf<Component> | InputExceptions,
    | ComponentFieldExceptionsOf<Component>
    | ContentFieldExceptionsFromProps<Props>,
    PendingSources | ContentPendingSourcesFromProps<Props>,
    SettledExceptions | ContentSettledExceptionsFromProps<Props>,
    ComponentNodeChannels<Props, Channels>
  >;
}

export interface CatchNode<
  Dependencies extends object = {},
  Exceptions extends string = string,
  Handlers extends CatchHandlers = CatchHandlers,
  Position extends CatchPosition = CatchPosition,
  FieldExceptions = unknown,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
  Channels extends CraftChannels = EmptyChannels,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<Exceptions>,
    CraftChannelsCarrier<Channels>,
    CraftNodeHandledExceptionsCarrier<Extract<keyof Handlers, string>>,
    CraftNodePendingCarrier<PendingSources>,
    CraftNodeSettledExceptionsCarrier<SettledExceptions>,
    CraftNodeFieldExceptionsCarrier<FieldExceptions> {
  readonly kind: 'catch';
  readonly source: CraftNode;
  readonly handlers: Handlers;
  readonly position: Position;
}

export interface FieldErrorNode<
  Dependencies extends object = {},
  Exceptions extends string = string,
  FieldExceptions = never,
  Handlers extends FieldExceptionHandlers = FieldExceptionHandlers,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
  Channels extends CraftChannels = EmptyChannels,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<Exceptions>,
    CraftChannelsCarrier<Channels>,
    CraftNodePendingCarrier<PendingSources>,
    CraftNodeSettledExceptionsCarrier<SettledExceptions>,
    CraftNodeFieldExceptionsCarrier<FieldExceptions> {
  readonly kind: 'field-error';
  readonly [CRAFT_NODE_FIELD_EXCEPTIONS]: FieldExceptions;
  readonly source: CraftNodeChildren;
  readonly handlers: Handlers;
  readonly options: Required<
    Pick<FieldErrorOptions, 'mode' | 'position'>
  > &
    Pick<FieldErrorOptions, 'visibility'>;
  readonly pipe: CraftNodePipe<
    Dependencies,
    Exceptions,
    FieldExceptions,
    PendingSources,
    SettledExceptions,
    Channels
  >;
}

export interface MatchNode<
  Dependencies extends object = {},
  Source extends ((...args: any[]) => unknown) | object = () =>
    | object
    | undefined,
  Children extends CraftNodeChildren = CraftNodeChildren,
  HandledExceptions extends string = string,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeHandledExceptionsCarrier<HandledExceptions>,
    CraftChannelsCarrier<CraftNodeChildrenChannels<Children>>,
    CraftNodePendingCarrier<CraftNodeChildrenPendingSources<Children>>,
    CraftNodeSettledExceptionsCarrier<
      CraftNodeChildrenSettledExceptions<Children>
    > {
  readonly kind: 'match';
  readonly source: Source;
  readonly key: PropertyKey;
  readonly handlers: Record<string, (exception: AnyCraftException) => Children>;
}

export interface ForNode<
  Item = unknown,
  Key = unknown,
  Dependencies extends object = {},
  SourceName extends string | undefined = string | undefined,
  ItemChildren extends CraftNodeChildren = CraftNodeChildren,
  EmptyChildren extends CraftNodeChildren = CraftNodeChildren,
  Schedule extends ForSchedulePolicy | undefined =
    | ForSchedulePolicy
    | undefined,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeCssVarsCarrier<
      CraftNodeChildrenCssVars<ItemChildren | EmptyChildren>
    >,
    CraftChannelsCarrier<
      CraftNodeChildrenChannels<ItemChildren | EmptyChildren>
    >,
    CraftNodePendingCarrier<
      | CraftNodeChildrenPendingSources<ItemChildren>
      | CraftNodeChildrenPendingSources<EmptyChildren>
    >,
    CraftNodeSettledExceptionsCarrier<
      | CraftNodeChildrenSettledExceptions<ItemChildren>
      | CraftNodeChildrenSettledExceptions<EmptyChildren>
    >,
    CraftNodeHeadingNeedCarrier<
      | CraftNodeChildrenHeadingNeed<ItemChildren>
      | CraftNodeChildrenHeadingNeed<EmptyChildren>
    >,
    CraftNodeFieldExceptionsCarrier<
      | CraftNodeChildrenRawFieldExceptions<ItemChildren>
      | CraftNodeChildrenRawFieldExceptions<EmptyChildren>
    > {
  readonly kind: 'for';
  readonly source:
    | readonly Item[]
    | null
    | undefined
    | (() => readonly Item[] | null | undefined)
    | (() => Generator<unknown, readonly Item[] | null | undefined, unknown>);
  readonly sourceName?: SourceName;
  readonly track: (item: Item, index: number) => Key;
  readonly empty?: () => EmptyChildren;
  readonly schedule?: Schedule;
  readonly itemTemplate: (
    item: InputValue<Item>,
    index: number,
  ) => ItemChildren;
  readonly pipe: ForNodePipe<
    Dependencies,
    CraftNodeChildrenExceptions<ItemChildren | EmptyChildren>,
    CraftNodeChildrenRawFieldExceptions<ItemChildren | EmptyChildren>,
    | CraftNodeChildrenPendingSources<ItemChildren>
    | CraftNodeChildrenPendingSources<EmptyChildren>,
    CraftNodeChildrenSettledExceptions<ItemChildren | EmptyChildren>,
    Item,
    Key,
    SourceName,
    ItemChildren,
    EmptyChildren,
    Schedule
  >;
}

export interface IfNode<
  ConditionName extends string = string,
  Dependencies extends object = {},
  TrueChildren extends CraftNodeChildren = CraftNodeChildren,
  FalseChildren extends CraftNodeChildren = CraftNodeChildren,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeCssVarsCarrier<
      CraftNodeChildrenCssVars<TrueChildren | FalseChildren>
    >,
    // A union, not a product: what the two branches demand is the sum of what
    // each demands, and a discharge in either branch is not a discharge for
    // the other. Task 16 tags the branches so the *variant* contract can tell
    // them apart; the demands themselves merge here.
    CraftChannelsCarrier<
      CraftNodeChildrenChannels<TrueChildren | FalseChildren>
    >,
    CraftNodePendingCarrier<
      | CraftNodeChildrenPendingSources<TrueChildren>
      | CraftNodeChildrenPendingSources<FalseChildren>
    >,
    CraftNodeSettledExceptionsCarrier<
      | CraftNodeChildrenSettledExceptions<TrueChildren>
      | CraftNodeChildrenSettledExceptions<FalseChildren>
    >,
    CraftNodeHeadingNeedCarrier<
      | CraftNodeChildrenHeadingNeed<TrueChildren>
      | CraftNodeChildrenHeadingNeed<FalseChildren>
    >,
    CraftNodeFieldExceptionsCarrier<
      | CraftNodeChildrenRawFieldExceptions<TrueChildren>
      | CraftNodeChildrenRawFieldExceptions<FalseChildren>
    > {
  readonly kind: 'if';
  readonly condition: () => boolean;
  readonly conditionName: ConditionName;
  readonly whenTrue: () => TrueChildren;
  readonly whenFalse?: () => FalseChildren;
}

/**
 * Relative heading. The runtime picks `h1`–`h6` from the current outline
 * level. The node brands the subtree as needing a parent outline.
 */
export interface HeadingNode<
  Dependencies extends object = {},
  Children extends CraftNodeChildren = CraftNodeChildren,
  Props extends object = Readonly<Record<string, unknown>>,
  Need extends string = never,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeCssVarsCarrier<CraftNodeChildrenCssVars<Children>>,
    CraftChannelsCarrier<CraftNodeChildrenChannels<Children>>,
    CraftNodePendingCarrier<CraftNodeChildrenPendingSources<Children>>,
    CraftNodeSettledExceptionsCarrier<
      CraftNodeChildrenSettledExceptions<Children>
    >,
    CraftNodeHeadingNeedCarrier<Need>,
    CraftNodeFieldExceptionsCarrier<
      CraftNodeChildrenRawFieldExceptions<Children>
    > {
  readonly kind: 'heading';
  readonly props: Props;
  readonly children: Children;
  readonly pipe: CraftNodePipe<
    Dependencies,
    CraftNodeChildrenExceptions<Children>,
    CraftNodeChildrenRawFieldExceptions<Children>,
    CraftNodeChildrenPendingSources<Children>,
    CraftNodeChildrenSettledExceptions<Children>,
    CraftNodeChildrenChannels<Children>
  >;
}

/**
 * Increments the heading outline for its subtree without a DOM wrapper.
 * Absorbs children's heading need — the parent established the outline.
 * `reset: true` (`headingRoot`) starts the outline at level 1 instead of
 * incrementing — used by route pages and skip-link shells.
 */
export interface HeadingSectionNode<
  Dependencies extends object = {},
  Children extends CraftNodeChildren = CraftNodeChildren,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeCssVarsCarrier<CraftNodeChildrenCssVars<Children>>,
    CraftChannelsCarrier<CraftNodeChildrenChannels<Children>>,
    CraftNodePendingCarrier<CraftNodeChildrenPendingSources<Children>>,
    CraftNodeSettledExceptionsCarrier<
      CraftNodeChildrenSettledExceptions<Children>
    >,
    CraftNodeHeadingNeedCarrier<never>,
    CraftNodeFieldExceptionsCarrier<
      CraftNodeChildrenRawFieldExceptions<Children>
    > {
  readonly kind: 'heading-section';
  readonly reset?: boolean;
  readonly children: Children;
}

export type DeferTrigger = 'immediate' | 'idle' | 'viewport' | 'interaction';

export interface DeferNode<
  Loaded = unknown,
  Dependencies extends object = {},
  Children extends CraftNodeChildren = CraftNodeChildren,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeCssVarsCarrier<CraftNodeChildrenCssVars<Children>>,
    CraftChannelsCarrier<CraftNodeChildrenChannels<Children>>,
    CraftNodePendingCarrier<CraftNodeChildrenPendingSources<Children>>,
    CraftNodeSettledExceptionsCarrier<
      CraftNodeChildrenSettledExceptions<Children>
    >,
    CraftNodeHeadingNeedCarrier<CraftNodeChildrenHeadingNeed<Children>>,
    CraftNodeFieldExceptionsCarrier<
      CraftNodeChildrenRawFieldExceptions<Children>
    > {
  readonly kind: 'defer';
  readonly loader: (helpers: CraftLazyLoadHelpers) => Promise<Loaded>;
  readonly resolve: (loaded: Loaded) => CraftNodeChildren;
  readonly trigger: DeferTrigger;
  readonly placeholder?: () => CraftNodeChildren;
  readonly loading?: () => CraftNodeChildren;
  readonly error?: (error: unknown) => CraftNodeChildren;
}

/**
 * A suspension boundary. Its source subtree stays mounted while it is pending —
 * hidden, not destroyed — and the fallback is inserted next to it.
 */
export interface PendingNode<
  Dependencies extends object = {},
  Exceptions extends string = string,
  FieldExceptions = unknown,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
  Channels extends CraftChannels = EmptyChannels,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<Exceptions>,
    CraftChannelsCarrier<Channels>,
    CraftNodePendingCarrier<PendingSources>,
    CraftNodeSettledExceptionsCarrier<SettledExceptions>,
    CraftNodeFieldExceptionsCarrier<FieldExceptions> {
  readonly [CRAFT_NODE_EXCEPTIONS]: Exceptions;
  readonly kind: 'pending';
  readonly source: CraftNode;
  readonly handlers: PendingHandlers | undefined;
  readonly fallback: PendingFallback | undefined;
  readonly reloading: PendingFallback | undefined;
  readonly position: PendingPosition;
  readonly ssr: SsrMode | undefined;
  readonly pipe: CraftNodePipe<
    Dependencies,
    Exceptions,
    FieldExceptions,
    PendingSources,
    SettledExceptions,
    Channels
  >;
}

export type CraftNode =
  | ElementNodeBase<any>
  | TextNode
  | ReactiveTextNode
  | ComponentNode<any, any, any, any, any, any>
  | CraftDirectiveNode<any>
  | ForNode<any, any, any, any, any, any>
  | IfNode<any, any, any, any>
  | HeadingNode<any, any, any>
  | HeadingSectionNode<any, any>
  | DeferNode<any, any, any>
  | CatchNode<any, any>
  | PendingNode<any, any, any, any>
  | FieldErrorNode<any, any, any>
  | MatchNode<any, any>
  | ProjectionNode<any, any>
  | TemplateNode<any, any, any>;

export type CraftNodeChild =
  | CraftNode
  // Keep generic node specialisations assignable even when their type-only
  // carriers contain narrower contracts than the broad CraftNode union.
  | { readonly kind: CraftNode['kind'] }
  | CraftTextValue
  | CraftTextBinding
  | null
  | undefined
  | readonly CraftNodeChild[];

export type CraftNodeChildren = CraftNodeChild | readonly CraftNodeChild[];

type ContentChildrenFromProps<Props extends object> =
  Props[keyof Props] extends infer Value
    ? Value extends (...args: any[]) => infer Output
      ? Output
      : Value extends readonly (infer Item)[]
        ? Item
        : Value extends CraftNode
          ? Value
          : never
    : never;

export type ContentDependenciesFromProps<Props extends object> =
  CraftNodeChildrenDependencies<ContentChildrenFromProps<Props>>;

export type ContentFieldExceptionsFromProps<Props extends object> =
  CraftNodeChildrenRawFieldExceptions<ContentChildrenFromProps<Props>>;

/**
 * Async sources read by content a caller projects into a component. They are the
 * caller's responsibility: the nodes are declared in the caller's template, so
 * the boundary belongs there too.
 */
export type ContentPendingSourcesFromProps<Props extends object> =
  CraftNodeChildrenPendingSources<ContentChildrenFromProps<Props>>;

/** Settled exceptions reachable through content a caller projects in. */
export type ContentSettledExceptionsFromProps<Props extends object> =
  CraftNodeChildrenSettledExceptions<ContentChildrenFromProps<Props>>;

export type ContentHeadingNeedFromProps<Props extends object> =
  CraftNodeChildrenHeadingNeed<ContentChildrenFromProps<Props>>;

/**
 * What a component's own template still demands of whoever renders it — read
 * off the template's return type, the same way the css-var contract is.
 *
 * A component boundary is not a boundary for these: an obligation the template
 * could not answer internally is exactly the one the caller must answer.
 *
 * Computed from `Template`, never from the assembled `CraftComponent`. Going
 * through the component would re-derive the whole component type at every call
 * site, and since a template's children are themselves component nodes, that
 * nests until TypeScript gives up with TS2589. Reading `Template` once — and
 * letting each child node hand back the channel it already carries — keeps the
 * work flat, which is the same reason `ComponentCssVars` is written this way.
 */
export type ComponentTemplateChannels<Template> = Template extends (
  ...args: any[]
) => infer Output
  ? CraftNodeChildrenChannels<Output>
  : EmptyChannels;

/**
 * A component call site merges two sources: what the component's own template
 * still demands, and what the content projected into it demands — the caller
 * wrote those nodes, so they are the caller's problem.
 */
type ComponentNodeChannels<
  Props extends object,
  Channels extends CraftChannels,
> = MergeChannelUnion<
  Channels | CraftNodeRawChannelsOf<ContentChildrenFromProps<Props>>
>;

export type ComponentHeadingNeedOf<Component> =
  Component extends CraftComponent<any, any, any, any, any, any, infer Template>
    ? Template extends (...args: any[]) => infer Output
      ? CraftNodeChildrenHeadingNeed<Output>
      : never
    : never;

export interface ProjectionNode<
  Dependencies extends object = {},
  Output extends CraftNodeChildren = CraftNodeChildren,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeCssVarsCarrier<CraftNodeChildrenCssVars<Output>>,
    CraftChannelsCarrier<CraftNodeChildrenChannels<Output>>,
    CraftNodePendingCarrier<CraftNodeChildrenPendingSources<Output>>,
    CraftNodeSettledExceptionsCarrier<
      CraftNodeChildrenSettledExceptions<Output>
    >,
    CraftNodeFieldExceptionsCarrier<
      CraftNodeChildrenRawFieldExceptions<Output>
    > {
  readonly kind: 'projection';
  readonly render: () => Output;
  readonly slotName?: string;
  readonly stylePolicy: ContentStylePolicy;
  readonly declarationContext?: unknown;
}

export interface TemplateNode<
  Context = unknown,
  Output extends CraftNodeChildren = CraftNodeChildren,
  Dependencies extends object = CraftNodeChildrenDependencies<Output>,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftChannelsCarrier<CraftNodeChildrenChannels<Output>>,
    CraftNodePendingCarrier<CraftNodeChildrenPendingSources<Output>>,
    CraftNodeSettledExceptionsCarrier<
      CraftNodeChildrenSettledExceptions<Output>
    > {
  readonly __craftNodeCssVars__?: CraftNodeChildrenCssVars<Output>;
  readonly [CRAFT_NODE_FIELD_EXCEPTIONS]?: CraftNodeChildrenRawFieldExceptions<Output>;
  readonly kind: 'template';
  readonly template: CraftTemplate<Context, Output>;
  readonly context: Context;
  readonly declarationContext?: unknown;
}

/** The yields of a child written as (or projected to) a generator callback. */
type ChildBindingYielded<Value> = Value extends (
  ...args: any[]
) => Generator<infer Yielded, any, any>
  ? Yielded
  : never;

// NOTE — the exceptions a settled read may raise are deliberately NOT folded in
// here. `RequireCaughtComponentExceptions` fires on the children of the tag
// helper that receives them, and a text binding has no place to put a boundary:
// `span(userName)` would demand a `catchNode` inside `span`'s own children.
// They are routed at runtime instead (to the nearest `catchNode`, else
// `CraftUnhandledExceptionError`); a deferred compile-time channel for them,
// checked at `craftComponent` like the pending one, is the next iteration.
type CraftNodeDirectExceptions<Value> =
  IsAny<Value> extends true
    ? never
    : Value extends CraftNodeExceptionsCarrier<infer Exceptions>
      ? string extends Exceptions
        ? never
        : Exceptions
      : never;

export type CraftNodeChildrenExceptions<Value> = Value extends unknown
  ? Value extends readonly (infer Child)[]
    ? CraftNodeDirectExceptions<Child>
    : CraftNodeDirectExceptions<Value>
  : never;

type CraftNodeDirectPendingSources<Value> =
  IsAny<Value> extends true
    ? never
    : // Either a bound `settledValue` / async `craftComputed` (branded signal),
      // or a child node that still carries uncovered sources of its own.
      | CraftSettledSourcesOf<Value>
        | ExtractCraftPendingSources<ChildBindingYielded<Value>>
        | (Value extends CraftNodePendingCarrier<infer Sources>
            ? string extends Sources
              ? never
              : Sources
            : never);

export type CraftNodeChildrenPendingSources<Value> = Value extends unknown
  ? Value extends readonly (infer Child)[]
    ? CraftNodeDirectPendingSources<Child>
    : CraftNodeDirectPendingSources<Value>
  : never;

type CraftNodeDirectSettledExceptions<Value> =
  IsAny<Value> extends true
    ? never
    : // A bound `settledValue` carries its source's exceptions; through the
      // template context an async `craftComputed` is projected to a generator
      // callback, so the same markers arrive on its yields instead.
      | CraftSettledCodesOf<Value>
        | Extract<
            ExtractCraftGenExceptions<ChildBindingYielded<Value>>,
            { readonly _tag: string }
          >['_tag']
        | (Value extends CraftNodeSettledExceptionsCarrier<infer Codes>
            ? string extends Codes
              ? never
              : Codes
            : never);

export type CraftNodeChildrenSettledExceptions<Value> = Value extends unknown
  ? Value extends readonly (infer Child)[]
    ? CraftNodeDirectSettledExceptions<Child>
    : CraftNodeDirectSettledExceptions<Value>
  : never;

type CraftNodeDirectHeadingNeed<Value> =
  IsAny<Value> extends true
    ? never
    : Value extends CraftNodeHeadingNeedCarrier<infer Need>
      ? string extends Need
        ? never
        : Need
      : never;

export type CraftNodeChildrenHeadingNeed<Value> = Value extends unknown
  ? Value extends readonly (infer Child)[]
    ? CraftNodeDirectHeadingNeed<Child>
    : CraftNodeDirectHeadingNeed<Value>
  : never;

type CraftNodeDirectFieldExceptions<Value> =
  IsAny<Value> extends true
    ? never
    : Value extends CraftNodeFieldExceptionsCarrier<infer Cases>
      ? IsAny<Cases> extends true
        ? never
        : unknown extends Cases
          ? never
          : Exclude<Cases, undefined>
      : never;

export type CraftNodeChildrenRawFieldExceptions<Value> = Value extends unknown
  ? Value extends readonly (infer Child)[]
    ? CraftNodeDirectFieldExceptions<Child>
    : CraftNodeDirectFieldExceptions<Value>
  : never;

export type CraftNodeChildrenFieldExceptions<Value> =
  UnhandledFieldValidationCases<CraftNodeChildrenRawFieldExceptions<Value>>;

type CraftNodeDirectHandledExceptionCodes<Value> =
  IsAny<Value> extends true
    ? never
    : Value extends CraftNodeHandledExceptionsCarrier<
          infer Codes extends string
        >
      ? string extends Codes
        ? never
        : Codes
      : never;

export type CraftNodeChildrenHandledExceptionCodes<Value> =
  Value extends unknown
    ? Value extends readonly (infer Child)[]
      ? CraftNodeDirectHandledExceptionCodes<Child>
      : CraftNodeDirectHandledExceptionCodes<Value>
    : never;

/** A template child is renderable only after its component exceptions are handled. */
type RequireCaughtInitializationExceptions<Children extends CraftNodeChildren> =
  IsAny<CraftNodeChildrenExceptions<Children>> extends true
    ? unknown
    : [CraftNodeChildrenExceptions<Children>] extends [never]
      ? unknown
      : {
          'catchTag.exhaustive or catchNode.exhaustive is required before rendering component exceptions': CraftNodeChildrenExceptions<Children>;
        };

type DirectComponentFieldExceptions<Value> =
  IsAny<Value> extends true
    ? never
    : Value extends ComponentNode<any, any, infer Component>
      ? ComponentFieldExceptionsOf<Component> extends infer Cases
        ? IsAny<Cases> extends true
          ? never
          : Cases
        : never
      : never;

type ComponentFieldExceptionsInChildren<Value> =
  Value extends readonly (infer Child)[]
    ? DirectComponentFieldExceptions<Child>
    : DirectComponentFieldExceptions<Value>;

type RequireHandledComponentFieldExceptions<
  Children extends CraftNodeChildren,
> =
  unknown extends ComponentFieldExceptionsInChildren<Children>
    ? unknown
    : [ComponentFieldExceptionsInChildren<Children>] extends [never]
      ? unknown
      : {
          'fieldErrorNode.exhaustive is required before rendering component field exceptions': ComponentFieldExceptionsInChildren<Children>;
        };

export type RequireCaughtComponentExceptions<
  Children extends CraftNodeChildren,
> = RequireCaughtInitializationExceptions<Children> &
  RequireHandledComponentFieldExceptions<Children>;

export function isCraftNode(value: unknown): value is CraftNode {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    return false;
  }

  return (
    value.kind === 'element' ||
    value.kind === 'text' ||
    value.kind === 'component' ||
    value.kind === 'angular' ||
    value.kind === 'directive' ||
    value.kind === 'for' ||
    value.kind === 'if' ||
    value.kind === 'heading' ||
    value.kind === 'heading-section' ||
    value.kind === 'defer' ||
    value.kind === 'catch' ||
    value.kind === 'pending' ||
    value.kind === 'field-error' ||
    value.kind === 'match' ||
    value.kind === 'projection' ||
    value.kind === 'template'
  );
}

function withPipe(node: any): any {
  return {
    ...node,
    pipe: ((
      directive:
        | CraftDirective
        | CraftNodeDirective<any>
        | ScheduleForDirective
        | CraftHostType<unknown>,
    ) => pipeCraftNode(node as CraftNode, directive)) as CraftNodePipe,
  };
}

export function pipeCraftNode(
  node: CraftNode,
  directive:
    | CraftDirective
    | CraftNodeDirective<any>
    | ScheduleForDirective
    | CraftHostType<unknown>,
): CraftNode {
  if (isScheduleForDirective(directive)) {
    if (node.kind !== 'for') {
      throw new TypeError(
        'scheduleFor(...) can only be piped onto a forNode(...) block.',
      );
    }
    return withPipe({
      ...node,
      schedule: directive[SCHEDULE_FOR_DIRECTIVE],
    });
  }

  if (isCraftNodeDirective(directive)) {
    node = applyCraftNodeDirective(node, directive);
    if (!isCraftDirective(directive)) {
      return node;
    }
  }

  if (!isCraftDirective(directive)) {
    if (node.kind === 'directive') {
      return withPipe({
        ...node,
        node: pipeCraftNode(node.node, directive),
      });
    }

    // Only Craft directives are applicable; anything else is a no-op now that
    // Angular directive definitions (`ɵdir`) are gone.
    return node;
  }

  const catchNodeDefinition = (
    directive as Partial<Record<typeof CATCH_NODE_DIRECTIVE, unknown>>
  )[CATCH_NODE_DIRECTIVE];
  if (catchNodeDefinition) {
    const definition = catchNodeDefinition as {
      readonly handlers: CatchHandlers;
      readonly position: CatchPosition;
    };
    return {
      kind: 'catch',
      source: node,
      handlers: definition.handlers,
      position: definition.position,
    } as CatchNode;
  }

  const pendingNodeDefinition = (
    directive as Partial<Record<typeof PENDING_NODE_DIRECTIVE, unknown>>
  )[PENDING_NODE_DIRECTIVE];
  if (pendingNodeDefinition) {
    const definition = pendingNodeDefinition as {
      readonly handlers: PendingHandlers | undefined;
      readonly fallback: PendingFallback | undefined;
      readonly reloading: PendingFallback | undefined;
      readonly position: PendingPosition;
      readonly ssr: SsrMode | undefined;
    };
    return withPipe({
      kind: 'pending',
      source: node,
      handlers: definition.handlers,
      fallback: definition.fallback,
      reloading: definition.reloading,
      position: definition.position,
      ssr: definition.ssr,
    } as PendingNode);
  }

  const fieldErrorNodeDefinition = (
    directive as Partial<
      Record<typeof FIELD_ERROR_NODE_DIRECTIVE, unknown>
    >
  )[FIELD_ERROR_NODE_DIRECTIVE];
  if (fieldErrorNodeDefinition) {
    const definition = fieldErrorNodeDefinition as {
      readonly handlers: FieldExceptionHandlers;
      readonly options: FieldErrorNode['options'];
    };
    return withPipe({
      kind: 'field-error',
      source: node,
      handlers: definition.handlers,
      options: definition.options,
    } as FieldErrorNode);
  }

  if (node.kind === 'directive') {
    return withPipe({
      ...node,
      directives: [...node.directives, directive],
    });
  }

  return withPipe({
    kind: 'directive',
    node,
    directives: [directive],
  });
}

function applyCraftNodeDirective(
  node: CraftNode,
  directive: CraftNodeDirective<any>,
): CraftNode {
  if (node.kind === 'directive') {
    return withPipe({
      ...node,
      node: applyCraftNodeDirective(node.node, directive),
    });
  }

  if (node.kind !== 'element') return node;

  const definition = directive[CRAFT_NODE_DIRECTIVE];
  const props = { ...node.props } as Record<string, unknown>;
  const inputs = Object.fromEntries(
    definition.inputs
      .filter((name) => name in props)
      .map((name) => [name, props[name]]),
  );
  definition.inputs.forEach((name) => delete props[name]);

  return withPipe({
    ...node,
    props,
    [CRAFT_NODE_DIRECTIVES]: [
      ...(node[CRAFT_NODE_DIRECTIVES] ?? []),
      { directive, inputs },
    ],
  });
}

function resolveHostValue(value: unknown): unknown {
  return typeof value === 'function' ? value() : value;
}

function hasHostBinding(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === 'function') return true;
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return false;
  }
  seen.add(value);
  return Object.values(value).some((child) => hasHostBinding(child, seen));
}

function classTokens(value: unknown): string[] {
  const resolved = resolveHostValue(value);
  if (Array.isArray(resolved)) {
    return resolved.flatMap((item) => classTokens(item));
  }
  if (typeof resolved === 'object' && resolved !== null) {
    return Object.entries(resolved)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name);
  }
  return resolved == null || resolved === false
    ? []
    : String(resolved).split(/\s+/).filter(Boolean);
}

function mergeResolvedClasses(
  left: unknown,
  right: unknown,
): string | undefined {
  const classes = [...classTokens(left), ...classTokens(right)];
  return classes.length ? [...new Set(classes)].join(' ') : undefined;
}

function mergeClasses(left: unknown, right: unknown): unknown {
  return hasHostBinding(left) || hasHostBinding(right)
    ? () => mergeResolvedClasses(left, right)
    : mergeResolvedClasses(left, right);
}

function mergeResolvedStyles(left: unknown, right: unknown): unknown {
  const resolvedLeft = resolveHostValue(left);
  const resolvedRight = resolveHostValue(right);
  if (
    typeof resolvedLeft === 'object' &&
    resolvedLeft !== null &&
    typeof resolvedRight === 'object' &&
    resolvedRight !== null
  ) {
    return { ...resolvedLeft, ...resolvedRight };
  }
  if (resolvedRight === undefined || resolvedRight === null) {
    return resolvedLeft;
  }
  if (typeof resolvedLeft === 'string' && typeof resolvedRight === 'string') {
    return `${resolvedLeft.replace(/;?\s*$/, ';')}${resolvedRight}`;
  }
  return resolvedRight;
}

function mergeStyles(left: unknown, right: unknown): unknown {
  return hasHostBinding(left) || hasHostBinding(right)
    ? () => mergeResolvedStyles(left, right)
    : mergeResolvedStyles(left, right);
}

export function mergeHostProps(
  base: Readonly<Record<string, unknown>>,
  added: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const merged = { ...base, ...added };
  const classes = mergeClasses(base['class'], added['class']);
  if (classes === undefined) {
    delete merged['class'];
  } else {
    merged['class'] = classes;
  }
  if ('style' in base || 'style' in added) {
    merged['style'] = mergeStyles(base['style'], added['style']);
  }
  return merged;
}

function addHostPropsToNode(
  node: CraftNode,
  props: Readonly<Record<string, unknown>>,
  applied: { value: boolean },
): CraftNode {
  if (applied.value) {
    return node;
  }

  if (node.kind === 'element') {
    applied.value = true;
    return withPipe({
      ...node,
      props: mergeHostProps(node.props, props),
    });
  }

  if (node.kind === 'component') {
    applied.value = true;
    return {
      ...node,
      props: mergeHostProps(node.props, props),
    } as ComponentNode;
  }

  if (node.kind === 'directive') {
    return withPipe({
      ...node,
      node: addHostPropsToNode(node.node, props, applied),
    });
  }

  return node;
}

/** Adds host properties to the first host node produced by a template. */
export function applyHostPropsToChildren(
  children: CraftNodeChildren,
  props: Readonly<Record<string, unknown>> | undefined,
): CraftNodeChildren {
  if (!props || Object.keys(props).length === 0) {
    return children;
  }

  const applied = { value: false };
  const visit = (child: CraftNodeChild): CraftNodeChild => {
    if (Array.isArray(child)) {
      return child.map(visit);
    }
    return isCraftNode(child)
      ? addHostPropsToNode(child, props, applied)
      : child;
  };
  return visit(children);
}

export function normalizeChildren(children: CraftNodeChildren): CraftNode[] {
  const result: CraftNode[] = [];

  const visit = (child: CraftNodeChild): void => {
    if (Array.isArray(child)) {
      child.forEach(visit);
      return;
    }

    if (child === null || child === undefined || child === false) {
      return;
    }

    if (isCraftNode(child)) {
      result.push(child);
      return;
    }

    if (typeof child === 'function') {
      result.push({
        kind: 'reactive-text',
        binding: child,
      });
      return;
    }

    const resolved = child;
    if (resolved === null || resolved === undefined) {
      return;
    }

    result.push({
      kind: 'text',
      value: String(resolved),
    });
  };

  visit(children);
  return result;
}
