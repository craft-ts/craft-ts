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

/** Domain code requiring both the global and route-scoped services. */
export function loadLayerScope(): Effect.Effect<
  LayerScopeResult,
  never,
  GlobalLayerService | RouteLayerService
> {
  return Effect.gen(function* () {
    const global = yield* GlobalLayerService;
    const route = yield* RouteLayerService;
    return { global: global.label, route: route.label };
  });
}
