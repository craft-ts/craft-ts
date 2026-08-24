import type { Yieldable } from '@craft-ts/core';
import { a, span } from './hyperscript';
import {
  pipeCraftNode,
  type CraftNodeChildren,
  type CraftNodeChildrenDependencies,
  type ElementNode,
  type HeadingNode,
  type HeadingSectionNode,
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
 * Renders a heading whose rank comes from the current outline (`h1`–`h6`).
 * The title does not pick `h2` vs `h3` — the parent outline does.
 *
 * A local `heading()` is allowed in this template (route page title = `h1`).
 * A child component that renders `heading()` must be wrapped by **this**
 * parent in {@link headingSection} (same DNA as `pendingNode`). Otherwise
 * the call does not compile:
 * `ERROR_child_heading_rendered_outside_a_headingSection`.
 *
 * Prefer this over `h1()`…`h6()` inside a `craftComponent`.
 *
 * @example
 * heading('Liste des tâches');
 * headingSection([
 *   heading('Détail'),
 *   TaskCard(), // child's heading() becomes hN+1
 * ]);
 *
 * @see headingSection
 * @see headingRoot
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
  const node = {
    kind: 'heading' as const,
    props,
    children: children ?? [],
  };
  Object.defineProperty(node, 'pipe', {
    value: (directive: unknown) =>
      pipeCraftNode(node as never, directive as never),
    enumerable: false,
  });
  return node as HeadingNode<any, any, HeadingProps, 'heading'>;
}

/**
 * Increments the heading outline by one rank for the subtree.
 *
 * Not a visual box and not a `<section>`: comment-bounded fragment, no extra
 * DOM node (same as `ifNode`). Nested {@link heading} calls become
 * `hN+1`. Also absorbs a child's heading need so the parent compiles.
 *
 * Nest to build the document outline: page `heading()` → `h1`, first
 * `headingSection` → `h2`, nested `headingSection` → `h3`, clamped at `h6`.
 *
 * @example
 * heading('Page');
 * headingSection([
 *   heading('Section'),
 *   headingSection([heading('Subsection')]),
 * ]);
 *
 * @see heading
 * @see headingRoot
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
 * Starts the heading outline at level 1 for the subtree. Absorbs children's
 * heading need. Use for a route page, or a nested root (a `<dialog>` already
 * resets via the native element — its title is `h1` **inside** the dialog).
 *
 * Unlike {@link headingSection}, this does not increment: every {@link heading}
 * below is `h1` again.
 *
 * @see heading
 * @see headingSection
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
type LiveRegionProps = {
  readonly politeness?: 'polite' | 'assertive';
  readonly label?: string;
};

export function liveRegion<const Children extends CraftNodeChildren>(
  children?: Children,
): ElementNode<
  CraftNodeChildrenDependencies<Children>,
  'span',
  { readonly 'aria-live': 'polite'; readonly 'aria-atomic': 'true'; readonly role: 'status' },
  Children
>;
export function liveRegion<const Children extends CraftNodeChildren>(
  props: LiveRegionProps | null,
  children?: Children,
): ElementNode<
  CraftNodeChildrenDependencies<Children>,
  'span',
  object,
  Children
>;
export function liveRegion(
  propsOrChildren?:
    | LiveRegionProps
    | CraftNodeChildren
    | null,
  maybeChildren?: CraftNodeChildren,
): unknown {
  const props = looksLikeChildren(propsOrChildren)
    ? { politeness: 'polite' as const }
    : ((propsOrChildren ?? {}) as LiveRegionProps);
  const children = looksLikeChildren(propsOrChildren)
    ? (propsOrChildren as CraftNodeChildren)
    : maybeChildren;
  const politeness = props.politeness ?? 'polite';
  const label = props.label;
  return span(
    {
      'aria-live': politeness,
      'aria-atomic': 'true',
      ...(label !== undefined
        ? { role: 'region' as const, 'aria-label': label }
        : { role: politeness === 'assertive' ? 'alert' : 'status' }),
    },
    children,
  );
}
