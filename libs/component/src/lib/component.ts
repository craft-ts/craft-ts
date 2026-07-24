import type { ResolveGeneratorResult } from '@craft-ng/core';
import {
  CRAFT_COMPONENT,
  type ComponentFactory,
  type ComponentMeta,
  type CraftComponent,
  type PropsFromContext,
} from './types';
import type { ComponentNode, CraftNodeChildren } from './render/vnode';

type FactoryContext<Factory extends ComponentFactory> = Awaited<
  ResolveGeneratorResult<ReturnType<Factory>>
>;

export function component<Factory extends ComponentFactory>(
  meta: ComponentMeta,
  factory: Factory,
  template: (context: FactoryContext<Factory>) => CraftNodeChildren,
): CraftComponent<PropsFromContext<FactoryContext<Factory>>> {
  type Props = PropsFromContext<FactoryContext<Factory>>;

  const definition = {
    meta,
    factory,
    template,
  };

  const craftComponent = ((props: Props = {} as Props): ComponentNode<Props> => ({
    kind: 'component',
    component: craftComponent,
    props,
  })) as CraftComponent<Props>;

  Object.defineProperty(craftComponent, CRAFT_COMPONENT, {
    value: definition,
    enumerable: false,
  });

  return craftComponent;
}
