import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  ProjectionNode,
} from './render/vnode';
import { currentCraftRenderContext } from './render/vnode';
import {
  CRAFT_TEMPLATE,
  type CraftFragment,
  type CraftTemplate,
} from './types';
import { renderTemplate } from './template';

type FragmentOutput<Fragment> = Fragment extends (
  ...args: any[]
) => infer Output
  ? Output
  : never;

function isCraftTemplate(value: unknown): value is CraftTemplate<unknown> {
  return (
    typeof value === 'function' &&
    (value as Partial<Record<typeof CRAFT_TEMPLATE, unknown>>)[
      CRAFT_TEMPLATE
    ] === true
  );
}

/** Brands a slot renderer while keeping it inert until `project` is called. */
export function craftSlot<Output extends CraftNodeChildren>(
  renderer: () => Output,
): CraftFragment<Output> {
  return renderer as CraftFragment<Output>;
}

/** Projects a fragment using the context in which the caller declared it. */
export function project<Fragment extends CraftFragment>(
  fragment: Fragment,
): ProjectionNode<CraftNodeChildrenDependencies<FragmentOutput<Fragment>>>;
/** Projects a parameterized template with an explicit, checked context. */
export function project<Context, Output extends CraftNodeChildren>(
  template: CraftTemplate<Context, Output>,
  context: Context,
): ProjectionNode<CraftNodeChildrenDependencies<Output>>;
export function project(
  fragmentOrTemplate: CraftFragment | CraftTemplate<unknown>,
  context?: unknown,
): ProjectionNode {
  const currentContext = currentCraftRenderContext() as
    | { readonly declarationContext?: unknown }
    | undefined;
  const fragment = isCraftTemplate(fragmentOrTemplate)
    ? () => [renderTemplate(fragmentOrTemplate, context)]
    : fragmentOrTemplate;
  return {
    kind: 'projection',
    fragment: fragment as CraftFragment,
    declarationContext:
      currentContext?.declarationContext ?? currentCraftRenderContext(),
  };
}
