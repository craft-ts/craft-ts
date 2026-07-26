import type {
  AngularDirectiveNode,
  CraftNodeChildren,
  ElementNode,
} from './render/vnode';
import { pipeCraftNode } from './render/vnode';

export type ClassValue =
  | string
  | (() => ClassValue | null | undefined | false)
  | readonly (ClassValue | null | undefined | false)[]
  | Readonly<Record<string, boolean | null | undefined>>;

export type StyleValue =
  | string
  | (() => StyleValue | null | undefined | false)
  | Readonly<Partial<Record<keyof CSSStyleDeclaration, string | number | null>>>
  | Readonly<Record<`--${string}`, string | number | null>>;

/** Properties that can be supplied to a component's host element. */
export type HostProps = ElementProps<'div'>;

type DomEvents = {
  [EventName in keyof GlobalEventHandlersEventMap]?: (
    event: GlobalEventHandlersEventMap[EventName],
  ) => unknown;
};

type OnDomEvents = {
  [EventName in keyof GlobalEventHandlersEventMap as `on${Capitalize<EventName>}`]?: (
    event: GlobalEventHandlersEventMap[EventName],
  ) => unknown;
};

type PrimitivePropertyKeys<Element> = {
  [Key in keyof Element]-?: Element[Key] extends
    | string
    | number
    | boolean
    | null
    | undefined
    ? Key
    : never;
}[keyof Element];

export type ElementProps<Tag extends keyof HTMLElementTagNameMap> = Partial<
  Pick<
    HTMLElementTagNameMap[Tag],
    PrimitivePropertyKeys<HTMLElementTagNameMap[Tag]>
  >
> &
  DomEvents &
  OnDomEvents & {
    readonly class?: ClassValue;
    readonly style?: StyleValue;
    readonly attrs?: Readonly<Record<string, string | number | boolean | null>>;
    readonly directives?: readonly AngularDirectiveNode[];
    readonly [property: string]: unknown;
    readonly [dataAttribute: `data-${string}`]: unknown;
    readonly [ariaAttribute: `aria-${string}`]: unknown;
  };

function looksLikeChildren(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    ('kind' in value && typeof (value as { kind?: unknown }).kind === 'string')
  );
}

export function h<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  propsOrChildren?: ElementProps<Tag> | CraftNodeChildren,
  maybeChildren?: CraftNodeChildren,
): ElementNode {
  const props = looksLikeChildren(propsOrChildren)
    ? {}
    : (propsOrChildren as ElementProps<Tag>);
  const children = looksLikeChildren(propsOrChildren)
    ? (propsOrChildren as CraftNodeChildren)
    : maybeChildren;

  const node = {
    kind: 'element',
    tag,
    props: props as Readonly<Record<string, unknown>>,
    children: children ?? [],
  } as ElementNode;

  Object.defineProperty(node, 'pipe', {
    value: (directive: unknown) => pipeCraftNode(node, directive as never),
    enumerable: false,
  });

  return node;
}

export interface TagHelper<Tag extends keyof HTMLElementTagNameMap> {
  (children?: CraftNodeChildren): ElementNode;
  (props: ElementProps<Tag> | null, children?: CraftNodeChildren): ElementNode;
}

function tagHelper<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
): TagHelper<Tag> {
  return ((
    propsOrChildren?: ElementProps<Tag> | CraftNodeChildren | null,
    children?: CraftNodeChildren,
  ) => h(tag, propsOrChildren, children)) as TagHelper<Tag>;
}

export const a = tagHelper('a');
export const article = tagHelper('article');
export const aside = tagHelper('aside');
export const button = tagHelper('button');
export const div = tagHelper('div');
export const footer = tagHelper('footer');
export const form = tagHelper('form');
export const h1 = tagHelper('h1');
export const h2 = tagHelper('h2');
export const h3 = tagHelper('h3');
export const header = tagHelper('header');
export const img = tagHelper('img');
export const input = tagHelper('input');
export const label = tagHelper('label');
export const li = tagHelper('li');
export const main = tagHelper('main');
export const nav = tagHelper('nav');
export const ol = tagHelper('ol');
export const option = tagHelper('option');
export const p = tagHelper('p');
export const section = tagHelper('section');
export const select = tagHelper('select');
export const small = tagHelper('small');
export const span = tagHelper('span');
export const strong = tagHelper('strong');
export const textarea = tagHelper('textarea');
export const ul = tagHelper('ul');
