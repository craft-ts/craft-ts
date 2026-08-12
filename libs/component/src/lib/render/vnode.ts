import type { Injector, Type } from '@angular/core';
import type {
  AnyCraftException,
  CraftNodeDirective,
  CraftLazyLoadHelpers,
  CatchTagExhaustiveCodesCheck,
  CraftSettledCodesOf,
  CraftSettledSourcesOf,
  ExtractCraftGenExceptions,
  ExtractCraftPendingSources,
  FieldValidationCasesOf,
} from '@craft-ng/core';
import { CRAFT_NODE_DIRECTIVE, isCraftNodeDirective } from '@craft-ng/core';
import type {
  CraftComponent,
  CraftDirectiveTemplateDependencies,
  ComponentInitializationExceptionsOf,
  ComponentFieldExceptionsOf,
  CraftTemplate,
  ContentStylePolicy,
} from '../types';
import { isCraftDirective, type CraftDirective } from '../types';
import type { CssVarContract, EmptyCssVarContract } from '../css-vars.type';
import {
  CATCH_BLOCK_DIRECTIVE,
  type CatchBlockDirective,
  type CatchBlockHandlerChildren,
  type CatchBlockHandlers,
  type CatchBlockPosition,
} from '../block';
import {
  PENDING_BLOCK_DIRECTIVE,
  type PendingBlockDirective,
  type PendingBlockHandlers,
  type PendingBlockPosition,
  type PendingFallback,
  type PendingBlockExhaustiveCheck,
  type PendingBlockResidualSources,
} from '../pending-block';
import {
  FIELD_EXCEPTION_BLOCK_DIRECTIVE,
  type FieldExceptionBlockDirective,
  type FieldExceptionBlockExhaustiveCheck,
  type FieldExceptionBlockPartialCheck,
  type FieldExceptionBlockOptions,
  type FieldExceptionHandlerFieldExceptions,
  type FieldExceptionHandlerChildren,
  type FieldExceptionHandlers,
  type FieldValidationHandledIdentities,
  type FieldValidationHandledIdentitiesCarrier,
  type ResidualFieldValidationCases,
  type UnhandledFieldValidationCases,
} from '../field-exception-block';

