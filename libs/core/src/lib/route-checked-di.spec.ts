import { craftUse } from './craft-use';
import { craftService, GetServiceDependencies } from './craft-service';
import {
  GetDeps,
  type EmptyComponentDependencies,
  type UnknownComponentDependencies,
} from './branded-component/branded-component';
import type { CanRun } from './app-checked-di';
import type { RouteCheckedDI } from './route-checked-di';

describe('RouteCheckedDI', () => {
  it('should return true if all deps are provided via AvailableProviderNames', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    type TestDeps_MyComp = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    type CHECK = RouteCheckedDI<TestDeps_MyComp, 'Counter'>;

    expectTypeOf<CHECK>().toEqualTypeOf<true>();
    // Constraint check: CanRun<CHECK> must satisfy `extends true`.
    expectTypeOf<CanRun<CHECK>>().toEqualTypeOf<true>();
  });

  it('should report a missing injected service when not in AvailableProviderNames', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    type TestDeps_MyComp = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    // Pass an empty union — Counter remains unresolved.
    type CHECK = RouteCheckedDI<TestDeps_MyComp, never>;

    expectTypeOf<CHECK>().toEqualTypeOf<
      ['The Counter service is not provided in this component']
    >();
  });

  it('should fail closed when AvailableProviderNames widens to string', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    type TestDeps_MyComp = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    type CHECK = RouteCheckedDI<TestDeps_MyComp, string>;

    expectTypeOf<CHECK>().toEqualTypeOf<[
      'Available provider names widened to string; type-safe DI validation is unavailable',
    ]>();
  });

  it('should fail closed when the component contract degraded to any', () => {
    type Uncomputable = [
      'The component dependency contract could not be computed; type-safe DI validation is unavailable',
    ];

    // A contract TypeScript gave up on (TS2589) must not turn the proof into
    // `any[]`, which any hand-written list of expected errors satisfies.
    expectTypeOf<
      RouteCheckedDI<any, 'Counter'>
    >().toEqualTypeOf<Uncomputable>();
    expectTypeOf<
      RouteCheckedDI<
        {
          deps: Record<never, never>;
          provided: Record<never, never>;
          publicProperties: Record<never, never>;
          missingProvider: any;
        },
        'Counter'
      >
    >().toEqualTypeOf<Uncomputable>();
    type UncomputableProof = RouteCheckedDI<any, 'Counter'>;
    // @ts-expect-error an uncomputable contract is never a proof.
    type _CannotRun = CanRun<UncomputableProof>;
  });

  it('should fail closed when a missing provider entry is any', () => {
    // `any extends ProvidedValues` holds whatever was provided: the entry used
    // to vanish from the list and the proof read `true`.
    type Contract = {
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: { Counter: any };
    };
    expectTypeOf<RouteCheckedDI<Contract, 'Other'>>().toEqualTypeOf<
      [
        'The component dependency contract could not be computed; type-safe DI validation is unavailable',
      ]
    >();
  });

  it('should fail closed when the missing provider map has an index signature', () => {
    // What a component whose service does not compile ends up with: a map
    // that names no provider, and used to let a hand-written list pass.
    type Contract = {
      deps: {};
      provided: {};
      publicProperties: {};
      missingProvider: { [name: string]: any };
    };
    expectTypeOf<RouteCheckedDI<Contract, 'Other'>>().toEqualTypeOf<
      [
        'The component dependency contract could not be computed; type-safe DI validation is unavailable',
      ]
    >();
  });

  it('should fail closed when the checked value is not a contract', () => {
    type NotAContract = [
      'The value checked is not a component dependency contract (no deps, no missingProvider); pass ComponentDepsOf<typeof Component>',
    ];
    expectTypeOf<RouteCheckedDI<{}, 'Other'>>().toEqualTypeOf<NotAContract>();
    expectTypeOf<
      RouteCheckedDI<Record<never, never>, 'Other'>
    >().toEqualTypeOf<NotAContract>();
  });

  it('should fail closed when the contract is the unknown contract', () => {
    expectTypeOf<
      RouteCheckedDI<UnknownComponentDependencies, 'Other', never, 'Shell'>
    >().toEqualTypeOf<
      [
        'The dependency contract of a component rendered in Shell is unknown: the value is not a component, or a component was typed by hand. Pass the component itself to ComponentDepsOf, and seal a component with sealComponent(Component) instead of typing it',
      ]
    >();
    expectTypeOf<
      RouteCheckedDI<EmptyComponentDependencies, 'Other'>
    >().toEqualTypeOf<true>();
  });

  it('should fail closed when provided values or input names widen', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );
    type Contract = GetDeps<{
      deps: { Counter: GetServiceDependencies<typeof Counter> };
      provided: {};
      publicProperties: { userId: () => string };
    }>;
    type WidenedValues = [
      'Provided values widened to any or unknown; type-safe DI validation is unavailable',
    ];
    // Every missing provider is assignable to `unknown`: all of them used to
    // be discharged.
    expectTypeOf<
      RouteCheckedDI<Contract, never, unknown>
    >().toEqualTypeOf<WidenedValues>();
    expectTypeOf<
      RouteCheckedDI<Contract, never, any>
    >().toEqualTypeOf<WidenedValues>();
    expectTypeOf<
      RouteCheckedDI<Contract, 'Counter', never, 'this component', string>
    >().toEqualTypeOf<
      [
        'Available input names widened to string; type-safe DI validation is unavailable',
      ]
    >();
  });

  it('should report a missing input from publicProperties', () => {
    type TestDeps_MyComp = GetDeps<{
      deps: {};
      provided: {};
      publicProperties: {
        userId: () => string;
      };
    }>;

    type CHECK = RouteCheckedDI<TestDeps_MyComp, never>;

    expectTypeOf<CHECK>().toEqualTypeOf<
      ['Input "userId" is not provided in this component']
    >();
  });

  it('should resolve a missing service when a structurally matching ProvidedValue is supplied', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    type CounterDep = GetServiceDependencies<typeof Counter>;

    type TestDeps_MyComp = GetDeps<{
      deps: {
        Counter: CounterDep;
      };
      provided: {};
      publicProperties: {};
    }>;

    // No name match, but the value type matches via ProvidedValues — should resolve.
    type CHECK = RouteCheckedDI<TestDeps_MyComp, never, CounterDep>;

    expectTypeOf<CHECK>().toEqualTypeOf<true>();
  });

  it('should accept a custom Context for clearer error messages', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    type TestDeps_MyComp = GetDeps<{
      deps: {
        Counter: GetServiceDependencies<typeof Counter>;
      };
      provided: {};
      publicProperties: {};
    }>;

    type CHECK = RouteCheckedDI<TestDeps_MyComp, never, never, 'MyComponent'>;

    expectTypeOf<CHECK>().toEqualTypeOf<
      ['The Counter service is not provided in MyComponent']
    >();
  });

  it('should fail when a component-provided service is removed (generator cascade pattern)', () => {
    // Mirrors the generator's emitted shape: route file exposes a cumulative
    // union of names (app + route), and the cascade check unions it with the
    // names DERIVED from the component's `GenDeps.provided`. If a provider is
    // dropped from `@Component.providers` AND the `legacy dependency synchronization`
    // ESLint rule has synced `GenDeps.provided` (i.e. the service is removed
    // from `provided`), the cascade check must surface the error.
    const { GlobalSvc } = craftService(
      { name: 'GlobalSvc', providedIn: 'global' },
      function* () {
        // Nothing to expose.
      },
    );
    const { RouteSvc } = craftService(
      { name: 'RouteSvc', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );
    const { CompSvc } = craftService(
      { name: 'CompSvc', providedIn: 'toProvide' },
      function* () {
        // Nothing to expose.
      },
    );

    type RouteProvidedNames = 'RouteSvc';

    // ----- Case A: component PROPERLY provides CompSvc — cascade passes. -----
    type TestDeps_Ok = GetDeps<{
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
      | Extract<keyof TestDeps_Ok['provided'], string>;
    type CHECK_OK = RouteCheckedDI<
      TestDeps_Ok,
      OkProvidedNames,
      never,
      'OkComp'
    >;
    expectTypeOf<CHECK_OK>().toEqualTypeOf<true>();
    expectTypeOf<CanRun<CHECK_OK>>().toEqualTypeOf<true>();

    // ----- Case B: GenDeps.provided no longer lists CompSvc (the user
    // removed the provider from @Component.providers AND ESLint synced the
    // GenDeps). The cascade check must now report CompSvc as missing.
    type TestDeps_Broken = GetDeps<{
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
      | Extract<keyof TestDeps_Broken['provided'], string>;
    type CHECK_BROKEN = RouteCheckedDI<
      TestDeps_Broken,
      BrokenProvidedNames,
      never,
      'BrokenComp'
    >;

    expectTypeOf<CHECK_BROKEN>().toEqualTypeOf<
      ['The CompSvc service is not provided in BrokenComp']
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
    const { S } = craftService({ name: 'S', providedIn: 'toProvide' }, function* () {
      // Nothing to expose.
    });

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
