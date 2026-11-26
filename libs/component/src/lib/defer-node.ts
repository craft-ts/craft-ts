import type { CraftComponent, PropsOf } from './types';
import type { ComponentDepsOf, CraftLazyLoadHelpers } from '@craft-ts/core';
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

/** The names of a loaded module's exports that are Craft components. */
export type DeferComponentExportNames<Module> = {
  [Name in keyof Module]: Module[Name] extends CraftComponent<any>
    ? Name
    : never;
}[keyof Module] &
  string;

/** What `pick` accepts besides the export name; `props` is required when the component has inputs. */
export type DeferPickOptions<Component> = Omit<
  DeferOptions<Component>,
  'resolve'
> &
  (keyof PropsOf<Component> extends never
    ? { readonly props?: PropsOf<Component> }
    : { readonly props: PropsOf<Component> });

/**
 * What `deferNode(loader)` returns when the loader resolves to a module rather
 * than to a component: name the component export with `pick`.
 *
 * It is not a node; rendering it without `pick` is a type error.
 */
export interface DeferModulePicker<Module> {
  /**
   * The deferred node rendering the `name` export of the loaded module.
   *
   * `name` must be an export that is a Craft component, and `props` must match
   * its inputs. The component's dependency contract reaches the parent's DI
   * proof exactly as if the component were rendered directly.
   */
  pick<
    const Name extends DeferComponentExportNames<Module>,
    const Options extends DeferPickOptions<Module[Name]>,
  >(
    name: Name,
    ...options: keyof PropsOf<Module[Name]> extends never
      ? [options?: Options]
      : [options: Options]
  ): DeferNode<
    Module[Name],
    ComponentDepsOf<Module[Name]> | DeferOptionsDependencies<Options>
  >;
}

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

/**
 * Renders a lazily loaded branch.
 *
 * To load a component from a module, return the module and name the export
 * with `pick`:
 *
 *   deferNode(({ withRetry }) => withRetry(import('./lazy-message'))).pick(
 *     'lazyMessage',
 *     { trigger: 'interaction', placeholder: () => p('…') },
 *   )
 *
 * Do not select the export inside the loader (`.then((module) => module.X)`):
 * written in a template, that callback is checked after the call around it
 * has fixed its types, the loaded component falls back to a component with no
 * contract, and the parent's DI proof cannot see the services it needs.
 */
export function deferNode<
  Loaded,
  Options extends DeferOptions<Loaded> & {
    readonly resolve: (loaded: Loaded) => CraftNodeChildren;
  },
>(
  loader: DeferLoader<Loaded>,
  options: Options,
): DeferNode<Loaded, DeferOptionsDependencies<Options>>;
export function deferNode<
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
export function deferNode<Module extends object>(
  loader: DeferLoader<Module>,
): DeferModulePicker<Module>;
export function deferNode<Loaded>(
  loader: DeferLoader<Loaded>,
  options?: DeferOptions<Loaded> & { readonly props?: object },
): DeferNode<Loaded> | DeferModulePicker<Loaded> {
  const node = createDeferNode(loader, options ?? {});
  if (options === undefined) {
    // Whether the loader resolves to a component or to a module is only known
    // once it ran: the node keeps a `pick` the module form uses. Not
    // enumerable, so the node itself stays what it was.
    Object.defineProperty(node, 'pick', {
      configurable: true,
      enumerable: false,
      value: (name: string, pickOptions: DeferOptions<unknown> = {}) =>
        createDeferNode(
          (helpers: CraftLazyLoadHelpers) =>
            loader(helpers).then((loaded) => {
              const component = (loaded as Record<string, unknown>)[name];
              if (typeof component !== 'function') {
                throw new Error(
                  `deferNode(...).pick(${JSON.stringify(name)}): the loaded module has no component export named ${JSON.stringify(name)}.`,
                );
              }
              return component;
            }),
          pickOptions,
        ),
    });
  }
  return node;
}

function createDeferNode<Loaded>(
  loader: DeferLoader<Loaded>,
  options: DeferOptions<Loaded> & { readonly props?: object },
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
