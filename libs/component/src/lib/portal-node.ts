import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  PortalNode,
  PortalTarget,
} from './render/vnode';
import { currentCraftRenderContext } from './render/vnode';

/**
 * Renders children in another element, owned by the declaring template.
 * Use 'body' for a browser/SSR-safe overlay root, an element, or a lazy target.
 */
export function portalNode<Output extends CraftNodeChildren>(
  target: PortalTarget,
  children: Output | (() => Output),
): PortalNode<CraftNodeChildrenDependencies<Output>, Output> {
  return {
    kind: 'portal',
    target,
    render:
      typeof children === 'function'
        ? (children as () => Output)
        : () => children,
    declarationContext: currentCraftRenderContext(),
  };
}

export type { PortalNode, PortalTarget } from './render/vnode';
