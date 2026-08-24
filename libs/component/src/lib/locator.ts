import type {
  CraftComponent,
  ComponentTemplateOf,
} from './types';
import { YIELDABLE_VALUE } from '@craft-ts/core';
import type {
  CraftDirectiveNode,
  ElementNodeBase,
  CraftNode,
  CraftNodeChild,
  CraftNodeChildren,
} from './render/vnode';

type IsAny<Value> = 0 extends 1 & Value ? true : false;

type LiteralString<Value> = Value extends string
  ? string extends Value
    ? never
    : Value
  : never;

type ClassTokens<Value> = [Value] extends [string]
  ? LiteralString<Value> extends infer Text extends string
    ? Text extends ''
      ? never
      : Text extends `${infer Head} ${infer Tail}`
        ? Head extends ''
          ? ClassTokens<Tail>
          : Head | ClassTokens<Tail>
        : Text
    : never
  : [Value] extends [readonly unknown[]]
    ? ClassTokens<Value[number]>
    : [Value] extends [Readonly<Record<string, boolean | null | undefined>>]
      ? string extends keyof Value
        ? never
        : Extract<keyof Value, string>
      : never;

type StaticAttributeValue<Value> = [Value] extends [string]
  ? string extends Value
    ? never
    : Value
  : [Value] extends [number]
    ? number extends Value
      ? never
      : Value
    : [Value] extends [boolean]
      ? boolean extends Value
        ? never
        : Value
      : never;

type StaticDirectAttributes<Props> = {
  [Key in keyof Props & string as Key extends `data-${string}` | `aria-${string}`
    ? StaticAttributeValue<Props[Key]> extends never
      ? never
      : Key
    : never]: StaticAttributeValue<Props[Key]>;
};

type StaticNestedAttributes<Props> = Props extends {
  readonly attrs?: infer Attributes;
}
  ? Attributes extends object
    ? {
        [Key in keyof Attributes & string as StaticAttributeValue<
          Attributes[Key]
        > extends never
          ? never
          : Key]: StaticAttributeValue<Attributes[Key]>;
      }
    : {}
  : {};

export type StaticLocatorCriteria<Props> = (Props extends {
  readonly class?: infer Class;
}
  ? [ClassTokens<Class>] extends [never]
    ? {}
    : { readonly class: ClassTokens<Class> }
  : {}) &
  StaticDirectAttributes<Props> &
  StaticNestedAttributes<Props>;

type LocatorCandidate<
  Tag extends keyof HTMLElementTagNameMap,
  Criteria extends object,
  Optional extends boolean,
  Repeated extends boolean,
> = {
  readonly tag: Tag;
  readonly criteria: Criteria;
  readonly optional: Optional;
  readonly repeated: Repeated;
};

type DirectContentNames<Value> = Value extends unknown
  ? Value extends { readonly [YIELDABLE_VALUE]: infer Name extends string }
    ? LiteralString<Name>
    : Value extends readonly (infer Item)[]
      ? DirectContentNames<Item>
      : never
  : never;

type ContentLocatorCandidates<
  Tag extends keyof HTMLElementTagNameMap,
  Props,
  Children,
  Optional extends boolean,
  Repeated extends boolean,
> = DirectContentNames<Children> extends infer Name extends string
  ? LocatorCandidate<
      Tag,
      StaticLocatorCriteria<Props> & { readonly content: Name },
      Optional,
      Repeated
    >
  : never;

