import type {
  AngularDirectiveNode,
  CraftNodeChildrenDependencies,
  CraftNodeChildrenHandledExceptionCodes,
  CraftNodeChildren,
  ElementNode,
  RequireCaughtComponentExceptions,
} from './render/vnode';
import type { Yieldable } from '@craft-ng/core';
import { pipeCraftNode } from './render/vnode';

type ClassValueResult =
  | string
  | null
  | undefined
  | false
  | readonly ClassValueResult[]
  | Readonly<Record<string, boolean | null | undefined>>;

/** Properties that can be supplied to a component's host element. */
export type HostProps = ElementProps<'div'>;

export type YieldableRenderCallback<Value> = Yieldable<[], Value, unknown>;

export type ClassValue =
  | ClassValueResult
  | (() => ClassValueResult)
  | YieldableRenderCallback<ClassValueResult>;

type StyleValueResult =
  | string
  | false
  | null
  | undefined
  | Readonly<Partial<Record<keyof CSSStyleDeclaration, string | number | null>>>
  | Readonly<Record<`--${string}`, string | number | null>>;

export type StyleValue =
  | StyleValueResult
  | (() => StyleValueResult)
  | YieldableRenderCallback<StyleValueResult>;

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

type PrimitiveElementProps<Element> = {
  [Key in PrimitivePropertyKeys<Element>]?:
    | Element[Key]
    | (() => Element[Key])
    | YieldableRenderCallback<Element[Key]>;
};

type ElementPropsContext<Tag extends keyof HTMLElementTagNameMap> = DomEvents &
  OnDomEvents & {
    readonly class?: ClassValue;
    readonly style?: StyleValue;
    readonly attrs?: Readonly<Record<string, string | number | boolean | null>>;
    readonly directives?: readonly AngularDirectiveNode[];
    readonly [dataAttribute: `data-${string}`]: unknown;
    readonly [ariaAttribute: `aria-${string}`]: unknown;
  };

export type ElementProps<Tag extends keyof HTMLElementTagNameMap> =
  PrimitiveElementProps<HTMLElementTagNameMap[Tag]> &
    ElementPropsContext<Tag> & {
      readonly [property: string]: unknown;
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

type HChildren<
  Tag extends keyof HTMLElementTagNameMap,
  PropsOrChildren,
  MaybeChildren,
> = (PropsOrChildren extends CraftNodeChildren
  ? PropsOrChildren
  : MaybeChildren) extends infer Children extends CraftNodeChildren
  ? Children
  : never;

type HProps<PropsOrChildren> = PropsOrChildren extends object
  ? PropsOrChildren extends CraftNodeChildren
    ? Readonly<Record<never, never>>
    : PropsOrChildren
  : Readonly<Record<never, never>>;

export function h<
  Tag extends keyof HTMLElementTagNameMap,
  const PropsOrChildren extends
    | ElementPropsContext<Tag>
    | CraftNodeChildren = CraftNodeChildren,
  const MaybeChildren extends CraftNodeChildren = CraftNodeChildren,
>(
  tag: Tag,
  propsOrChildren?: PropsOrChildren,
  maybeChildren?: MaybeChildren,
): ElementNode<
  CraftNodeChildrenDependencies<HChildren<Tag, PropsOrChildren, MaybeChildren>>,
  Tag,
  HProps<PropsOrChildren>,
  HChildren<Tag, PropsOrChildren, MaybeChildren>,
  undefined,
  CraftNodeChildrenHandledExceptionCodes<
    HChildren<Tag, PropsOrChildren, MaybeChildren>
  >
> {
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
  } as ElementNode<
    CraftNodeChildrenDependencies<
      HChildren<Tag, PropsOrChildren, MaybeChildren>
    >,
    Tag,
    HProps<PropsOrChildren>,
    HChildren<Tag, PropsOrChildren, MaybeChildren>,
    undefined,
    CraftNodeChildrenHandledExceptionCodes<
      HChildren<Tag, PropsOrChildren, MaybeChildren>
    >
  >;

  Object.defineProperty(node, 'pipe', {
    value: (directive: unknown) =>
      pipeCraftNode(node as unknown as ElementNode, directive as never),
    enumerable: false,
  });

  return node;
}

function hNamed<
  Tag extends keyof HTMLElementTagNameMap,
  const Name extends string,
  const Props extends object,
  const Children extends CraftNodeChildren,
>(
  tag: Tag,
  name: Name,
  props: Props | null,
  children?: Children,
): ElementNode<
  CraftNodeChildrenDependencies<Children>,
  Tag,
  Props,
  Children,
  Name,
  string,
  CraftNodeChildrenHandledExceptionCodes<Children>
> {
  const node = h<Tag, Props & ElementPropsContext<Tag>, Children>(
    tag,
    props as Props & ElementPropsContext<Tag>,
    children,
  ) as unknown as ElementNode<
    CraftNodeChildrenDependencies<Children>,
    Tag,
    Props,
    Children,
    Name,
    string,
    CraftNodeChildrenHandledExceptionCodes<Children>
  >;
  (node as { localName?: Name }).localName = name;
  return node;
}

export interface TagHelper<Tag extends keyof HTMLElementTagNameMap> {
  <const Children extends CraftNodeChildren = CraftNodeChildren>(
    children?: Children &
      CraftNodeChildren &
      RequireCaughtComponentExceptions<NoInfer<Children>>,
  ): ElementNode<
    CraftNodeChildrenDependencies<Children>,
    Tag,
    {},
    Children,
    string | undefined,
    string,
    CraftNodeChildrenHandledExceptionCodes<Children>
  >;
  <
    const Props extends object,
    const Children extends CraftNodeChildren = CraftNodeChildren,
  >(
    props: (Props & ElementPropsContext<Tag>) | null,
    children?: Children &
      CraftNodeChildren &
      RequireCaughtComponentExceptions<NoInfer<Children>>,
  ): ElementNode<
    CraftNodeChildrenDependencies<Children>,
    Tag,
    Props,
    Children,
    string | undefined,
    string,
    CraftNodeChildrenHandledExceptionCodes<Children>
  >;
  <
    const Name extends string,
    const Props extends object,
    const Children extends CraftNodeChildren = CraftNodeChildren,
  >(
    name: Name,
    props: (Props & ElementPropsContext<Tag>) | null,
    children?: Children &
      CraftNodeChildren &
      RequireCaughtComponentExceptions<NoInfer<Children>>,
  ): ElementNode<
    CraftNodeChildrenDependencies<Children>,
    Tag,
    Props,
    Children,
    Name,
    string,
    CraftNodeChildrenHandledExceptionCodes<Children>
  >;
}

function tagHelper<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
): TagHelper<Tag> {
  return ((
    first?: string | ElementPropsContext<Tag> | CraftNodeChildren | null,
    second?: ElementPropsContext<Tag> | CraftNodeChildren | null,
    third?: CraftNodeChildren,
  ) => {
    if (
      typeof first === 'string' &&
      (second === null ||
        (typeof second === 'object' &&
          !Array.isArray(second) &&
          !('kind' in second)))
    ) {
      return hNamed(tag, first, second, third);
    }

    return h<Tag, never, never>(tag, first as never, second as never);
  }) as TagHelper<Tag>;
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
