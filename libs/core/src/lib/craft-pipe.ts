import {
  inject,
  Injector,
  isSignal,
  runInInjectionContext,
} from '@angular/core';
import { isGenerator } from './craft-generator-runtime';
import { injectFnWrapper } from './fn-wrapper';
import { ɵcreateHostTaggedInjector } from './craft-service';
import { isSource } from './util/util';
import {
  createYieldableInsertionMethod,
  isNonYieldableInsertionMethod,
  isYieldableMethod,
  type YieldableInsertionMethods,
} from './yieldable';

// `craftPipe` composes several insertions into ONE, with the primitive's
// context passed EXPLICITLY: `primitive(config, (context) => craftPipe(context, m1, m2))`.
//
// Why explicit context: the outer lambda is context-sensitive, so the
// primitive types `context` concretely BEFORE the pipe call is resolved, and
// the pipe's `Ctx` generic infers from a VALUE argument. No per-primitive
// alias, no conditional resource/by-id handling, and the pipe also works
// INSIDE `insertSelect` (each level re-passes its own context) — none of
// which the previous implicit dedicated pipes could do.
//
// In member parameter types, `Ctx` is wrapped in `NoInfer` so member
// arguments (e.g. non-higher-order factories) can never pollute the context
// inference; only the `context` argument is an inference source.

// Primitives type `insertions` as `keyof P extends string ? P : never`;
// normalize `never` (empty previous outputs) back to `{}` before merging.
type NormalizeIns<T> = [T] extends [never] ? {} : T;
type CtxWithIns<Ctx, I> = Omit<Ctx, 'insertions'> & {
  insertions: YieldableInsertionMethods<I>;
};
type MergedIns<Ctx extends { insertions?: any }, I> = NormalizeIns<
  Ctx['insertions']
> &
  I;

/**
 * Composes several insertions into a single one, for ANY primitive
 * (`query`, `mutation`, `asyncProcess`, `state`, `queryParams`) and for the
 * nested insertions of `insertSelect`.
 *
 * ```typescript
 * const users = craftUse(query(
 *   config,
 *   (context) =>
 *     craftPipe(
 *       context,
 *       insertLocalStoragePersister({ storeName: 'app', key: 'users' }),
 *       insertReactOnMutation(deleteUser, { ... }),
 *     ),
 * ));
 * ```
 *
 * Semantics are identical to passing the members directly:
 * - members run left to right,
 * - each member sees the previous members' outputs on `context.insertions`,
 * - the resulting outputs are the intersection of all members' outputs
 *   (on a key conflict the rightmost member wins at runtime),
 * - tracked dependencies (primitive generator yields, craft-service yields)
 *   are the union of all members',
 * - each member factory is individually wrapped with the fn-wrapper chain
 *   (correlation-id tracking, app snapshots observe each member).
 *
 * Inline lambdas keep the primitive's contextual typing because the outer
 * `(context) => craftPipe(context, ...)` lambda receives the concrete
 * context from the primitive. Pipes nest freely, including inside
 * `insertSelect`: `insertSelect('grid', (gridContext) => craftPipe(gridContext, ...))`.
 */
export function craftPipe<
  Ctx extends { insertions?: any },
  I1,
  I2,
  Y1 = never,
  Y2 = never,
>(
  context: Ctx,
  m1: (context: NoInfer<Ctx>) => I1 | Generator<Y1, I1, unknown>,
  m2: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1>>,
  ) => I2 | Generator<Y2, I2, unknown>,
): Generator<Y1 | Y2, I1 & I2, unknown>;
export function craftPipe<
  Ctx extends { insertions?: any },
  I1,
  I2,
  I3,
  Y1 = never,
  Y2 = never,
  Y3 = never,
>(
  context: Ctx,
  m1: (context: NoInfer<Ctx>) => I1 | Generator<Y1, I1, unknown>,
  m2: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1>>,
  ) => I2 | Generator<Y2, I2, unknown>,
  m3: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2>>,
  ) => I3 | Generator<Y3, I3, unknown>,
): Generator<Y1 | Y2 | Y3, I1 & I2 & I3, unknown>;
export function craftPipe<
  Ctx extends { insertions?: any },
  I1,
  I2,
  I3,
  I4,
  Y1 = never,
  Y2 = never,
  Y3 = never,
  Y4 = never,
>(
  context: Ctx,
  m1: (context: NoInfer<Ctx>) => I1 | Generator<Y1, I1, unknown>,
  m2: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1>>,
  ) => I2 | Generator<Y2, I2, unknown>,
  m3: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2>>,
  ) => I3 | Generator<Y3, I3, unknown>,
  m4: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2 & I3>>,
  ) => I4 | Generator<Y4, I4, unknown>,
): Generator<Y1 | Y2 | Y3 | Y4, I1 & I2 & I3 & I4, unknown>;
export function craftPipe<
  Ctx extends { insertions?: any },
  I1,
  I2,
  I3,
  I4,
  I5,
  Y1 = never,
  Y2 = never,
  Y3 = never,
  Y4 = never,
  Y5 = never,
