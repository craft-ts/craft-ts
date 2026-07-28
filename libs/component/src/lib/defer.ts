import type { CraftComponent, PropsOf } from './types';
import type {
  ComponentDepsOf,
  CraftLazyLoadHelpers,
} from '@craft-ng/core';
import type {
  CraftNodeChildrenDependencies,
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

export type DeferLoader<Loaded> = (
  helpers: CraftLazyLoadHelpers,
) => Promise<Loaded>;

type CallbackDependencies<Callback> = Callback extends (
  ...args: any[]
) => infer Output
  ? CraftNodeChildrenDependencies<Output>
  : {};

type DeferOptionsDependencies<Options> = Options extends object
  ?
      | CallbackDependencies<
          Options extends { resolve?: infer Resolve } ? Resolve : never
        >
      | CallbackDependencies<
          Options extends { placeholder?: infer Placeholder }
            ? Placeholder
            : never
        >
      | CallbackDependencies<
          Options extends { loading?: infer Loading } ? Loading : never
        >
      | CallbackDependencies<
          Options extends { error?: infer Error } ? Error : never
        >
  : {};

export function defer<
  Loaded,
  Options extends DeferOptions<Loaded> & {
    readonly resolve: (loaded: Loaded) => CraftNodeChildren;
  },
>(
  loader: DeferLoader<Loaded>,
  options: Options,
): DeferNode<Loaded, DeferOptionsDependencies<Options>>;
export function defer<
  Component extends CraftComponent<any>,
  Options extends Omit<DeferOptions<Component>, 'resolve'> & {
    readonly props?: PropsOf<Component>;
  } = Omit<DeferOptions<Component>, 'resolve'> & {
    readonly props?: PropsOf<Component>;
  },
>(
  loader: DeferLoader<Component>,
  options?: Options,
): DeferNode<
  Component,
  ComponentDepsOf<Component> | DeferOptionsDependencies<Options>
>;
export function defer<Loaded>(
  loader: DeferLoader<Loaded>,
  options: DeferOptions<Loaded> & { readonly props?: object } = {},
): DeferNode<Loaded> {
  const resolve =
    options.resolve ??
    ((loaded: Loaded) => {
      if (typeof loaded !== 'function') {
        return loaded as CraftNodeChildren;
      }

      return (loaded as unknown as (props?: object) => CraftNodeChildren)(
        options.props,
      );
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
