import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  ProjectionNode,
} from './render/vnode';
import { isGeneratorFunction, isYieldableValue } from '@craft-ng/core';
import { currentCraftRenderContext } from './render/vnode';
import {
  CONTENT_DECLARATION_CONTEXT,
  CONTENT_OUTPUT,
  CONTENT_RENDERABLE,
  CONTENT_STYLE_POLICY,
  type ContentOptions,
  type ContentStylePolicy,
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

function contentStylePolicy(value: unknown): ContentStylePolicy {
  return (value as Partial<Record<typeof CONTENT_STYLE_POLICY, unknown>>)[
    CONTENT_STYLE_POLICY
  ] === 'allow-container-styles'
    ? 'allow-container-styles'
    : 'isolated';
}

function defineContentPolicy(
  renderer: (...args: any[]) => unknown,
  policy: ContentStylePolicy,
): void {
  Object.defineProperty(renderer, CONTENT_STYLE_POLICY, {
    value: policy,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

/** Brands deferred DOM content and records the caller's style opt-in. */
export function content<
  Output extends CraftNodeChildren,
  const Options extends ContentOptions | undefined = undefined,
>(
  renderer: () => Output,
  options?: Options,
): RenderableContent<Output> & {
  readonly [CONTENT_RENDERABLE]: true;
  readonly [CONTENT_DECLARATION_CONTEXT]: unknown;
  readonly [CONTENT_STYLE_POLICY]: Options extends {
    readonly allowContainerStyles: true;
  }
    ? 'allow-container-styles'
    : 'isolated';
  readonly [CONTENT_OUTPUT]: Output;
} {
  defineContentPolicy(
    renderer,
    options?.allowContainerStyles === true
      ? 'allow-container-styles'
      : 'isolated',
  );
  Object.defineProperty(renderer, CONTENT_DECLARATION_CONTEXT, {
    value: currentCraftRenderContext(),
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return renderer as RenderableContent<Output> & {
    readonly [CONTENT_RENDERABLE]: true;
    readonly [CONTENT_DECLARATION_CONTEXT]: unknown;
    readonly [CONTENT_STYLE_POLICY]: Options extends {
      readonly allowContainerStyles: true;
    }
      ? 'allow-container-styles'
      : 'isolated';
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
  const policy =
    typeof value === 'function' && !isYieldableReader
      ? contentStylePolicy(value)
      : 'isolated';

  return {
    kind: 'projection',
    render: () =>
      (isComponentUnit(value) || isYieldableReader ? value : value()) as
        | ProjectionUnit
        | CraftNodeChildren,
    ...(slotName ? { slotName } : {}),
    stylePolicy: policy,
    declarationContext,
  };
}