export declare const CRAFT_NODE_DEPS: unique symbol;
export const CRAFT_NODE_CSS_VARS: unique symbol = Symbol('craft-node-css-vars');
export const CRAFT_NODE_DIRECTIVES = Symbol('craft-node-directives');
declare const CRAFT_NODE_EXCEPTIONS: unique symbol;
declare const CRAFT_NODE_HANDLED_EXCEPTIONS: unique symbol;
declare const CRAFT_NODE_PENDING: unique symbol;
declare const CRAFT_NODE_SETTLED_EXCEPTIONS: unique symbol;
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
 * from children to parents until a `pendingBlock` boundary clears them, and any
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
 * (`span(userName)` would demand a `catchBlock` inside `span`'s own children).
 * These bubble silently instead, are cleared by any ancestor `catchBlock`, and
 * are checked once at `craftComponent(...)`.
 */
export type CraftNodeSettledExceptionsCarrier<Codes extends string = string> = {
  readonly [CRAFT_NODE_SETTLED_EXCEPTIONS]?: Codes;
};

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
> = string extends CraftNodeChildrenExceptions<Children>
  ? Exceptions
  : CraftNodeChildrenExceptions<Children>;

/**
 * The async sources an element still needs a `pendingBlock` for: the ones read
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
    CraftNodeExceptionsCarrier<
      ElementNodeExceptions<Children, Exceptions>
    >,
    CraftNodeHandledExceptionsCarrier<HandledExceptions>,
    CraftNodePendingCarrier<
      ElementNodePendingSources<Props, Children, PendingSources>
    >,
    CraftNodeSettledExceptionsCarrier<
      ElementNodeSettledExceptions<Props, Children, SettledExceptions>
    >,
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
  readonly [CRAFT_NODE_EXCEPTIONS]: ElementNodeExceptions<
    Children,
    Exceptions
  >;
  readonly [CRAFT_NODE_FIELD_EXCEPTIONS]:
    | FieldExceptions
    | CraftNodeChildrenRawFieldExceptions<Children>;
  readonly pipe: CraftNodePipe<
    Dependencies,
    ElementNodeExceptions<Children, Exceptions>,
    FieldExceptions | CraftNodeChildrenRawFieldExceptions<Children>,
    ElementNodePendingSources<Props, Children, PendingSources>,
    ElementNodeSettledExceptions<Props, Children, SettledExceptions>
  >;
}

type PipedNode<
  Dependencies extends object,
  Exceptions extends string,
  FieldExceptions,
  Directive extends CraftDirective,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
> =
  Directive extends PendingBlockDirective<
    infer Handlers extends PendingBlockHandlers | undefined,
    infer FallbackChildren extends CraftNodeChildren
  >
    ? PendingBlockNode<
        Dependencies | CraftNodeChildrenDependencies<FallbackChildren>,
        Exceptions | CraftNodeChildrenExceptions<FallbackChildren>,
        FieldExceptions | CraftNodeChildrenRawFieldExceptions<FallbackChildren>,
        | PendingBlockResidualSources<PendingSources, Handlers>
        // A fallback that suspends in turn needs a boundary of its own.
        | CraftNodeChildrenPendingSources<FallbackChildren>,
        // A pending boundary is not an exception boundary: settled exceptions
        // pass straight through it.
        | SettledExceptions
        | CraftNodeChildrenSettledExceptions<FallbackChildren>
      >
    : PipedNodeWithoutPending<
        Dependencies,
        Exceptions,
        FieldExceptions,
        Directive,
        PendingSources,
        SettledExceptions
      >;

type PipedNodeWithoutPending<
  Dependencies extends object,
  Exceptions extends string,
  FieldExceptions,
  Directive extends CraftDirective,
  PendingSources extends string,
  SettledExceptions extends string,
> =
  Directive extends FieldExceptionBlockDirective<
    infer FieldHandlers extends FieldExceptionHandlers,
    boolean
  >
    ? FieldExceptionBlockNode<
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
          >
      >
    : Directive extends CatchBlockDirective<
          infer Handlers extends CatchBlockHandlers
        >
      ? CatchBlockNode<
          Dependencies | CraftDirectiveTemplateDependencies<Directive>,
          | Exclude<Exceptions, Extract<keyof Handlers, string>>
          | CraftNodeChildrenExceptions<
              CatchBlockHandlerChildren<Handlers[keyof Handlers]>
            >,
          Handlers,
          Directive[typeof CATCH_BLOCK_DIRECTIVE]['position'],
          FieldExceptions,
          | PendingSources
          | CraftNodeChildrenPendingSources<
              CatchBlockHandlerChildren<Handlers[keyof Handlers]>
            >,
          // The boundary clears the settled codes it handles, and inherits any
          // its own handlers reach.
          | Exclude<SettledExceptions, Extract<keyof Handlers, string>>
          | CraftNodeChildrenSettledExceptions<
              CatchBlockHandlerChildren<Handlers[keyof Handlers]>
            >
        >
      : CraftDirectiveNode<
          Dependencies | CraftDirectiveTemplateDependencies<Directive>,
          Exceptions,
          FieldExceptions,
          PendingSources,
          SettledExceptions
        >;

type PipedCraftNodeDirective<
  Dependencies extends object,
  Exceptions extends string,
  FieldExceptions,
  Directive extends CraftNodeDirective<any>,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
> = ElementNode<
  Dependencies,
  string,
  Readonly<Record<string, unknown>>,
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
> = {
  <Directive extends CraftDirective>(
    directive: Directive &
      (Directive extends PendingBlockDirective<
        infer PendingHandlers extends PendingBlockHandlers | undefined,
        CraftNodeChildren
      >
        ? PendingHandlers extends PendingBlockHandlers
          ? PendingBlockExhaustiveCheck<PendingSources, PendingHandlers>
          : unknown
        : Directive extends CatchBlockDirective<
              infer Handlers extends CatchBlockHandlers
            >
          ? CatchTagExhaustiveCodesCheck<
              Exceptions | SettledExceptions,
              Record<Extract<keyof Handlers, string>, unknown>
            >
          : Directive extends FieldExceptionBlockDirective<
                infer FieldHandlers extends FieldExceptionHandlers,
                infer Exhaustive extends boolean
              >
            ? Exhaustive extends true
              ? [UnhandledFieldValidationCases<FieldExceptions>] extends [never]
                ? unknown
                : FieldExceptionBlockExhaustiveCheck<
                    UnhandledFieldValidationCases<FieldExceptions>,
                    FieldHandlers
                  >
              : [UnhandledFieldValidationCases<FieldExceptions>] extends [never]
                ? unknown
                : FieldExceptionBlockPartialCheck<
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
    SettledExceptions
  >;
  (directive: AngularDirectiveNode): CraftNode;
  <Directive extends CraftNodeDirective<any>>(
    directive: Directive,
  ): PipedCraftNodeDirective<
    Dependencies,
    Exceptions,
    FieldExceptions,
    Directive,
    PendingSources,
    SettledExceptions
  >;
  (directive: Type<unknown>): CraftNode;
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
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<Exceptions>,
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
    SettledExceptions
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
> extends CraftNodeDepsCarrier<ComponentDeps & ContentDependencies>,
    CraftNodeCssVarsCarrier<CssVars>,
    CraftNodeExceptionsCarrier<
      ComponentInitializationExceptionsOf<Component> | InputExceptions
    >,
    CraftNodePendingCarrier<
      PendingSources | ContentPendingSourcesFromProps<Props>
    >,
    CraftNodeSettledExceptionsCarrier<
      SettledExceptions | ContentSettledExceptionsFromProps<Props>
    >,
    CraftNodeFieldExceptionsCarrier<
      | ComponentFieldExceptionsOf<Component>
      | ContentFieldExceptionsFromProps<Props>
    > {
  readonly kind: 'component';
  readonly component: Component;
  readonly props: Props;
  /** Optional route/feature injector used as this component's DI parent. */
  readonly injector?: Injector;
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
    SettledExceptions | ContentSettledExceptionsFromProps<Props>
  >;
}