type VisitContentNode<
  Node,
  Optional extends boolean,
  Repeated extends boolean,
  Seen extends readonly unknown[] = [],
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? never
  : IsAny<Node> extends true
    ? never
    : Node extends readonly (infer Child)[]
    ? VisitContentNode<Child, Optional, Repeated, Seen, [...Depth, unknown]>
    : Node extends ElementNodeBase<
          any,
          infer Tag extends keyof HTMLElementTagNameMap,
          infer Props,
          infer Children
        >
      ?
          | ContentLocatorCandidates<
              Tag,
              Props,
              Children,
              Optional,
              Repeated
            >
          | VisitContentNode<
              Children,
              Optional,
              Repeated,
              Seen,
              [...Depth, unknown]
            >
      : Node extends {
            readonly kind: 'component';
            readonly component: infer Component;
          }
        ? Component extends CraftComponent<any, any>
          ? Component extends Seen[number]
            ? never
            : VisitContentNode<
                ReturnType<ComponentTemplateOf<Component>>,
                Optional,
                Repeated,
                [...Seen, Component],
                [...Depth, unknown]
              >
          : never
        : Node extends CraftDirectiveNode<any>
          ? VisitContentNode<
              Node['node'],
              Optional,
              Repeated,
              Seen,
              [...Depth, unknown]
            >
          : Node extends {
                readonly kind: 'if';
                readonly whenTrue: () => infer TrueChildren;
                readonly whenFalse?: () => infer FalseChildren;
              }
            ? VisitContentNode<
                TrueChildren | FalseChildren,
                true,
                Repeated,
                Seen,
                [...Depth, unknown]
              >
            : Node extends {
                  readonly kind: 'each';
                  readonly itemTemplate: (...args: any[]) => infer ItemChildren;
                  readonly empty?: () => infer EmptyChildren;
                }
              ? VisitContentNode<
                  ItemChildren | EmptyChildren,
                  true,
                  true,
                  Seen,
                  [...Depth, unknown]
                >
              : Node extends {
                    readonly kind: 'defer';
                    readonly resolve: (...args: any[]) => infer Resolved;
                  }
                ? VisitContentNode<
                    Resolved,
                    true,
                    Repeated,
                    Seen,
                    [...Depth, unknown]
                  >
                : never;

type ContentLocatorCandidatesOfTemplate<Template> = VisitContentNode<
  Template extends (...args: any[]) => infer Output ? Output : never,
  false,
  false
>;

type ContentLocatorNames<Template, Tag> =
  ContentLocatorCandidatesOfTemplate<Template> extends infer Candidate
    ? Candidate extends LocatorCandidate<any, infer Criteria, any, any>
      ? Candidate['tag'] extends Tag
        ? Criteria extends { readonly content: infer Name extends string }
          ? Name
          : never
        : never
      : never
    : never;

export type LocatorContentNamesFor<
  Component extends CraftComponent<any, any>,
  Tag extends keyof HTMLElementTagNameMap,
> = ContentLocatorNames<ComponentTemplateOf<Component>, Tag>;

type VisitOptionalTag<
  Node,
  Tag extends keyof HTMLElementTagNameMap,
  Optional extends boolean = false,
  Seen extends readonly unknown[] = [],
  Depth extends readonly unknown[] = [],
> = Depth['length'] extends 8
  ? false
  : IsAny<Node> extends true
    ? false
    : Node extends readonly (infer Child)[]
      ? VisitOptionalTag<Child, Tag, Optional, Seen, [...Depth, unknown]>
      : Node extends ElementNodeBase<
            any,
            infer ActualTag extends keyof HTMLElementTagNameMap,
            any,
            infer Children
          >
        ? (ActualTag extends Tag ? Optional : false) |
            VisitOptionalTag<Children, Tag, Optional, Seen, [...Depth, unknown]>
        : Node extends {
              readonly kind: 'component';
              readonly component: infer Component;
            }
          ? Component extends CraftComponent<any, any>
            ? Component extends Seen[number]
              ? false
              : VisitOptionalTag<
                  ReturnType<ComponentTemplateOf<Component>>,
                  Tag,
                  Optional,
                  [...Seen, Component],
                  [...Depth, unknown]
                >
            : false
          : Node extends CraftDirectiveNode<any>
            ? VisitOptionalTag<
                Node['node'],
                Tag,
                Optional,
                Seen,
                [...Depth, unknown]
              >
            : Node extends {
                  readonly kind: 'if';
                  readonly whenTrue: () => infer TrueChildren;
                  readonly whenFalse?: () => infer FalseChildren;
                }
              ? VisitOptionalTag<
                  TrueChildren | FalseChildren,
                  Tag,
                  true,
                  Seen,
                  [...Depth, unknown]
                >
              : Node extends {
                    readonly kind: 'each';
                    readonly itemTemplate: (...args: any[]) => infer ItemChildren;
                    readonly empty?: () => infer EmptyChildren;
                  }
                ? VisitOptionalTag<
                    ItemChildren | EmptyChildren,
                    Tag,
                    true,
                    Seen,
                    [...Depth, unknown]
                  >
                : Node extends {
                      readonly kind: 'defer';
                      readonly resolve: (...args: any[]) => infer Resolved;
                    }
                  ? VisitOptionalTag<
                      Resolved,
                      Tag,
                      true,
                      Seen,
                      [...Depth, unknown]
                    >
                  : false;

type TemplateHasOptionalTag<Template, Tag extends keyof HTMLElementTagNameMap> =
  true extends VisitOptionalTag<
    Template extends (...args: any[]) => infer Output ? Output : never,
    Tag
  >
    ? true
    : false;

