import type {
  CraftNodeChildrenDependencies,
  CraftNodeChildrenCssVars,
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

type ElementEventHandler<E extends Event> = (
  event: E,
) => unknown | Generator<any, any, any>;

type TypedDomEvent<
  El extends EventTarget,
  EventName extends keyof GlobalEventHandlersEventMap,
> = GlobalEventHandlersEventMap[EventName] & {
  readonly target: El;
  readonly currentTarget: El;
};

interface CommonDomEventMethods<El extends EventTarget> {
  input?(
    event: TypedDomEvent<El, 'input'>,
  ): unknown | Generator<any, any, any>;
  change?(
    event: TypedDomEvent<El, 'change'>,
  ): unknown | Generator<any, any, any>;
  keydown?(
    event: TypedDomEvent<El, 'keydown'>,
  ): unknown | Generator<any, any, any>;
  keyup?(event: TypedDomEvent<El, 'keyup'>): unknown | Generator<any, any, any>;
  keypress?(
    event: TypedDomEvent<El, 'keypress'>,
  ): unknown | Generator<any, any, any>;
  click?(
    event: TypedDomEvent<El, 'click'>,
  ): unknown | Generator<any, any, any>;
  submit?(
    event: TypedDomEvent<El, 'submit'>,
  ): unknown | Generator<any, any, any>;
  blur?(event: TypedDomEvent<El, 'blur'>): unknown | Generator<any, any, any>;
  focus?(event: TypedDomEvent<El, 'focus'>): unknown | Generator<any, any, any>;
}

type DomEvents<El extends EventTarget> = CommonDomEventMethods<El> & {
  [EventName in Exclude<
    keyof GlobalEventHandlersEventMap,
    keyof CommonDomEventMethods<El>
  >]?: ElementEventHandler<TypedDomEvent<El, EventName>>;
};

type OnDomEvents<El extends EventTarget> = {
  [EventName in keyof GlobalEventHandlersEventMap as `on${Capitalize<EventName>}`]?: ElementEventHandler<
    TypedDomEvent<El, EventName>
  >;
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

type HostElementOf<Tag extends keyof HTMLElementTagNameMap> =
  HTMLElementTagNameMap[Tag];

type ElementPropsContext<
  Tag extends keyof HTMLElementTagNameMap,
  El extends EventTarget = HostElementOf<Tag>,
> = DomEvents<El> &
  OnDomEvents<El> & {
    readonly class?: ClassValue;
    readonly style?: StyleValue;
    readonly attrs?: Readonly<Record<string, string | number | boolean | null>>;
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
  _Tag extends keyof HTMLElementTagNameMap,
  PropsOrChildren,
  MaybeChildren,
> = (
  PropsOrChildren extends CraftNodeChildren ? PropsOrChildren : MaybeChildren
) extends infer Children extends CraftNodeChildren
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
  string,
  CraftNodeChildrenHandledExceptionCodes<
    HChildren<Tag, PropsOrChildren, MaybeChildren>
  >,
  never,
  CraftNodeChildrenCssVars<HChildren<Tag, PropsOrChildren, MaybeChildren>>
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
    string,
    CraftNodeChildrenHandledExceptionCodes<
      HChildren<Tag, PropsOrChildren, MaybeChildren>
    >,
    never,
    CraftNodeChildrenCssVars<HChildren<Tag, PropsOrChildren, MaybeChildren>>
  >;

  Object.defineProperty(node, 'pipe', {
    value: (directive: unknown) =>
      pipeCraftNode(node as unknown as ElementNode, directive as never),
    enumerable: false,
  });

  return node;
}

/** Creates a typed Craft node for a custom element or Web Component tag. */
export function customElement(
  tag: string,
  propsOrChildren?: Record<string, unknown> | CraftNodeChildren | null,
  maybeChildren?: CraftNodeChildren,
): ElementNode {
  return h(
    tag as keyof HTMLElementTagNameMap,
    propsOrChildren as never,
    maybeChildren as never,
  ) as unknown as ElementNode;
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
  CraftNodeChildrenHandledExceptionCodes<Children>,
  never,
  CraftNodeChildrenCssVars<Children>
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
    CraftNodeChildrenHandledExceptionCodes<Children>,
    never,
    CraftNodeChildrenCssVars<Children>
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
    Record<never, never>,
    Children,
    string | undefined,
    string,
    CraftNodeChildrenHandledExceptionCodes<Children>,
    never,
    CraftNodeChildrenCssVars<Children>
  >;
  <
    const Props extends ElementPropsContext<Tag>,
    const Children extends CraftNodeChildren = CraftNodeChildren,
  >(
    props: Props | null,
    children?: Children &
      CraftNodeChildren &
      RequireCaughtComponentExceptions<NoInfer<Children>>,
  ): ElementNode<
    CraftNodeChildrenDependencies<Children>,
    Tag,
    NoInfer<Props>,
    Children,
    string | undefined,
    string,
    CraftNodeChildrenHandledExceptionCodes<Children>,
    never,
    CraftNodeChildrenCssVars<Children>
  >;
  <const Name extends string, const Props extends ElementPropsContext<Tag>>(
    name: Name,
    props: Props | null,
  ): ElementNode<
    CraftNodeChildrenDependencies<readonly []>,
    Tag,
    NoInfer<Props>,
    readonly [],
    Name,
    string,
    CraftNodeChildrenHandledExceptionCodes<readonly []>,
    never,
    CraftNodeChildrenCssVars<readonly []>
  >;
  <
    const Name extends string,
    const Props extends ElementPropsContext<Tag>,
    const Children extends CraftNodeChildren,
  >(
    name: Name,
    props: Props | null,
    children: Children &
      CraftNodeChildren &
      RequireCaughtComponentExceptions<NoInfer<Children>>,
  ): ElementNode<
    CraftNodeChildrenDependencies<Children>,
    Tag,
    NoInfer<Props>,
    Children,
    Name,
    string,
    CraftNodeChildrenHandledExceptionCodes<Children>,
    never,
    CraftNodeChildrenCssVars<Children>
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
  }) as unknown as TagHelper<Tag>;
}