export interface AngularDirectiveNode {
  readonly type: Type<unknown>;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly outputs?: Readonly<Record<string, (value: unknown) => unknown>>;
}

export interface AngularComponentNode {
  readonly kind: 'angular';
  readonly component: Type<unknown>;
  readonly injector?: Injector;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly outputs: Readonly<Record<string, (value: unknown) => unknown>>;
  readonly directives: readonly AngularDirectiveNode[];
}

export interface CatchBlockNode<
  Dependencies extends object = {},
  Exceptions extends string = string,
  Handlers extends CatchBlockHandlers = CatchBlockHandlers,
  Position extends CatchBlockPosition = CatchBlockPosition,
  FieldExceptions = unknown,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<Exceptions>,
    CraftNodeHandledExceptionsCarrier<Extract<keyof Handlers, string>>,
    CraftNodePendingCarrier<PendingSources>,
    CraftNodeSettledExceptionsCarrier<SettledExceptions>,
    CraftNodeFieldExceptionsCarrier<FieldExceptions> {
  readonly kind: 'catch-block';
  readonly source: CraftNode;
  readonly handlers: Handlers;
  readonly position: Position;
}

export interface FieldExceptionBlockNode<
  Dependencies extends object = {},
  Exceptions extends string = string,
  FieldExceptions = never,
  Handlers extends FieldExceptionHandlers = FieldExceptionHandlers,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<Exceptions>,
    CraftNodePendingCarrier<PendingSources>,
    CraftNodeSettledExceptionsCarrier<SettledExceptions>,
    CraftNodeFieldExceptionsCarrier<FieldExceptions> {
  readonly kind: 'field-exception-block';
  readonly [CRAFT_NODE_FIELD_EXCEPTIONS]: FieldExceptions;
  readonly source: CraftNodeChildren;
  readonly handlers: Handlers;
  readonly options: Required<
    Pick<FieldExceptionBlockOptions, 'mode' | 'position'>
  > &
    Pick<FieldExceptionBlockOptions, 'visibility'>;
  readonly pipe: CraftNodePipe<
    Dependencies,
    Exceptions,
    FieldExceptions,
    PendingSources,
    SettledExceptions
  >;
}

export interface MatchBlockNode<
  Dependencies extends object = {},
  Source extends () => object | undefined = () => object | undefined,
  Children extends CraftNodeChildren = CraftNodeChildren,
  HandledExceptions extends string = string,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeHandledExceptionsCarrier<HandledExceptions>,
    CraftNodePendingCarrier<CraftNodeChildrenPendingSources<Children>>,
    CraftNodeSettledExceptionsCarrier<
      CraftNodeChildrenSettledExceptions<Children>
    > {
  readonly kind: 'match-block';
  readonly source: Source;
  readonly key: PropertyKey;
  readonly handlers: Record<string, (exception: AnyCraftException) => Children>;
}