type NextDepth<Depth extends readonly unknown[]> = [...Depth, unknown];

type VisitChildren<
  Children,
  Depth extends readonly unknown[],
  Optional extends boolean,
  Repeated extends boolean,
  Seen extends readonly unknown[],
> = Children extends readonly (infer Child)[]
  ? VisitNode<Child, NextDepth<Depth>, Optional, Repeated, Seen>
  : VisitNode<Children, Depth, Optional, Repeated, Seen>;

type VisitComponent<
  Component,
  Depth extends readonly unknown[],
  Optional extends boolean,
  Repeated extends boolean,
  Seen extends readonly unknown[],
> = IsAny<Component> extends true
  ? never
  : Component extends CraftComponent<any, any>
    ? VisitChildren<
        ReturnType<ComponentTemplateOf<Component>>,
        NextDepth<Depth>,
        Optional,
        Repeated,
        Seen
      >
    : never;

type VisitNode<
  Node,
  Depth extends readonly unknown[],
  Optional extends boolean,
  Repeated extends boolean,
  Seen extends readonly unknown[],
> = Depth['length'] extends 2
  ? never
  : IsAny<Node> extends true
    ? never
    : Node extends ElementNodeBase<
        any,
        infer Tag extends keyof HTMLElementTagNameMap,
        infer Props,
        infer Children
      >
    ?
        | LocatorCandidate<
            Tag,
            StaticLocatorCriteria<Props>,
            Optional,
            Repeated
          >
        | VisitChildren<Children, NextDepth<Depth>, Optional, Repeated, Seen>
    : Node extends {
        readonly kind: 'component';
        readonly component: infer Component;
      }
      ? VisitComponent<Component, Depth, Optional, Repeated, Seen>
      : Node extends CraftDirectiveNode<any>
        ? VisitNode<Node['node'], NextDepth<Depth>, Optional, Repeated, Seen>
        : Node extends {
            readonly kind: 'if';
            readonly whenTrue: () => infer TrueChildren;
            readonly whenFalse?: () => infer FalseChildren;
          }
          ? VisitChildren<
              TrueChildren | FalseChildren,
              NextDepth<Depth>,
              true,
              Repeated,
              Seen
            >
          : Node extends {
              readonly kind: 'each';
              readonly itemTemplate: (...args: any[]) => infer ItemChildren;
              readonly empty?: () => infer EmptyChildren;
            }
            ? VisitChildren<
                ItemChildren | EmptyChildren,
                NextDepth<Depth>,
                true,
                true,
                Seen
              >
            : Node extends {
                readonly kind: 'defer';
                readonly resolve: (...args: any[]) => infer Resolved;
              }
              ? VisitChildren<
                  Resolved,
                  NextDepth<Depth>,
                  true,
                  Repeated,
                  Seen
                >
              : never;

export type TemplateLocatorCandidates<
  Component extends CraftComponent<any, any>,
> = VisitNode<
  ReturnType<ComponentTemplateOf<Component>>,
  [],
  false,
  false,
  []
>;

export type LocatorCriteriaFor<
  Component extends CraftComponent<any, any>,
  Tag extends keyof HTMLElementTagNameMap,
> = LocatorCriteria & {
  readonly content?: ContentLocatorNames<ComponentTemplateOf<Component>, Tag>;
};

type CriteriaMatches<Available, Wanted> = Wanted extends Partial<Available>
  ? true
  : false;

type MatchingCandidates<
  Candidates,
  Tag,
  Criteria,
> = Candidates extends LocatorCandidate<
  infer CandidateTag,
  infer Available,
  any,
  any
>
  ? CandidateTag extends Tag
    ? CriteriaMatches<Available, Criteria> extends true
      ? Candidates
      : never
    : never
  : never;

type IsUnion<Value, Whole = Value> = Value extends any
  ? [Whole] extends [Value]
    ? false
    : true
  : never;

type HasRepeated<Candidates> = Extract<
  Candidates,
  { readonly repeated: true }
> extends never
  ? false
  : true;

type HasMultiple<Candidates> = IsUnion<Candidates> extends true ? true : false;

type LocatorIsValid<Candidates> = [Candidates] extends [never]
  ? false
  : HasRepeated<Candidates> extends true
    ? false
    : HasMultiple<Candidates> extends true
      ? false
      : true;

type LocatorOptional<Candidates> = Extract<
  Candidates,
  { readonly optional: true }
> extends never
  ? false
  : true;

