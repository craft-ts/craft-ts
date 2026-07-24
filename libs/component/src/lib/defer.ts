import type {
  CraftComponent,
  PropsOf,
} from './types';
import type {
  CraftNodeChildren,
  DeferNode,
  DeferTrigger,
} from './render/vnode';

export interface DeferOptions<Loaded> {
  readonly trigger?: DeferTrigger;
  readonly resolve?: (loaded: Loaded) => CraftNodeChildren;
  readonly placeholder?: () => CraftNodeChildren;
  readonly loading?: () => CraftNodeChildren;
  readonly error?: (error: unknown) => CraftNodeChildren;
}

export function defer<Loaded>(
  loader: () => Promise<Loaded>,
  options: DeferOptions<Loaded> & {
    readonly resolve: (loaded: Loaded) => CraftNodeChildren;
  },
): DeferNode<Loaded>;
export function defer<Component extends CraftComponent<any>>(
  loader: () => Promise<Component>,
  options?: Omit<DeferOptions<Component>, 'resolve'> & {
    readonly props?: PropsOf<Component>;
  },
): DeferNode<Component>;
export function defer<Loaded>(
  loader: () => Promise<Loaded>,
  options: (DeferOptions<Loaded> & { readonly props?: object }) = {},
): DeferNode<Loaded> {
  const resolve =
    options.resolve ??
    ((loaded: Loaded) => {
      if (typeof loaded !== 'function') {
        return loaded as CraftNodeChildren;
      }

      return (
        loaded as unknown as (props?: object) => CraftNodeChildren
      )(options.props);
    });

  return {
    kind: 'defer',
    loader,
    resolve,
    trigger: options.trigger ?? 'idle',
    placeholder: options.placeholder,
    loading: options.loading,
    error: options.error,
  };
}
