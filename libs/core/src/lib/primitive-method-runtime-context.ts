import {
  inject,
  InjectionToken,
  type Provider,
  type Signal,
} from './host/craft-compat';
import { rawReactiveFacade } from './reactive-read';

export type PrimitiveMethodRuntimeKind =
  | 'state'
  | 'query'
  | 'asyncProcess'
  | 'mutation'
  | 'queryParams';

export type PrimitiveMethodRuntimeContext<
  Kind extends PrimitiveMethodRuntimeKind = PrimitiveMethodRuntimeKind,
> = Readonly<{
  kind: Kind;
  get(): unknown;
  set(value: unknown): unknown;
  update(updater: (current: unknown) => unknown): unknown;
  patch(updater: (current: unknown) => object): unknown;
  originalSource: string;
}>;

export type QueryMethodRuntimeContext = PrimitiveMethodRuntimeContext<'query'>;
export type AsyncProcessMethodRuntimeContext =
  PrimitiveMethodRuntimeContext<'asyncProcess'>;
export type MutationMethodRuntimeContext =
  PrimitiveMethodRuntimeContext<'mutation'>;
export type QueryParamsMethodRuntimeContext =
  PrimitiveMethodRuntimeContext<'queryParams'>;

type PrimitiveInsertionContext = Readonly<{
  state: Signal<unknown>;
  set(value: unknown): unknown;
  update(updater: (current: unknown) => unknown): unknown;
  patch(updater: (current: unknown) => object): unknown;
}>;

const PRIMITIVE_METHOD_RUNTIME_CONTEXT =
  new InjectionToken<PrimitiveMethodRuntimeContext>(
    'PRIMITIVE_METHOD_RUNTIME_CONTEXT',
  );

export function injectPrimitiveMethodRuntimeContext():
  | PrimitiveMethodRuntimeContext
  | undefined {
  return (
    inject(PRIMITIVE_METHOD_RUNTIME_CONTEXT, { optional: true }) ?? undefined
  );
}

export function injectQueryMethodRuntimeContext():
  | QueryMethodRuntimeContext
  | undefined {
  return injectRuntimeContextFor('query');
}

export function injectAsyncProcessMethodRuntimeContext():
  | AsyncProcessMethodRuntimeContext
  | undefined {
  return injectRuntimeContextFor('asyncProcess');
}

export function injectMutationMethodRuntimeContext():
  | MutationMethodRuntimeContext
  | undefined {
  return injectRuntimeContextFor('mutation');
}

export function injectQueryParamsMethodRuntimeContext():
  | QueryParamsMethodRuntimeContext
  | undefined {
  return injectRuntimeContextFor('queryParams');
}

export function ɵprovidePrimitiveMethodRuntimeContext(
  kind: PrimitiveMethodRuntimeKind,
  context: PrimitiveInsertionContext,
  originalFactory: (...args: never[]) => unknown,
): Provider {
  return {
    provide: PRIMITIVE_METHOD_RUNTIME_CONTEXT,
    useValue: {
      kind,
      get: () => rawReactiveFacade(context.state)(),
      set: (value: unknown) => context.set(value),
      update: (updater: (current: unknown) => unknown) =>
        context.update(updater),
      patch: (updater: (current: unknown) => object) => context.patch(updater),
      originalSource: originalFactory.toString(),
    } satisfies PrimitiveMethodRuntimeContext,
  };
}

function injectRuntimeContextFor<Kind extends PrimitiveMethodRuntimeKind>(
  kind: Kind,
): PrimitiveMethodRuntimeContext<Kind> | undefined {
  const context = injectPrimitiveMethodRuntimeContext();
  return context?.kind === kind
    ? (context as PrimitiveMethodRuntimeContext<Kind>)
    : undefined;
}
