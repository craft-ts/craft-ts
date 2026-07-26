import type { Injector, Type } from '@angular/core';
import type { CraftComponent } from '../types';

export type CraftTextValue = string | number | bigint | boolean;
export type CraftTextBinding = () => CraftTextValue | null | undefined;

export interface ElementNode {
  readonly kind: 'element';
  readonly tag: keyof HTMLElementTagNameMap | string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: CraftNodeChildren;
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

export type DeferTrigger =
  | 'immediate'
  | 'idle'
  | 'viewport'
  | 'interaction';

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
  | ElementNode
  | TextNode
  | ComponentNode<any>
  | AngularComponentNode
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
    value.kind === 'each' ||
    value.kind === 'defer'
  );
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
