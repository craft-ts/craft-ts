import type { Injector, Type } from '@angular/core';
import type {
  AnyCraftException,
  CraftLazyLoadHelpers,
  CatchTagExhaustiveCodesCheck,
} from '@craft-ng/core';
import type {
  CraftComponent,
  CraftDirectiveTemplateDependencies,
  ComponentInitializationExceptionsOf,
  CraftTemplate,
  ContentStylePolicy,
} from '../types';
import { isCraftDirective, type CraftDirective } from '../types';
import {
  CATCH_BLOCK_DIRECTIVE,
  type CatchBlockDirective,
  type CatchBlockHandlerChildren,
  type CatchBlockHandlers,
  type CatchBlockPosition,
} from '../block';

export declare const CRAFT_NODE_DEPS: unique symbol;
declare const CRAFT_NODE_EXCEPTIONS: unique symbol;
declare const CRAFT_NODE_HANDLED_EXCEPTIONS: unique symbol;

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

type IsAny<Value> = 0 extends 1 & Value ? true : false;

export type CraftNodeExceptionsCarrier<Exceptions extends string = string> = {
  readonly [CRAFT_NODE_EXCEPTIONS]?: Exceptions;
};

export type CraftNodeHandledExceptionsCarrier<Codes extends string = string> = {
  readonly [CRAFT_NODE_HANDLED_EXCEPTIONS]?: Codes;
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

export type CraftTextValue = string | number | bigint | boolean;
export type CraftTextBinding = () => CraftTextValue | null | undefined;

export interface ElementNodeBase<
  Dependencies extends object = {},
  Tag extends string = string,
  Props extends object = Readonly<Record<string, unknown>>,
  Children extends CraftNodeChildren = CraftNodeChildren,
  LocalName extends string | undefined = string | undefined,
  Exceptions extends string = string,
  HandledExceptions extends string = string,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<
      string extends CraftNodeChildrenExceptions<Children>
        ? Exceptions
        : CraftNodeChildrenExceptions<Children>
    >,
    CraftNodeHandledExceptionsCarrier<HandledExceptions> {
  readonly kind: 'element';
  readonly tag: Tag;
  readonly localName?: LocalName;
  readonly props: Props;
  readonly children: Children;
}

export interface ElementNode<
  Dependencies extends object = {},
  Tag extends string = string,
  Props extends object = Readonly<Record<string, unknown>>,
  Children extends CraftNodeChildren = CraftNodeChildren,
  LocalName extends string | undefined = string | undefined,
  Exceptions extends string = string,
  HandledExceptions extends string = string,
> extends ElementNodeBase<
    Dependencies,
    Tag,
    Props,
    Children,
    LocalName,
    Exceptions,
    HandledExceptions
  > {
  readonly [CRAFT_NODE_EXCEPTIONS]: CraftNodeChildrenExceptions<Children>;
  readonly pipe: CraftNodePipe<
    Dependencies,
    CraftNodeChildrenExceptions<Children>
  >;
}

type PipedNode<
  Dependencies extends object,
  Exceptions extends string,
  Directive extends CraftDirective,
> =
  Directive extends CatchBlockDirective<
    infer Handlers extends CatchBlockHandlers
  >
    ? CatchBlockNode<
        Dependencies | CraftDirectiveTemplateDependencies<Directive>,
        | Exclude<Exceptions, Extract<keyof Handlers, string>>
        | CraftNodeChildrenExceptions<
            CatchBlockHandlerChildren<Handlers[keyof Handlers]>
          >,
        Handlers,
        Directive[typeof CATCH_BLOCK_DIRECTIVE]['position']
      >
    : CraftDirectiveNode<
        Dependencies | CraftDirectiveTemplateDependencies<Directive>,
        Exceptions
      >;

export type CraftNodePipe<
  Dependencies extends object = {},
  Exceptions extends string = string,
> = {
  <Directive extends CraftDirective>(
    directive: Directive &
      (Directive extends CatchBlockDirective<
        infer Handlers extends CatchBlockHandlers
      >
        ? CatchTagExhaustiveCodesCheck<
            Exceptions,
            Record<Extract<keyof Handlers, string>, unknown>
          >
        : unknown),
  ): PipedNode<Dependencies, Exceptions, Directive>;
  (directive: AngularDirectiveNode): CraftNode;
  (directive: Type<unknown>): CraftNode;
};

export interface CraftDirectiveNode<
  Dependencies extends object = {},
  Exceptions extends string = string,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<Exceptions> {
  readonly [CRAFT_NODE_EXCEPTIONS]: Exceptions;
  readonly kind: 'directive';
  readonly node: CraftNode;
  readonly directives: readonly CraftDirective[];
  readonly pipe: CraftNodePipe<Dependencies, Exceptions>;
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
> extends CraftNodeDepsCarrier<ComponentDeps & ContentDependencies>,
    CraftNodeExceptionsCarrier<
      ComponentInitializationExceptionsOf<Component> | InputExceptions
    > {
  readonly kind: 'component';
  readonly component: Component;
  readonly props: Props;
  readonly declarationContext?: unknown;
  readonly [CRAFT_NODE_EXCEPTIONS]:
    | ComponentInitializationExceptionsOf<Component>
    | InputExceptions;
  readonly pipe: CraftNodePipe<
    ComponentDeps & ContentDependencies,
    ComponentInitializationExceptionsOf<Component> | InputExceptions
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
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeExceptionsCarrier<Exceptions>,
    CraftNodeHandledExceptionsCarrier<Extract<keyof Handlers, string>> {
  readonly kind: 'catch-block';
  readonly source: CraftNode;
  readonly handlers: Handlers;
  readonly position: Position;
}

export interface MatchBlockNode<
  Dependencies extends object = {},
  Source extends () => object | undefined = () => object | undefined,
  Children extends CraftNodeChildren = CraftNodeChildren,
  HandledExceptions extends string = string,
> extends CraftNodeDepsCarrier<Dependencies>,
    CraftNodeHandledExceptionsCarrier<HandledExceptions> {
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
> extends CraftNodeDepsCarrier<Dependencies> {
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
> extends CraftNodeDepsCarrier<Dependencies> {
  readonly kind: 'if';
  readonly condition: () => boolean;
  readonly conditionName: ConditionName;
  readonly whenTrue: () => TrueChildren;
  readonly whenFalse?: () => FalseChildren;
}

export type DeferTrigger = 'immediate' | 'idle' | 'viewport' | 'interaction';

export interface DeferNode<Loaded = unknown, Dependencies extends object = {}>
  extends CraftNodeDepsCarrier<Dependencies> {
  readonly kind: 'defer';
  readonly loader: (helpers: CraftLazyLoadHelpers) => Promise<Loaded>;
  readonly resolve: (loaded: Loaded) => CraftNodeChildren;
  readonly trigger: DeferTrigger;
  readonly placeholder?: () => CraftNodeChildren;
  readonly loading?: () => CraftNodeChildren;
  readonly error?: (error: unknown) => CraftNodeChildren;
}

export type CraftNode =
  | ElementNodeBase<any>
  | TextNode
  | ReactiveTextNode
  | ComponentNode<any, any>
  | AngularComponentNode
  | CraftDirectiveNode<any>
  | EachNode<any, any>
  | IfBlockNode<any, any>
  | DeferNode<any>
  | CatchBlockNode<any, any>
  | MatchBlockNode<any, any>
  | ProjectionNode<any>
  | TemplateNode<any, any, any>;

export type CraftNodeChild =
  | CraftNode
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

export interface ProjectionNode<Dependencies extends object = {}>
  extends CraftNodeDepsCarrier<Dependencies> {
  readonly kind: 'projection';
  readonly render: () => CraftNodeChildren;
  readonly slotName?: string;
  readonly stylePolicy: ContentStylePolicy;
  readonly declarationContext?: unknown;
}

export interface TemplateNode<
  Context = unknown,
  Output extends CraftNodeChildren = CraftNodeChildren,
  Dependencies extends object = CraftNodeChildrenDependencies<Output>,
> extends CraftNodeDepsCarrier<Dependencies> {
  readonly kind: 'template';
  readonly template: CraftTemplate<Context, Output>;
  readonly context: Context;
  readonly declarationContext?: unknown;
}

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
export type RequireCaughtComponentExceptions<
  Children extends CraftNodeChildren,
> =
  IsAny<CraftNodeChildrenExceptions<Children>> extends true
    ? unknown
    : [CraftNodeChildrenExceptions<Children>] extends [never]
      ? unknown
      : {
          'catchTag.exhaustive or catchBlock.exhaustive is required before rendering component exceptions': CraftNodeChildrenExceptions<Children>;
        };

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
    value.kind === 'match-block' ||
    value.kind === 'projection' ||
    value.kind === 'template'
  );
}

function withPipe(node: any): any {
  return {
    ...node,
    pipe: ((directive: CraftDirective | AngularDirectiveNode | Type<unknown>) =>
      pipeCraftNode(node as CraftNode, directive)) as CraftNodePipe,
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
  directive: CraftDirective | AngularDirectiveNode | Type<unknown>,
): CraftNode {
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
      : applyAngularDirective(node as ElementNode, directive);
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
