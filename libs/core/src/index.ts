export * from './lib/after-recomputation';
export * from './lib/app-checked-di';
export * from './lib/route-checked-di';
export * from './lib/async-process';
export * from './lib/browser-boundaries';
export * from './lib/computed-source';
export * from './lib/craft-http-client';
export * from './lib/craft-codec';
export * from './lib/craft-exception';
export * from './lib/craft-gen';
export * from './lib/craft-program-operators';
export * from './lib/temporal-runtime';
export * from './lib/craft-match';
export * from './lib/insert-storage-persister';
export * from './lib/craft-unique';
export * from './lib/insert-noop-typing-anchor';
export * from './lib/insert-select';
export * from './lib/insert-select-resource';
export * from './lib/linked-source';
export * from './lib/mutation';
export * from './lib/query-params';
export * from './lib/query';
// Insertion authoring surface: the contexts an insertion receives, and the
// factory signatures a reusable insertion can be typed with.
export type {
  // state
  InsertionStateFactoryContext,
  InsertionsStateFactory,
  // query / mutation / asyncProcess
  InsertionResourceFactoryContext,
  InsertionsResourcesFactory,
  InsertionParams,
  InsertionsFactory,
  InsertionByIdParams,
  InsertionsByIdFactory,
  // queryParams
  InsertionQueryParamsFactoryContext,
  InsertionsQueryParamsFactory,
  // shared constraint used by the resource-based generics above
  ResourceExceptionConstraints,
  YieldableInsertionWrite,
} from './lib/query.core';
export * from './lib/source-from-event';
export * from './lib/signal-source';
export * from './lib/stacked-source';
export * from './lib/state';
export * from './lib/schema-validation';
export * from './lib/craft-handshake';
export * from './lib/server-function-contract';
export * from './lib/client-di-requirement';
export * from './lib/server-function';
export {
  assertMiddlewareId,
  flattenMiddlewareGraph,
  type MergeSchemaInputs,
  type MergeSchemaOutputs,
  type MiddlewareContext,
  type MiddlewareDownstreamError,
  type MiddlewareNode,
  type MiddlewareResult,
  type OverwriteContext,
  type Simplify as MiddlewareSimplify,
} from './lib/middleware-schema-shared';
export * from './lib/server-function-middleware';
export * from './lib/server-layer';
export * from './lib/portable-server-function';
export * from './lib/client-function-middleware';
export * from './lib/server-function-client';
export * from './lib/server';
export type { StandardSchemaV1 } from './lib/standard-schema';
export * from './lib/state-method-runtime-context';
export * from './lib/primitive-method-runtime-context';
export * from './lib/primitive-resource-runtime-context';
export * from './lib/to-source';
export * from './lib/util/craft-resource-status';
export * from './lib/util/extract-signal-props-and-methods';
export * from './lib/util/source.type';
export * from './lib/util/util';
export * from './lib/util/util.type';
export * from './lib/insert-react-on-mutation';
export * from './lib/craft-pipe';
export * from './lib/insert-typed-pipes';
export * from './lib/insert-pagination-placeholder-data';
export * from './lib/resource-by-id';
export * from './lib/storage-persister.service';
export * from './lib/global-persister-handler.service';
export * from './lib/util/entities-util';
export * from './lib/craft-method';
export * from './lib/craft-computed';
export * from './lib/craft-primitive-registry';
export * from './lib/craft-replay';
export * from './lib/craft-state-machine';
export * from './lib/craft-machine-history';
export {
  ɵactiveMachineScope,
  type MachineScope,
} from './lib/craft-state-machine-runtime';
export * from './lib/craft-effect';
export * from './lib/craft-service';
export {
  craftToken,
  createCraftInjector,
  getCurrentCraftInjector,
  ɵcreateCraftInjectorFromHost,
  ɵregisterCraftTokenHostToken,
  type CraftInjector,
  type CraftProvider,
  type CraftToken,
} from './lib/host/craft-injector';
export { ɵcraftInjectorFromHost } from './lib/host/craft-compat';
// The DI and reactivity surface an application authors against. These are
// generic concepts, not Angular ones — an app needs a token, an injector, a
// teardown hook and a way to run something at startup, whatever renders it.
export {
  DestroyRef,
  InjectionToken,
  provideAppInitializer,
  signal as craftSignal,
  untracked as craftUntracked,
  type EnvironmentProviders,
  type Provider,
  type Signal,
  type EffectRef,
} from './lib/host/craft-compat';
// Craft's stand-in for TestBed: a root injector with the six methods specs
// actually used. Exported so apps can test against the same harness.
export {
  TestBed,
  ɵsetCraftTestMounter,
  type CraftComponentFixture,
} from './lib/host/craft-test-bed';
export {
  APP_INITIALIZER,
  getCraftRootDefaultProviders as ɵgetCraftRootDefaultProviders,
  DestroyRef as ɵDestroyRef,
  Injector as ɵInjector,
  InjectionToken as ɵInjectionToken,
  ɵsetCraftDevMode,
  ɵsetCraftHostInjectorRunner,
  ɵsetCraftInjectFallback,
  inject as ɵinject,
  createEnvironmentInjector as ɵcreateEnvironmentInjector,
  ElementRef as ɵElementRef,
  EnvironmentInjector as ɵEnvironmentInjector,
  runInInjectionContext as ɵrunInInjectionContext,
  computed as ɵcomputed,
  effect as ɵeffect,
  signal as ɵsignal,
  untracked as ɵuntracked,
  ɵEffectScheduler,
  ɵINJECTOR_SCOPE,
} from './lib/host/craft-compat';
export type {
  EffectRef as ɵEffectRef,
  Provider as ɵProvider,
  ProviderToken as ɵProviderToken,
} from './lib/host/craft-compat';
export {
  CRAFT_SIGNAL as ɵCRAFT_SIGNAL,
  ɵbrandAsCraftSignal,
  craftComputed as ɵcraftComputed,
  craftWatch as ɵcraftWatch,
} from './lib/host/craft-signal';
export type { CraftSignal as ɵCraftSignal } from './lib/host/craft-signal';
export {
  createBrowserDomAdapter,
  type CraftDomAdapter,
} from './lib/host/craft-dom';
export {
  createBrowserHistory,
  createMemoryHistory,
  matchCraftRoutes,
  matchCraftRoutesAsync,
  parseSearchParams,
  parseUrl,
  serializeLocation,
  type CraftCompiledRoute,
  type CraftHistory,
  type CraftLocation,
  type CraftMatch,
} from './lib/host/craft-router-runtime';
export {
  CRAFT_COMPILED_ROUTES,
  CRAFT_HISTORY,
  CRAFT_LOCATION,
  CRAFT_MATCH,
  CRAFT_ROUTER,
} from './lib/craft-router-tokens';
export * from './lib/craft-primitive-gen';
export * from './lib/craft-use';
export * from './lib/yieldable';
export {
  DEEP_YIELDABLE,
  DEEP_YIELDABLE_INSERTION,
  REACTIVE_DEPENDENCIES,
  REACTIVE_READ_OBSERVERS,
  REACTIVE_READ_REQUEST,
  REACTIVE_VALUE_TYPE,
  RAW_REACTIVE_VALUE as ɵRAW_REACTIVE_VALUE,
  YIELDABLE_DEPENDENCY,
  YIELDABLE_VALUE,
  createYieldableReactiveFacade,
  createYieldableReactiveValue,
  deepYieldable,
  hasDeepYieldableInsertion,
  insertDeepYieldable,
  isReactiveReadRequest,
  isYieldableReactiveValue,
  nameInsertedReactiveValue,
  provideReactiveReadObserver,
  rawReactiveFacade,
  rawReactiveValue,
  ɵactiveReactiveReader,
  ɵwithActiveReactiveReader,
} from './lib/reactive-read';
export type {
  DeepYieldableInsertion,
  DeepYieldableMarker,
  DeepYieldableReaderOf,
  DeepYieldableValue,
  NamedYieldableValue,
  RawReactiveProperties,
  ReactiveDependencyMap,
  ReactiveDependencyMapFromYielded,
  ReactiveReadEdge,
  ReactiveReadIdentity,
  ReactiveReadObserver,
  ReactiveReadRequest,
  YieldableDependency,
  YieldableReactiveAction,
  YieldableReactiveProperties,
  YieldableReactiveSignal,
  YieldableReactiveValue,
} from './lib/reactive-read';
export * from './lib/correlation-id';
export * from './lib/correlation-id-plugin';
export * from './lib/dom-event-hook';
export * from './lib/template-trace';
export * from './lib/craft-router-trace';
export * from './lib/craft-http-trace';
export * from './lib/craft-platform';
export * from './lib/craft-render-identity';
export * from './lib/craft-transfer-snapshot';
export * from './lib/craft-ssr';
export * from './lib/take-app-snapshot';
export * from './lib/component-monitoring';
export * from './lib/component-register';
export * from './lib/craft-register-for';
export * from './lib/craft-register-for-runtime';
export * from './lib/craft-target-runtime';
export * from './lib/craft-node-directive';
export * from './lib/fn-wrapper';
export {
  executeGeneratorCompatibleFactory,
  type ResolveGeneratorResult,
} from './lib/craft-generator-runtime';
export {
  provideServiceYieldWrapper,
  SERVICE_YIELD_WRAPPER,
  type ServiceYieldContext,
  type ServiceYieldWrapper,
} from './lib/craft-generator-runtime';
export {
  driveCraftProgramAsync,
  executeGeneratorCompatibleFactoryAsync,
  // Foreign-yield bridge: lets a package such as `@craft-ts/effect` claim yields
  // core does not understand, without core ever depending on `effect`.
  setForeignYieldBridge,
  ɵsetForeignYieldBridge,
  type CraftProgramSettledStep,
  type ForeignYieldBridge,
  type ForeignYieldContext,
  type ForeignYieldOutcome,
} from './lib/craft-program-runtime';
export * from './lib/host-tag';
export * from './lib/source$';
export * from './lib/from-event-to-source$';
export * from './lib/on$';
export * from './lib/form/craft-field';
export * from './lib/form/field-exception';
export * from './lib/form/craft-field.directive';
export * from './lib/form/insert-form';
export * from './lib/form/insert-form-schema';
export * from './lib/form/insert-form-attributes';
export * from './lib/form/insert-select-form-tree';
export * from './lib/form/target-form-field';
export * from './lib/form/insert-sub-form-field';
export * from './lib/form/make-form-tree-insert';
export * from './lib/form/field-lens';
export * from './lib/form/insert-form-submit';
export * from './lib/form/validator';
export * from './lib/insert-entities';
export * from './lib/setup-craft-service-test';
export * from './lib/setup-craft-service-testing-by-register';
export * from './lib/branded-component/branded-component';
export * from './lib/craft-app-config';
export * from './lib/craft-router';
export * from './lib/craft-activated-route';
export { ActivatedRoute } from './lib/host/craft-router-types';
export * from './lib/craft-routes';
export * from './lib/craft-resolve';
export * from './lib/craft-route-exceptions';
export * from './lib/craft-route-meta';
export * from './lib/craft-route-target';
export * from './lib/craft-pending';
export * from './lib/craft-a11y';
export * from './lib/craft-load-retry';
export * from './lib/craft-route-load-error';
export * from './lib/craft-lazy';
export * from './lib/craft-view-transition';
export * from './lib/craft-router-outlet';
export * from './lib/craft-until-settled';
export * from './lib/craft-settled';
export * from './lib/craft-control-flow';
export * from './lib/mock-http-request-for-route';
export * from './lib/send-context-to-ai';
export { CRAFT_SERVICE_PROVIDER_BRAND } from './lib/craft-service.shared';
export type { FlattenDependencyTree } from './lib/craft-service.shared';
