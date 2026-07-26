import type { Injector, Type } from '@angular/core';
import type { CraftComponent } from '../types';
import { isCraftDirective, type CraftDirective } from '../types';

export type CraftTextValue = string | number | bigint | boolean;
export type CraftTextBinding = () => CraftTextValue | null | undefined;

export interface ElementNodeBase {
  readonly kind: 'element';
  readonly tag: keyof HTMLElementTagNameMap | string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: CraftNodeChildren;
}

export interface ElementNode extends ElementNodeBase {
  readonly pipe: CraftNodePipe;
}

export type CraftNodePipe = {
  <Directive extends CraftDirective>(directive: Directive): CraftDirectiveNode;
  (directive: Type<unknown>): CraftNode;
};

export interface CraftDirectiveNode {
  readonly kind: 'directive';
  readonly node: CraftNode;
  readonly directives: readonly CraftDirective[];
  readonly pipe: CraftNodePipe;
}

export interface TextNode {
  readonly kind: 'text';
  readonly value: string;
}

export interface ComponentNode<Props extends object = object> {
  readonly kind: 'component';
  readonly component: CraftComponent<Props>;
  readonly props: Props;
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

export interface EachNode<Item = unknown, Key = unknown> {
  readonly kind: 'each';
  readonly source: readonly Item[] | (() => readonly Item[]);
  readonly track: (item: Item, index: number) => Key;
  readonly empty?: () => CraftNodeChildren;
  readonly itemTemplate: (item: Item, index: number) => CraftNodeChildren;
}

export type DeferTrigger = 'immediate' | 'idle' | 'viewport' | 'interaction';

export interface DeferNode<Loaded = unknown> {
  readonly kind: 'defer';
  readonly loader: () => Promise<Loaded>;
  readonly resolve: (loaded: Loaded) => CraftNodeChildren;
  readonly trigger: DeferTrigger;
  readonly placeholder?: () => CraftNodeChildren;
  readonly loading?: () => CraftNodeChildren;
  readonly error?: (error: unknown) => CraftNodeChildren;
}

export type CraftNode =
  | ElementNodeBase
  | TextNode
  | ComponentNode<any>
  | AngularComponentNode
  | CraftDirectiveNode
  | EachNode<any, any>
  | DeferNode<any>;

export type CraftNodeChild =
  | CraftNode
  | CraftTextValue
  | CraftTextBinding
  | null
  | undefined
  | readonly CraftNodeChild[];

export type CraftNodeChildren = CraftNodeChild | readonly CraftNodeChild[];

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
    value.kind === 'defer'
  );
}

function withPipe(node: ElementNodeBase): ElementNode;
function withPipe(node: Omit<CraftDirectiveNode, 'pipe'>): CraftDirectiveNode;
function withPipe(
  node: Omit<ElementNode, 'pipe'> | Omit<CraftDirectiveNode, 'pipe'>,
): ElementNode | CraftDirectiveNode {
  return {
    ...node,
    pipe: ((directive: CraftDirective | Type<unknown>) =>
      pipeCraftNode(
        node as ElementNode | CraftDirectiveNode,
        directive,
      )) as CraftNodePipe,
  } as ElementNode | CraftDirectiveNode;
}

export function pipeCraftNode(
  node: ElementNode | CraftDirectiveNode,
  directive: CraftDirective | Type<unknown>,
): CraftNode {
  if (!isCraftDirective(directive)) {
    if (node.kind === 'directive') {
      return withPipe({
        ...node,
        node: pipeCraftNode(node.node as ElementNode, directive),
      });
    }

    const directives = Array.isArray(node.props['directives'])
      ? node.props['directives']
      : [];
    return withPipe({
      ...node,
      props: {
        ...node.props,
        directives: [
          ...(directives as readonly AngularDirectiveNode[]),
          { type: directive },
        ],
      },
    });
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

function mergeClasses(left: unknown, right: unknown): string | undefined {
  const classes = [...classTokens(left), ...classTokens(right)];
  return classes.length ? [...new Set(classes)].join(' ') : undefined;
}

function mergeStyles(left: unknown, right: unknown): unknown {
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

    const resolved = typeof child === 'function' ? child() : child;
    if (resolved === null || resolved === undefined || resolved === false) {
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
