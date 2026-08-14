import type { Yieldable } from '@craft-ng/core';
import { a, span } from './hyperscript';
import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  ElementNode,
  HeadingNode,
  HeadingSectionNode,
} from './render/vnode';

type HeadingProps = {
  readonly class?: unknown;
  readonly style?: unknown;
  readonly id?: string | (() => string) | Yieldable<[], string, unknown>;
  readonly [attribute: string]: unknown;
};

function looksLikeChildren(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    ('kind' in (value as object) &&
      typeof (value as { kind?: unknown }).kind === 'string')
  );
}

/**
 * A heading whose rank comes from the current outline (`h1`–`h6`).
 * Marks the component as an outline consumer — a parent must wrap the call
 * in `headingSection` (or be the route that starts the outline at level 1).
 */
export function heading<const Children extends CraftNodeChildren>(
  children?: Children,
): HeadingNode<CraftNodeChildrenDependencies<Children>, Children, HeadingProps, 'heading'>;
export function heading<const Children extends CraftNodeChildren>(
  props: HeadingProps | null,
  children?: Children,
): HeadingNode<
  CraftNodeChildrenDependencies<Children>,
  Children,
  HeadingProps,
  'heading'
>;
export function heading(
  propsOrChildren?: HeadingProps | CraftNodeChildren | null,
  maybeChildren?: CraftNodeChildren,
): HeadingNode<any, any, HeadingProps, 'heading'> {
  const props = looksLikeChildren(propsOrChildren)
    ? {}
    : ((propsOrChildren ?? {}) as HeadingProps);
  const children = looksLikeChildren(propsOrChildren)
    ? (propsOrChildren as CraftNodeChildren)
    : maybeChildren;
  return {
    kind: 'heading',
    props,
    children: children ?? [],
  };
}

/**
 * Increments the heading outline for the subtree. Comment-bounded fragment —
 * no extra DOM node, same as `ifBlock`.
 */
export function headingSection<const Children extends CraftNodeChildren>(
  children?: Children,
): HeadingSectionNode<CraftNodeChildrenDependencies<Children>, Children> {
  return {
    kind: 'heading-section',
    children: (children ?? []) as Children,
  };
}

/**
 * Starts the heading outline at level 1 for the subtree (route page, dialog
 * body already resets via `<dialog>`). Absorbs children's heading need.
 */
export function headingRoot<const Children extends CraftNodeChildren>(
  children?: Children,
): HeadingSectionNode<CraftNodeChildrenDependencies<Children>, Children> {
  return {
    kind: 'heading-section',
    reset: true,
    children: (children ?? []) as Children,
  };
}

/**
 * Skip link for the application shell. Pair with `main({ id: targetId }, …)`.
 */
export function skipLink(
  targetId = 'main',
  label = 'Skip to main content',
) {
  return a({ href: `#${targetId}`, class: 'skip-link' }, label);
}

/**
 * Announces dynamic text to assistive technology (toasts, "Copied").
 */
export function liveRegion<const Children extends CraftNodeChildren>(
  children?: Children,
): ElementNode<
  CraftNodeChildrenDependencies<Children>,
  'span',
  { readonly 'aria-live': 'polite'; readonly 'aria-atomic': 'true'; readonly role: 'status' },
  Children
>;
export function liveRegion<const Children extends CraftNodeChildren>(
  props: { readonly politeness?: 'polite' | 'assertive' } | null,
  children?: Children,
): ElementNode<
  CraftNodeChildrenDependencies<Children>,
  'span',
  object,
  Children
>;
export function liveRegion(
  propsOrChildren?:
    | { readonly politeness?: 'polite' | 'assertive' }
    | CraftNodeChildren
    | null,
  maybeChildren?: CraftNodeChildren,
): unknown {
  const props = looksLikeChildren(propsOrChildren)
    ? { politeness: 'polite' as const }
    : ((propsOrChildren ?? {}) as { readonly politeness?: 'polite' | 'assertive' });
  const children = looksLikeChildren(propsOrChildren)
    ? (propsOrChildren as CraftNodeChildren)
    : maybeChildren;
  const politeness = props.politeness ?? 'polite';
  return span(
    {
      'aria-live': politeness,
      'aria-atomic': 'true',
      role: politeness === 'assertive' ? 'alert' : 'status',
    },
    children,
  );
}