>(
  context: Ctx,
  m1: (context: NoInfer<Ctx>) => I1 | Generator<Y1, I1, unknown>,
  m2: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1>>,
  ) => I2 | Generator<Y2, I2, unknown>,
  m3: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2>>,
  ) => I3 | Generator<Y3, I3, unknown>,
  m4: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2 & I3>>,
  ) => I4 | Generator<Y4, I4, unknown>,
  m5: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2 & I3 & I4>>,
  ) => I5 | Generator<Y5, I5, unknown>,
): Generator<Y1 | Y2 | Y3 | Y4 | Y5, I1 & I2 & I3 & I4 & I5, unknown>;
export function craftPipe<
  Ctx extends { insertions?: any },
  I1,
  I2,
  I3,
  I4,
  I5,
  I6,
  Y1 = never,
  Y2 = never,
  Y3 = never,
  Y4 = never,
  Y5 = never,
  Y6 = never,
>(
  context: Ctx,
  m1: (context: NoInfer<Ctx>) => I1 | Generator<Y1, I1, unknown>,
  m2: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1>>,
  ) => I2 | Generator<Y2, I2, unknown>,
  m3: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2>>,
  ) => I3 | Generator<Y3, I3, unknown>,
  m4: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2 & I3>>,
  ) => I4 | Generator<Y4, I4, unknown>,
  m5: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2 & I3 & I4>>,
  ) => I5 | Generator<Y5, I5, unknown>,
  m6: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2 & I3 & I4 & I5>>,
  ) => I6 | Generator<Y6, I6, unknown>,
): Generator<Y1 | Y2 | Y3 | Y4 | Y5 | Y6, I1 & I2 & I3 & I4 & I5 & I6, unknown>;
export function craftPipe<
  Ctx extends { insertions?: any },
  I1,
  I2,
  I3,
  I4,
  I5,
  I6,
  I7,
  Y1 = never,
  Y2 = never,
  Y3 = never,
  Y4 = never,
  Y5 = never,
  Y6 = never,
  Y7 = never,
>(
  context: Ctx,
  m1: (context: NoInfer<Ctx>) => I1 | Generator<Y1, I1, unknown>,
  m2: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1>>,
  ) => I2 | Generator<Y2, I2, unknown>,
  m3: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2>>,
  ) => I3 | Generator<Y3, I3, unknown>,
  m4: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2 & I3>>,
  ) => I4 | Generator<Y4, I4, unknown>,
  m5: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2 & I3 & I4>>,
  ) => I5 | Generator<Y5, I5, unknown>,
  m6: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2 & I3 & I4 & I5>>,
  ) => I6 | Generator<Y6, I6, unknown>,
  m7: (
    context: CtxWithIns<NoInfer<Ctx>, MergedIns<NoInfer<Ctx>, I1 & I2 & I3 & I4 & I5 & I6>>,
  ) => I7 | Generator<Y7, I7, unknown>,
): Generator<Y1 | Y2 | Y3 | Y4 | Y5 | Y6 | Y7, I1 & I2 & I3 & I4 & I5 & I6 & I7, unknown>;
export function* craftPipe(
  context: { insertions?: Record<string, unknown> },
  ...members: Array<(context: any) => unknown>
): Generator<unknown, Record<string, unknown>, unknown> {
  // This generator is driven by the primitive's craft-generator runtime,
  // inside `runInInjectionContext(injector)`: inject() is available on the
  // first synchronous segment. Capture the fn-wrapper adapter here so each
  // member keeps its own wrapping (per-member observability), exactly like
  // the primitives' own insertion loop.
  const wrap = injectFnWrapper();
  const injector = inject(Injector);
  let acc: Record<string, unknown> = {};
  let exposedAcc: Record<string, unknown> = {};
  for (const member of members) {
    const wrappedMember = wrap(member);
    const result = wrappedMember({
      ...context,
      insertions: { ...(context.insertions ?? {}), ...exposedAcc },
    });
    const output = isGenerator(result)
      ? yield* (result as Generator<unknown, Record<string, unknown>, unknown>)
      : result;
    const rawOutput = output as Record<string, unknown>;
    acc = { ...acc, ...rawOutput };

    const nextExposed = Object.entries(rawOutput).reduce(
      (previous, [key, value]) => {
        if (isSource(value) || isSignal(value) || isYieldableMethod(value)) {
          previous[key] = value;
          return previous;
        }

        if (
          typeof value === 'function' &&
          !isNonYieldableInsertionMethod(value)
        ) {
          const methodInjector = ɵcreateHostTaggedInjector(
            injector,
            `method:${key}`,
          );
          const wrappedFn = runInInjectionContext(methodInjector, () =>
            injectFnWrapper()(value as (...args: unknown[]) => unknown),
          );
          previous[key] = createYieldableInsertionMethod(wrappedFn, {
            injector: methodInjector,
            invalidYieldErrorMessage:
              'craftPipe insertion method generators can only yield craftService dependencies or exposed dependency helpers.',
            multipleAppStartErrorMessage:
              'craftPipe insertion methods do not support multiple onAppStart(...) declarations.',
            onAppStartNotSupportedErrorMessage:
              'craftPipe insertion methods do not support onAppStart(...).',
          });
          return previous;
        }

        previous[key] = value;
        return previous;
      },
      {} as Record<string, unknown>,
    );
    exposedAcc = { ...exposedAcc, ...nextExposed };
  }
  return acc;
}