export type CraftLocatorResult<
  Tag extends keyof HTMLElementTagNameMap,
  Candidates,
> = MaybeDefined<
  HTMLElementTagNameMap[Tag],
  LocatorOptional<Candidates>
>;

export type MaybeDefined<Value, Optional extends boolean = true> = Optional extends true
  ? Value | undefined
  : Value;

export type LocatorCriteriaValidation<
  Component extends CraftComponent<any, any>,
  Tag extends keyof HTMLElementTagNameMap,
  Criteria,
> = MatchingCandidates<
  TemplateLocatorCandidates<Component> |
    ContentLocatorCandidatesOfTemplate<ComponentTemplateOf<Component>>,
  Tag,
  Criteria
> extends infer Candidates
  ? LocatorIsValid<Candidates> extends true
    ? unknown
    : {
        readonly 'locator must identify exactly one static element': never;
      }
  : never;

export type LocatorCriteria = {
  readonly class?: string;
  readonly [dataAttribute: `data-${string}`]: string | undefined;
  readonly [ariaAttribute: `aria-${string}`]: string | undefined;
};

type CraftTemplateLocatorApiForTemplate<
  Template,
> = {
  locator<
    const Tag extends keyof HTMLElementTagNameMap,
    const Criteria extends LocatorCriteria,
  >(
    tag: Tag,
    criteria: Criteria extends { readonly content: unknown } ? never : Criteria,
  ): MaybeDefined<
    HTMLElementTagNameMap[Tag],
    TemplateHasOptionalTag<Template, Tag>
  >;
  locator<
    const Tag extends keyof HTMLElementTagNameMap,
    const Content extends string,
  >(
    tag: Tag,
    criteria: LocatorCriteria &
      { readonly content: Content } &
      (Content extends ContentLocatorNames<Template, Tag>
        ? unknown
        : {
            readonly 'content brand is not rendered by this template': never;
          }),
  ): MaybeDefined<
    HTMLElementTagNameMap[Tag],
    TemplateHasOptionalTag<Template, Tag>
  >;
};

export type CraftTemplateLocatorApi<
  Component extends CraftComponent<any, any>,
> = CraftTemplateLocatorApiForTemplate<ComponentTemplateOf<Component>>;

export type RuntimeLocatorCriteria = Readonly<Record<string, unknown>>;

/** Runtime marker for branded values rendered directly as element children. */
export const CRAFT_LOCATOR_CONTENT_NAMES = Symbol(
  'craft-locator-content-names',
);

type LocatorContentMarkedElement = Element & {
  readonly [CRAFT_LOCATOR_CONTENT_NAMES]?: readonly string[];
};

export function directCraftContentNames(
  children: CraftNodeChildren,
): readonly string[] {
  const names = new Set<string>();
  const visit = (child: CraftNodeChild): void => {
    if (Array.isArray(child)) {
      child.forEach(visit);
      return;
    }
    if (
      (typeof child === 'function' ||
        (typeof child === 'object' && child !== null)) &&
      YIELDABLE_VALUE in child
    ) {
      const name = (child as { readonly [YIELDABLE_VALUE]?: unknown })[
        YIELDABLE_VALUE
      ];
      if (typeof name === 'string') names.add(name);
    }
  };
  visit(children);
  return [...names];
}

type RuntimeLocatorMatch = {
  readonly optional: boolean;
  readonly repeated: boolean;
};

function runtimeChildren(children: CraftNodeChildren): readonly CraftNode[] {
  const result: CraftNode[] = [];
  const visit = (child: CraftNodeChild): void => {
    if (Array.isArray(child)) {
      child.forEach(visit);
    } else if (
      child !== null &&
      child !== undefined &&
      typeof child === 'object' &&
      'kind' in child
    ) {
      result.push(child as CraftNode);
    }
  };
  visit(children);
  return result;
}

function runtimeClassTokens(value: unknown): readonly string[] {
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) return value.flatMap(runtimeClassTokens);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name);
  }
  return [];
}

function runtimeAttributeValue(
  props: Readonly<Record<string, unknown>>,
  key: string,
): unknown {
  if (key in props && key !== 'attrs') return props[key];
  const attrs = props['attrs'];
  return typeof attrs === 'object' && attrs !== null
    ? (attrs as Record<string, unknown>)[key]
    : undefined;
}