type TextInputTypes =
  | 'text'
  | 'search'
  | 'email'
  | 'password'
  | 'tel'
  | 'url'
  | 'color'
  | 'hidden'
  | 'submit'
  | 'button'
  | 'reset'
  | 'image';

type NumericInputTypes = 'number' | 'range';
type TemporalInputTypes = 'date' | 'time' | 'datetime-local' | 'month' | 'week';

type RestrictedInputElement<
  Type extends string,
  Omitted extends keyof HTMLInputElement,
  Extra extends object = {},
> = Omit<HTMLInputElement, Omitted | 'type'> & {
  type: Type;
} & Extra;

type TextInputElement = RestrictedInputElement<
  TextInputTypes,
  'checked' | 'files' | 'indeterminate'
>;
type CheckboxInputElement = RestrictedInputElement<
  'checkbox',
  'files' | 'valueAsNumber' | 'valueAsDate'
>;
type RadioInputElement = RestrictedInputElement<
  'radio',
  'files' | 'valueAsNumber' | 'valueAsDate' | 'indeterminate'
>;
type FileInputElement = RestrictedInputElement<
  'file',
  'checked' | 'indeterminate' | 'valueAsNumber' | 'valueAsDate',
  { files: FileList }
>;
type NumericInputElement = RestrictedInputElement<
  NumericInputTypes,
  'checked' | 'files' | 'indeterminate' | 'valueAsDate'
>;
type TemporalInputElement = RestrictedInputElement<
  TemporalInputTypes,
  'checked' | 'files' | 'indeterminate'
>;

type InputElementForType<Type> = Type extends 'checkbox'
  ? CheckboxInputElement
  : Type extends 'radio'
    ? RadioInputElement
    : Type extends 'file'
      ? FileInputElement
      : Type extends NumericInputTypes
        ? NumericInputElement
        : Type extends TemporalInputTypes
          ? TemporalInputElement
          : Type extends TextInputTypes
            ? TextInputElement
            : HTMLInputElement;

type LoosePrimitiveProps<El> = {
  [K in PrimitivePropertyKeys<El>]?:
    | El[K]
    | (() => El[K])
    | YieldableRenderCallback<El[K]>
    | object;
};

type InputTypeArg =
  | string
  | (() => string)
  | YieldableRenderCallback<string>;

type InputCallProps<T extends InputTypeArg> = Omit<
  LoosePrimitiveProps<InputElementForType<T>>,
  'type'
> &
  ElementPropsContext<'input', InputElementForType<T>> & {
    readonly type?: T;
  };

