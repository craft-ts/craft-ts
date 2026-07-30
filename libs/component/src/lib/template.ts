import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  TemplateNode,
} from './render/vnode';
import { CRAFT_TEMPLATE, type CraftTemplate } from './types';
import { currentCraftRenderContext } from './render/vnode';

/** Creates an inert, reusable and context-checked Craft template fragment. */
export function craftTemplate<
  Context,
  Output extends CraftNodeChildren = CraftNodeChildren,
>(renderer: (context: Context) => Output): CraftTemplate<Context, Output> {
  const template = ((context: Context) => renderer(context)) as CraftTemplate<
    Context,
    Output
  >;
  Object.defineProperty(template, CRAFT_TEMPLATE, {
    value: true,
    enumerable: false,
  });
  return template;
}

/** Schedules a typed template for rendering without evaluating it eagerly. */
export function renderTemplate<Context, Output extends CraftNodeChildren>(
  template: CraftTemplate<Context, Output>,
  context: Context,
): TemplateNode<Context, Output, CraftNodeChildrenDependencies<Output>> {
  return {
    kind: 'template',
    template,
    context,
    declarationContext: currentCraftRenderContext(),
  };
}