function runtimeCriteriaMatch(
  props: Readonly<Record<string, unknown>>,
  criteria: RuntimeLocatorCriteria,
  children?: CraftNodeChildren,
): boolean {
  return Object.entries(criteria).every(([key, expected]) => {
    if (key === 'class') {
      return runtimeClassTokens(props[key]).includes(String(expected));
    }
    if (key === 'content') {
      return directCraftContentNames(children ?? []).includes(String(expected));
    }
    const actual = runtimeAttributeValue(props, key);
    if (actual === null || actual === undefined || actual === false) {
      return false;
    }
    return (actual === true ? '' : String(actual)) === String(expected);
  });
}

function runtimeTemplateMatches(
  children: CraftNodeChildren,
  tag: string,
  criteria: RuntimeLocatorCriteria,
  optional = false,
  repeated = false,
  seen = new Set<unknown>(),
): RuntimeLocatorMatch[] {
  const matches: RuntimeLocatorMatch[] = [];
  for (const node of runtimeChildren(children)) {
    if (seen.has(node)) continue;
    seen.add(node);

    switch (node.kind) {
      case 'element':
        if (
          node.tag === tag &&
          runtimeCriteriaMatch(node.props, criteria, node.children)
        ) {
          matches.push({ optional, repeated });
        }
        matches.push(
          ...runtimeTemplateMatches(
            node.children,
            tag,
            criteria,
            optional,
            repeated,
            seen,
          ),
        );
        break;
      case 'component':
        // Child component DOM is searched by the caller. Its internal VNode
        // contract is available to the type-level walker, while a runtime
        // absence is handled conservatively by the DOM query below.
        break;
      case 'directive':
        matches.push(
          ...runtimeTemplateMatches(
            node.node as CraftNodeChildren,
            tag,
            criteria,
            optional,
            repeated,
            seen,
          ),
        );
        break;
      case 'if':
        matches.push(
          ...runtimeTemplateMatches(
            node.whenTrue(),
            tag,
            criteria,
            true,
            repeated,
            seen,
          ),
          ...(node.whenFalse
            ? runtimeTemplateMatches(
                node.whenFalse(),
                tag,
                criteria,
                true,
                repeated,
                seen,
              )
            : []),
        );
        break;
      case 'each':
        matches.push(
          ...runtimeTemplateMatches(
            node.itemTemplate(undefined as never, 0),
            tag,
            criteria,
            true,
            true,
            seen,
          ),
        );
        if (node.empty) {
          matches.push(
            ...runtimeTemplateMatches(
              node.empty(),
              tag,
              criteria,
              true,
              true,
              seen,
            ),
          );
        }
        break;
      case 'defer':
        if (node.placeholder) {
          matches.push(
            ...runtimeTemplateMatches(
              node.placeholder(),
              tag,
              criteria,
              true,
              repeated,
              seen,
            ),
          );
        }
        if (node.loading) {
          matches.push(
            ...runtimeTemplateMatches(
              node.loading(),
              tag,
              criteria,
              true,
              repeated,
              seen,
            ),
          );
        }
        if (node.error) {
          matches.push(
            ...runtimeTemplateMatches(
              node.error(undefined),
              tag,
              criteria,
              true,
              repeated,
              seen,
            ),
          );
        }
        break;
    }
  }
  return matches;
}

export function findCraftTemplateLocator(
  host: Element,
  template: CraftNodeChildren,
  tag: string,
  criteria: RuntimeLocatorCriteria,
): Element | undefined {
  const matches = Array.from(host.querySelectorAll(tag)).filter((element) => {
    if (criteria['content'] !== undefined) {
      const names = (element as LocatorContentMarkedElement)[
        CRAFT_LOCATOR_CONTENT_NAMES
      ];
      if (!names?.includes(String(criteria['content']))) return false;
    }
    if (criteria['class'] !== undefined) {
      if (!element.classList.contains(String(criteria['class']))) return false;
    }
    return Object.entries(criteria)
      .filter(([key]) => key !== 'class' && key !== 'content')
      .every(([key, expected]) => {
        const actual = element.getAttribute(key);
        return actual !== null && actual === (expected === true ? '' : String(expected));
      });
  });
  const runtimeMatches = runtimeTemplateMatches(template, tag, criteria);
  const optional = runtimeMatches.some((match) => match.optional);
  if (matches.length === 0) {
    if (optional) return undefined;
    throw new Error(
      `Craft locator "${tag}" found no matching element for ${JSON.stringify(criteria)}.`,
    );
  }
  if (matches.length !== 1) {
    throw new Error(
      `Craft locator "${tag}" expected exactly one matching element, found ${matches.length}.`,
    );
  }
  return matches[0];
}