export interface EachNode<
  Item = unknown,
  Key = unknown,
  Dependencies extends object = {},
  SourceName extends string | undefined = string | undefined,
  ItemChildren extends CraftNodeChildren = CraftNodeChildren,
  EmptyChildren extends CraftNodeChildren = CraftNodeChildren,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeCssVarsCarrier<
      CraftNodeChildrenCssVars<ItemChildren | EmptyChildren>
    >,
    CraftNodePendingCarrier<
      | CraftNodeChildrenPendingSources<ItemChildren>
      | CraftNodeChildrenPendingSources<EmptyChildren>
    >,
    CraftNodeSettledExceptionsCarrier<
      | CraftNodeChildrenSettledExceptions<ItemChildren>
      | CraftNodeChildrenSettledExceptions<EmptyChildren>
    >,
    CraftNodeFieldExceptionsCarrier<
      | CraftNodeChildrenRawFieldExceptions<ItemChildren>
      | CraftNodeChildrenRawFieldExceptions<EmptyChildren>
    > {
  readonly kind: 'each';
  readonly source:
    | readonly Item[]
    | null
    | undefined
    | (() => readonly Item[] | null | undefined)
    | (() => Generator<unknown, readonly Item[] | null | undefined, unknown>);
  readonly sourceName?: SourceName;
  readonly track: (item: Item, index: number) => Key;
  readonly empty?: () => EmptyChildren;
  readonly itemTemplate: (item: Item, index: number) => ItemChildren;
}

export interface IfBlockNode<
  ConditionName extends string = string,
  Dependencies extends object = {},
  TrueChildren extends CraftNodeChildren = CraftNodeChildren,
  FalseChildren extends CraftNodeChildren = CraftNodeChildren,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeCssVarsCarrier<
      CraftNodeChildrenCssVars<TrueChildren | FalseChildren>
    >,
    CraftNodePendingCarrier<
      | CraftNodeChildrenPendingSources<TrueChildren>
      | CraftNodeChildrenPendingSources<FalseChildren>
    >,
    CraftNodeSettledExceptionsCarrier<
      | CraftNodeChildrenSettledExceptions<TrueChildren>
      | CraftNodeChildrenSettledExceptions<FalseChildren>
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

export type DeferTrigger = 'immediate' | 'idle' | 'viewport' | 'interaction';

export interface DeferNode<
  Loaded = unknown,
  Dependencies extends object = {},
  Children extends CraftNodeChildren = CraftNodeChildren,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeCssVarsCarrier<CraftNodeChildrenCssVars<Children>>,
    CraftNodePendingCarrier<CraftNodeChildrenPendingSources<Children>>,
    CraftNodeSettledExceptionsCarrier<
      CraftNodeChildrenSettledExceptions<Children>
    >,
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
export interface PendingBlockNode<
  Dependencies extends object = {},
  Exceptions extends string = string,
  FieldExceptions = unknown,
  PendingSources extends string = never,
  SettledExceptions extends string = never,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<Exceptions>,
    CraftNodePendingCarrier<PendingSources>,
    CraftNodeSettledExceptionsCarrier<SettledExceptions>,
    CraftNodeFieldExceptionsCarrier<FieldExceptions> {
  readonly [CRAFT_NODE_EXCEPTIONS]: Exceptions;
  readonly kind: 'pending-block';
  readonly source: CraftNode;
  readonly handlers: PendingBlockHandlers | undefined;
  readonly fallback: PendingFallback | undefined;
  readonly reloading: PendingFallback | undefined;
  readonly position: PendingBlockPosition;
  readonly pipe: CraftNodePipe<
    Dependencies,
    Exceptions,
    FieldExceptions,
    PendingSources,
    SettledExceptions
  >;
}

export type CraftNode =
  | ElementNodeBase<any>
  | TextNode
  | ReactiveTextNode
  | ComponentNode<any, any, any, any, any, any>
  | AngularComponentNode
  | CraftDirectiveNode<any>
  | EachNode<any, any, any, any, any, any>
  | IfBlockNode<any, any, any, any>
  | DeferNode<any, any, any>
  | CatchBlockNode<any, any>
  | PendingBlockNode<any, any, any, any>
  | FieldExceptionBlockNode<any, any, any>
  | MatchBlockNode<any, any>
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

export interface ProjectionNode<
  Dependencies extends object = {},
  Output extends CraftNodeChildren = CraftNodeChildren,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeCssVarsCarrier<CraftNodeChildrenCssVars<Output>>,
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
// `span(userName)` would demand a `catchBlock` inside `span`'s own children.
// They are routed at runtime instead (to the nearest `catchBlock`, else
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
            { readonly code: string }
          >['code']
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
          'catchTag.exhaustive or catchBlock.exhaustive is required before rendering component exceptions': CraftNodeChildrenExceptions<Children>;
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
          'fieldExceptionBlock.exhaustive is required before rendering component field exceptions': ComponentFieldExceptionsInChildren<Children>;
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
    value.kind === 'each' ||
    value.kind === 'if' ||
    value.kind === 'defer' ||
    value.kind === 'catch-block' ||
    value.kind === 'pending-block' ||
    value.kind === 'field-exception-block' ||
    value.kind === 'match-block' ||
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
        | AngularDirectiveNode
        | Type<unknown>,
    ) => pipeCraftNode(node as CraftNode, directive)) as CraftNodePipe,
  };
}

