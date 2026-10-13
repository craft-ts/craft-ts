import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  ProjectionNode,
} from './render/vnode';
import { isGeneratorFunction, isYieldableValue } from '@craft-ts/core';
import { currentCraftRenderContext } from './render/vnode';
import {
  CONTENT_DECLARATION_CONTEXT,
  CONTENT_OUTPUT,
  CONTENT_RENDERABLE,
  type InputValue,
  type ProjectionUnit,
  type RenderableContent,
} from './types';

type ContentOutput<Value> = Value extends (...args: any[]) => infer Output
  ? Output
  : never;

type RenderableContentOutput<Value> =
  ContentOutput<Value> extends CraftNodeChildren
    ? ContentOutput<Value>
    : CraftNodeChildren;

/** Brands deferred DOM content and records the context it was declared in. */
export function content<Output extends CraftNodeChildren>(
  renderer: () => Output,
): RenderableContent<Output> & {
  readonly [CONTENT_RENDERABLE]: true;
  readonly [CONTENT_DECLARATION_CONTEXT]: unknown;
  readonly [CONTENT_OUTPUT]: Output;
} {
  Object.defineProperty(renderer, CONTENT_DECLARATION_CONTEXT, {
    value: currentCraftRenderContext(),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return renderer as RenderableContent<Output> & {
    readonly [CONTENT_RENDERABLE]: true;
    readonly [CONTENT_DECLARATION_CONTEXT]: unknown;
    readonly [CONTENT_OUTPUT]: Output;
  };
}

function isComponentUnit(value: unknown): value is ProjectionUnit {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind === 'component'
  );
}

/** Renders either deferred DOM content or a component with a projection contract. */
export function renderContent<Value extends RenderableContent>(
  value: Value | InputValue<Value>,
): ProjectionNode<
  CraftNodeChildrenDependencies<RenderableContentOutput<Value>>,
  RenderableContentOutput<Value>
>;
export function renderContent<Value extends ProjectionUnit<any>>(
  value: Value | InputValue<Value>,
): ProjectionNode<CraftNodeChildrenDependencies<Value>, Value>;
export function renderContent<
  SlotName extends string,
  Value extends RenderableContent,
>(
  slotName: SlotName,
  value: Value | InputValue<Value>,
): ProjectionNode<
  CraftNodeChildrenDependencies<RenderableContentOutput<Value>>,
  RenderableContentOutput<Value>
>;
export function renderContent(
  slotNameOrValue:
    | string
    | RenderableContent
    | ProjectionUnit
    | InputValue<RenderableContent | ProjectionUnit>,
  maybeValue?:
    | RenderableContent
    | ProjectionUnit
    | InputValue<RenderableContent | ProjectionUnit>,
): ProjectionNode {
  const named = typeof slotNameOrValue === 'string';
  const slotName = named ? slotNameOrValue : undefined;
  const value = (named ? maybeValue : slotNameOrValue) as
    | RenderableContent
    | ProjectionUnit
    | InputValue<RenderableContent | ProjectionUnit>;
  const isYieldableReader =
    isGeneratorFunction(value) || isYieldableValue(value);
  const declarationContext = isComponentUnit(value)
    ? (value.declarationContext ?? currentCraftRenderContext())
    : typeof value === 'function' && !isYieldableReader
      ? ((
          value as Partial<Record<typeof CONTENT_DECLARATION_CONTEXT, unknown>>
        )[CONTENT_DECLARATION_CONTEXT] ?? currentCraftRenderContext())
      : currentCraftRenderContext();

  return {
    kind: 'projection',
    render: () =>
      (isComponentUnit(value) || isYieldableReader ? value : value()) as
        | ProjectionUnit
        | CraftNodeChildren,
    ...(slotName ? { slotName } : {}),
    declarationContext,
  };
}
