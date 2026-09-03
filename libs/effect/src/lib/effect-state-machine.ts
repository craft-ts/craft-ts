import {
  transitionGuard,
  type CraftTransition,
  type CraftTransitionGuard,
  type ServiceTrackedDepsRequest,
} from '@craft-ts/core';
import { Effect } from 'effect';
import type { EffectExceptionMarkers } from './effect-exceptions';
import type { RealRequirements } from './requirements';
import { syncEffect, type AssertDeclaredSync } from './sync-op';

/** The type-only dependency node understood by Craft's route DI checker. */
type EffectDependencyNode<Service> = Service & {
  readonly providedIn: 'toProvide';
  readonly dependencies: Record<never, never>;
};

type EffectServiceRequirements<Requirements> = Extract<
  RealRequirements<Requirements>,
  { readonly key: string }
>;

/**
 * Converts Effect's service requirements into Craft's dependency-map shape.
 * The intersection keeps the original service value assignable to the
 * `provideLayer(...)` output used by `RouteCheckedDI`.
 */
export type EffectServiceDependencyMap<Requirements> = {
  [Service in EffectServiceRequirements<Requirements> as Service['key']]:
    EffectDependencyNode<Service>;
};

type EffectDependencyRequest<Requirements> = [
  keyof EffectServiceDependencyMap<Requirements>,
] extends [never]
  ? never
  : ServiceTrackedDepsRequest<EffectServiceDependencyMap<Requirements>>;

export type TransitionGuardEffectYielded<Error, Requirements> =
  | EffectExceptionMarkers<Error>
  | EffectDependencyRequest<Requirements>;

/**
 * Adapts a declared-synchronous Effect to a state-machine transition guard.
 *
 * State-machine transitions are evaluated synchronously. The callback must
 * therefore return an Effect whose requirements include `SyncOp`; asynchronous
 * Effects belong in `queryEffect`, `mutationEffect`, or `asyncProcessEffect`
 * and should be represented as an explicit machine step.
 *
 * Effect service requirements are carried in the guard's type-only yield. This
 * makes them part of the enclosing machine/component dependency graph, so a
 * route-scoped `provideLayer(...)` can satisfy them and a missing Layer is
 * rejected by the route DI check.
 */
export function transitionGuardEffect<
  Transition extends CraftTransition<any, string, any>,
  Error,
  Requirements,
>(
  effect: (
    transition: Transition,
  ) => Effect.Effect<boolean, Error, Requirements> &
    AssertDeclaredSync<Requirements>,
): CraftTransitionGuard<
  Transition,
  TransitionGuardEffectYielded<Error, Requirements>
> {
  return transitionGuard((transition) =>
    syncEffect(effect(transition), {
      label: 'transitionGuardEffect',
    }),
  ) as CraftTransitionGuard<
    Transition,
    TransitionGuardEffectYielded<Error, Requirements>
  >;
}