function isAngularDirectiveNode(value: unknown): value is AngularDirectiveNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type?: unknown }).type === 'function'
  );
}

type AngularDirectiveWithDefinition = Type<unknown> & {
  readonly ɵdir?: {
    readonly inputs?: Readonly<Record<string, unknown>>;
  };
};

function angularDirectiveInputNames(
  directive: Type<unknown>,
): readonly string[] {
  return Object.keys(
    (directive as AngularDirectiveWithDefinition).ɵdir?.inputs ?? {},
  );
}

function applyAngularDirective(
  node: ElementNode,
  directive: Type<unknown>,
): ElementNode {
  const inputNames = angularDirectiveInputNames(directive);
  const inputs = Object.fromEntries(
    inputNames
      .filter((name) => name in node.props)
      .map((name) => [name, node.props[name]]),
  );
  const props = { ...node.props };
  inputNames.forEach((name) => delete props[name]);
  const directives = Array.isArray(props['directives'])
    ? props['directives']
    : [];

  return appendAngularDirective(
    node,
    {
      type: directive,
      ...(Object.keys(inputs).length ? { inputs } : {}),
    },
    props,
  );
}

function appendAngularDirective(
  node: ElementNode,
  directive: AngularDirectiveNode,
  props: Readonly<Record<string, unknown>> = node.props,
): ElementNode {
  const directives = Array.isArray(props['directives'])
    ? props['directives']
    : [];

  return withPipe({
    ...node,
    props: {
      ...props,
      directives: [
        ...(directives as readonly AngularDirectiveNode[]),
        directive,
      ],
    },
  });
}

export function pipeCraftNode(
  node: CraftNode,
  directive:
    | CraftDirective
    | CraftNodeDirective<any>
    | AngularDirectiveNode
    | Type<unknown>,
): CraftNode {
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

    if (node.kind !== 'element') return node;
    return isAngularDirectiveNode(directive)
      ? appendAngularDirective(node as ElementNode, directive)
      : applyAngularDirective(node as ElementNode, directive as Type<unknown>);
  }

  const catchBlockDefinition = (
    directive as Partial<Record<typeof CATCH_BLOCK_DIRECTIVE, unknown>>
  )[CATCH_BLOCK_DIRECTIVE];
  if (catchBlockDefinition) {
    const definition = catchBlockDefinition as {
      readonly handlers: CatchBlockHandlers;
      readonly position: CatchBlockPosition;
    };
    return {
      kind: 'catch-block',
      source: node,
      handlers: definition.handlers,
      position: definition.position,
    } as CatchBlockNode;
  }

  const pendingBlockDefinition = (
    directive as Partial<Record<typeof PENDING_BLOCK_DIRECTIVE, unknown>>
  )[PENDING_BLOCK_DIRECTIVE];
  if (pendingBlockDefinition) {
    const definition = pendingBlockDefinition as {
      readonly handlers: PendingBlockHandlers | undefined;
      readonly fallback: PendingFallback | undefined;
      readonly reloading: PendingFallback | undefined;
      readonly position: PendingBlockPosition;
    };
    return withPipe({
      kind: 'pending-block',
      source: node,
      handlers: definition.handlers,
      fallback: definition.fallback,
      reloading: definition.reloading,
      position: definition.position,
    } as PendingBlockNode);
  }

  const fieldExceptionBlockDefinition = (
    directive as Partial<
      Record<typeof FIELD_EXCEPTION_BLOCK_DIRECTIVE, unknown>
    >
  )[FIELD_EXCEPTION_BLOCK_DIRECTIVE];
  if (fieldExceptionBlockDefinition) {
    const definition = fieldExceptionBlockDefinition as {
      readonly handlers: FieldExceptionHandlers;
      readonly options: FieldExceptionBlockNode['options'];
    };
    return withPipe({
      kind: 'field-exception-block',
      source: node,
      handlers: definition.handlers,
      options: definition.options,
    } as FieldExceptionBlockNode);
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
