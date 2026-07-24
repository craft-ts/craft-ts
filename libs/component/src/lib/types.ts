import type { Provider } from '@angular/core';
import type { CraftNodeChildren, ComponentNode } from './render/vnode';

declare const INPUT_BRAND: unique symbol;
declare const OUTPUT_BRAND: unique symbol;

export type Input<T> = (() => T) & {
  readonly [INPUT_BRAND]: T;
};

export type Output<Handler extends (...args: any[]) => unknown> = Handler & {
  readonly [OUTPUT_BRAND]: Handler;
};

export type InputValue<T> = () => T;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type PropsFromContext<Context> = Simplify<{
  [Key in keyof Context as Context[Key] extends Input<unknown>
    ? Key
    : Context[Key] extends Output<(...args: any[]) => unknown>
      ? Key
      : never]: Context[Key] extends Input<infer Value>
    ? InputValue<Value>
    : Context[Key] extends Output<infer Handler>
      ? Handler
      : never;
}>;

export const CRAFT_COMPONENT = Symbol('craft-component');

export interface ComponentMeta {
  readonly providers?: readonly Provider[];
  readonly host?: Readonly<Record<string, unknown>>;
  readonly styles?: string | readonly string[];
}

export type ComponentFactory = (...args: any[]) => unknown;

export interface ComponentDefinition<Context = unknown> {
  readonly meta: ComponentMeta;
  readonly factory: ComponentFactory;
  readonly template: (context: Context) => CraftNodeChildren;
}

type ComponentCall<Props extends object> = keyof Props extends never
  ? (props?: Props) => ComponentNode<Props>
  : (props: Props) => ComponentNode<Props>;

export type CraftComponent<
  Props extends object = Record<never, never>,
> = ComponentCall<Props> & {
  readonly [CRAFT_COMPONENT]: ComponentDefinition<unknown>;
};

export type PropsOf<Component> =
  Component extends CraftComponent<infer Props> ? Props : never;

export function isCraftComponent(value: unknown): value is CraftComponent<object> {
  return typeof value === 'function' && CRAFT_COMPONENT in value;
}
