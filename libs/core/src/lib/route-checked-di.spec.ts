import { craftService, GetServiceDependencies } from './craft-service';
import { GetDeps } from './branded-component/branded-component';
import type { CanRun } from './app-checked-di';
import type { RouteCheckedDI } from './route-checked-di';

describe('RouteCheckedDI', () => {
  it('should return true if all deps are provided via AvailableProviderNames', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type GenDeps_MyComp = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    type CHECK = RouteCheckedDI<GenDeps_MyComp, 'Counter'>;

    expectTypeOf<CHECK>().toEqualTypeOf<true>();
    // Constraint check: CanRun<CHECK> must satisfy `extends true`.
    expectTypeOf<CanRun<CHECK>>().toEqualTypeOf<true>();
  });

  it('should report a missing injected service when not in AvailableProviderNames', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type GenDeps_MyComp = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    // Pass an empty union — Counter remains unresolved.
    type CHECK = RouteCheckedDI<GenDeps_MyComp, never>;

    expectTypeOf<CHECK>().toEqualTypeOf<
      [
        'The Counter service is not provided in this component',
      ]
    >();
  });

  it('should report a missing input from publicProperties', () => {
    type GenDeps_MyComp = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {
        userId: () => string;
      };
    }>;

    type CHECK = RouteCheckedDI<GenDeps_MyComp, never>;

    expectTypeOf<CHECK>().toEqualTypeOf<
      ['Input "userId" is not provided in this component']
    >();
  });

  it('should resolve a missing service when a structurally matching ProvidedValue is supplied', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type CounterDep = GetServiceDependencies<typeof Counter>;

    type GenDeps_MyComp = GetDeps<{
      deps: {
        Counter: CounterDep;
      };
      provided: {};
      publicProperties: {};
    }>;

    // No name match, but the value type matches via ProvidedValues — should resolve.
    type CHECK = RouteCheckedDI<GenDeps_MyComp, never, CounterDep>;

    expectTypeOf<CHECK>().toEqualTypeOf<true>();
  });

  it('should accept a custom Context for clearer error messages', () => {
    const { Counter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => 1,
    );

    type GenDeps_MyComp = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    type CHECK = RouteCheckedDI<GenDeps_MyComp, never, never, 'MyComponent'>;

    expectTypeOf<CHECK>().toEqualTypeOf<
      [
        'The Counter service is not provided in MyComponent',
      ]
    >();
  });

  it('should fail when a component-provided service is removed (generator cascade pattern)', () => {
    // Mirrors the generator's emitted shape: route file exposes a cumulative
    // union of names (app + route), and the cascade check unions it with the
    // names DERIVED from the component's `GenDeps.provided`. If a provider is
    // dropped from `@Component.providers` AND the `brand-angular-deps-match`
    // ESLint rule has synced `GenDeps.provided` (i.e. the service is removed
    // from `provided`), the cascade check must surface the error.
    const { GlobalSvc } = craftService(
      { name: 'GlobalSvc', scope: 'global' },
      () => 1,
    );
    const { RouteSvc } = craftService(
      { name: 'RouteSvc', scope: 'toProvide' },
      () => 2,
    );
    const { CompSvc } = craftService(
      { name: 'CompSvc', scope: 'toProvide' },
      () => 3,
    );

    type RouteProvidedNames = 'RouteSvc';

    // ----- Case A: component PROPERLY provides CompSvc — cascade passes. -----
    type GenDeps_Ok = GetDeps<{
      deps: {
        GlobalSvc: GetServiceDependencies<typeof GlobalSvc>;
        RouteSvc: GetServiceDependencies<typeof RouteSvc>;
        CompSvc: GetServiceDependencies<typeof CompSvc>;
      };
      provided: {
        CompSvc: { tag: 'CompSvcProvider' };
      };
      publicProperties: {};
    }>;

    type OkProvidedNames =
      | RouteProvidedNames
      | Extract<keyof GenDeps_Ok['provided'], string>;
    type CHECK_OK = RouteCheckedDI<GenDeps_Ok, OkProvidedNames, never, 'OkComp'>;
    expectTypeOf<CHECK_OK>().toEqualTypeOf<true>();
    expectTypeOf<CanRun<CHECK_OK>>().toEqualTypeOf<true>();

    // ----- Case B: GenDeps.provided no longer lists CompSvc (the user
    // removed the provider from @Component.providers AND ESLint synced the
    // GenDeps). The cascade check must now report CompSvc as missing.
    type GenDeps_Broken = GetDeps<{
      deps: {
        GlobalSvc: GetServiceDependencies<typeof GlobalSvc>;
        RouteSvc: GetServiceDependencies<typeof RouteSvc>;
        CompSvc: GetServiceDependencies<typeof CompSvc>;
      };
      provided: {}; // ← CompSvc gone from provided
      publicProperties: {};
    }>;

    type BrokenProvidedNames =
      | RouteProvidedNames
      | Extract<keyof GenDeps_Broken['provided'], string>;
    type CHECK_BROKEN = RouteCheckedDI<
      GenDeps_Broken,
      BrokenProvidedNames,
      never,
      'BrokenComp'
    >;

    expectTypeOf<CHECK_BROKEN>().toEqualTypeOf<
      [
        'The CompSvc service is not provided in BrokenComp',
      ]
    >();
    // @ts-expect-error — CanRun rejects non-true CHECK_BROKEN at its
    // `extends true` constraint. This compile-time error is exactly what the
    // generator-emitted `type _CanRun<Comp> = CanRun<_Check<Comp>>;` surfaces
    // to the user in the route file.
    type _CanRunBroken = CanRun<CHECK_BROKEN>;
  });

  it('should scale to many isolated component checks without TS2589', () => {
    // Each RouteCheckedDI is O(1) — running many of them does NOT recurse over
    // a route list, so the type instantiation depth stays constant regardless
    // of how many checks coexist. This test asserts that >50 distinct checks
    // type-check cleanly (the global AppCheckedDI would TS2589 well before).
    const { S } = craftService(
      { name: 'S', scope: 'toProvide' },
      () => 1,
    );

    type Deps = GetDeps<{
      deps: { S: GetServiceDependencies<typeof S> };
      provided: {};
      publicProperties: {};
    }>;

    // 50 distinct checks — each is independent, no shared recursion.
    type Checks = [
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
      RouteCheckedDI<Deps, 'S'>,
    ];

    // All checks should resolve to `true`.
    expectTypeOf<Checks[number]>().toEqualTypeOf<true>();
  });
});