type InputNode<
  Props extends object,
  Children extends CraftNodeChildren,
  Name extends string | undefined = string | undefined,
> = ElementNode<
  CraftNodeChildrenDependencies<Children>,
  'input',
  Props,
  Children,
  Name,
  string,
  CraftNodeChildrenHandledExceptionCodes<Children>,
  never,
  CraftNodeChildrenCssVars<Children>
>;

export interface InputTagHelper {
  <
    const T extends InputTypeArg = 'text',
    const Name extends string | undefined = undefined,
  >(
    first?: InputCallProps<T> | Name | CraftNodeChildren | null,
    second?: Name extends string
      ? InputCallProps<T> | null
      : CraftNodeChildren,
    third?: CraftNodeChildren,
  ): InputNode<
    InputCallProps<T>,
    Name extends string ? readonly [] : CraftNodeChildren,
    Name
  >;
}

type AltValue =
  | string
  | (() => string)
  | YieldableRenderCallback<string>;

type WithRequiredAlt<Tag extends 'img' | 'area', Props extends object> = Props &
  ElementPropsContext<Tag> & {
    readonly alt: AltValue;
  };

/**
 * `img` / `area` must declare `alt` at the type level — including `''` for
 * decorative images. There is no children-only overload: a missing `alt` is a
 * compile error, not an ESLint opt-out.
 */
export interface RequiredAltTagHelper<Tag extends 'img' | 'area'> {
  <
    const Props extends object,
    const Children extends CraftNodeChildren = CraftNodeChildren,
  >(
    props: WithRequiredAlt<Tag, Props>,
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
    CraftNodeChildrenHandledExceptionCodes<Children>,
    never,
    CraftNodeChildrenCssVars<Children>
  >;
  <const Name extends string, const Props extends object>(
    name: Name,
    props: WithRequiredAlt<Tag, Props>,
  ): ElementNode<
    CraftNodeChildrenDependencies<readonly []>,
    Tag,
    Props,
    readonly [],
    Name,
    string,
    CraftNodeChildrenHandledExceptionCodes<readonly []>,
    never,
    CraftNodeChildrenCssVars<readonly []>
  >;
  <
    const Name extends string,
    const Props extends object,
    const Children extends CraftNodeChildren,
  >(
    name: Name,
    props: WithRequiredAlt<Tag, Props>,
    children: Children &
      CraftNodeChildren &
      RequireCaughtComponentExceptions<NoInfer<Children>>,
  ): ElementNode<
    CraftNodeChildrenDependencies<Children>,
    Tag,
    Props,
    Children,
    Name,
    string,
    CraftNodeChildrenHandledExceptionCodes<Children>,
    never,
    CraftNodeChildrenCssVars<Children>
  >;
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
export const h4 = tagHelper('h4');
export const h5 = tagHelper('h5');
export const h6 = tagHelper('h6');
export const header = tagHelper('header');
export const img = tagHelper('img') as RequiredAltTagHelper<'img'>;
export const input = tagHelper('input') as unknown as InputTagHelper;
export const label = tagHelper('label');
export const li = tagHelper('li');
export const main = tagHelper('main');
export const nav = tagHelper('nav');
export const ol = tagHelper('ol');
export const option = tagHelper('option');
export const p = tagHelper('p');
export const pre = tagHelper('pre');
export const section = tagHelper('section');
export const select = tagHelper('select');
export const small = tagHelper('small');
export const span = tagHelper('span');
export const strong = tagHelper('strong');
export const textarea = tagHelper('textarea');
export const ul = tagHelper('ul');
export const dialog = tagHelper('dialog');
export const fieldset = tagHelper('fieldset');
export const legend = tagHelper('legend');
export const table = tagHelper('table');
export const thead = tagHelper('thead');
export const tbody = tagHelper('tbody');
export const tr = tagHelper('tr');
export const th = tagHelper('th');
export const td = tagHelper('td');
export const caption = tagHelper('caption');
export const figure = tagHelper('figure');
export const figcaption = tagHelper('figcaption');
export const iframe = tagHelper('iframe');
export const area = tagHelper('area') as RequiredAltTagHelper<'area'>;
/** SVG is not an HTMLElement; the helper still produces a typed Craft element node. */
export const svg = tagHelper('svg' as keyof HTMLElementTagNameMap);
