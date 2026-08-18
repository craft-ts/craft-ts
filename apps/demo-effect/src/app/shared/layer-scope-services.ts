import { Context, Effect, Layer } from 'effect';

export class GlobalLayerService extends Context.Service<
  GlobalLayerService,
  { readonly label: string }
>()('GlobalLayerService') {}

export const GlobalLayer = Layer.succeed(GlobalLayerService, {
  label: 'Global layer from app.config.ts',
});

export class RouteLayerService extends Context.Service<
  RouteLayerService,
  { readonly label: string }
>()('RouteLayerService') {}

export const RouteLayer = Layer.succeed(RouteLayerService, {
  label: 'Route layer from route providers',
});

export type LayerScopeResult = {
  readonly global: string;
  readonly route: string;
};

/** Async server-state read requiring both the global and route-scoped services. */
export function loadLayerScope(): Effect.Effect<
  LayerScopeResult,
  never,
  GlobalLayerService | RouteLayerService
> {
  return Effect.gen(function* () {
    // The real application would perform its HTTP request here. Keep a small
    // delay so the query's pending state remains visible in this self-contained
    // demo while the Layers are resolved from the correct injectors.
    yield* Effect.sleep('150 millis');
    const global = yield* GlobalLayerService;
    const route = yield* RouteLayerService;
    return { global: global.label, route: route.label };
  });
}
