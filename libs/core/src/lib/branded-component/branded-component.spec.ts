import {
  signal as craftSignal,
} from '../host/craft-compat';
import { Equal, Expect } from 'test-type';
import { describe, expectTypeOf, it } from 'vitest';
import {
  craftService,
  type ExtractServiceHelperDependencies,
  type GetServiceDependencies,
  type GetServiceOutput,
} from '../craft-service';
import type {
  DerivedService,
  ExtractDeps,
  GetDeps,
  GetPublicComponentProperties,
} from './branded-component';

describe('GetDeps', () => {
  it('computes missing providers from requirement-scoped service deps', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

    type CounterDependency = GetServiceDependencies<
      typeof Counter
    >;
    type ComponentDeps = GetDeps<{
      deps: {
        Counter: CounterDependency;
      };
      provided: {};
    }>;

    expectTypeOf<ComponentDeps>().toEqualTypeOf<{
      deps: {
        Counter: CounterDependency;
      };
      provided: {};
      missingProvider: {
        Counter: CounterDependency;
      };
    }>();
  });

  it('removes provided keys from derived service missing providers', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      () => ({
        increment: () => 1,
        decrement: () => 0,
      }),
    );

    type CounterDependency = DerivedService<
      GetServiceDependencies<typeof Counter>,
      {
        derivedPropertiesUsed: {
          increment: GetServiceOutput<typeof Counter>['increment'];
          decrement: GetServiceOutput<typeof Counter>['decrement'];
        };
        derivedPropertiesExposed: {
          increment: GetServiceOutput<typeof Counter>['increment'];
        };
      }
    >;

    type ComponentDeps = GetDeps<{
      deps: {
        Counter: CounterDependency;
      };
      provided: {
        Counter: unknown;
      };
    }>;

    expectTypeOf<ComponentDeps>().toEqualTypeOf<{
      deps: {
        Counter: CounterDependency;
      };
      provided: {
        Counter: unknown;
      };
      missingProvider: {};
    }>();
  });

  it('keeps an empty missingProvider map when there is nothing to provide', () => {
    type ComponentDeps = GetDeps<{
      deps: {
        CommonModule: CommonModule;
      };
      provided: {};
    }>;

    expectTypeOf<ComponentDeps>().toEqualTypeOf<{
      deps: {
        CommonModule: CommonModule;
      };
      provided: {};
      missingProvider: {};
    }>();
  });

  it('ignores child component GenDeps when their missingProvider map is empty', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

        class StatusComponent {}

    class HttpClient {}

    type CounterDependency = GetServiceDependencies<
      typeof Counter
    >;
    type StatusDeps = GetDeps<{
      deps: {
        CommonModule: CommonModule;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<StatusComponent>;
    }>;

    type ParentDeps = GetDeps<{
      deps: {
        CommonModule: CommonModule;
        GenDeps_StatusComponent: StatusDeps;
        Counter: CounterDependency;
      };
      provided: {
        Counter: unknown;
      };
      missingProvider: {
        HttpClient: HttpClient;
      };
    }>;

    expectTypeOf<ParentDeps['missingProvider']>().toEqualTypeOf<{
      HttpClient: HttpClient;
    }>();
  });

  it('flattens child component missing providers into the parent map', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

        class StatusComponent {}

    class HttpClient {}

    type CounterDependency = GetServiceDependencies<
      typeof Counter
    >;
    type StatusDeps = GetDeps<{
      deps: {
        Counter: CounterDependency;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<StatusComponent>;
    }>;

    type ParentDeps = GetDeps<{
      deps: {
        CommonModule: CommonModule;
        GenDeps_StatusComponent: StatusDeps;
      };
      provided: {};
      missingProvider: {
        HttpClient: HttpClient;
      };
    }>;

    expectTypeOf<ParentDeps['missingProvider']>().toEqualTypeOf<{
      Counter: CounterDependency;
      HttpClient: HttpClient;
    }>();
  });

  it('keeps transitive service missing providers flat at the top level', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

    const { CounterExtended } = craftService(
      { name: 'CounterExtended', providedIn: 'toProvide' },
      function* () {
        yield* Counter();

        return {
          increment: () => 2,
        };
      },
    );

    type CounterDependency = GetServiceDependencies<
      typeof Counter
    >;
    type CounterExtendedDependency = GetServiceDependencies<
      typeof CounterExtended
    >;
    type ComponentDeps = GetDeps<{
      deps: {
        CounterExtended: CounterExtendedDependency;
      };
      provided: {};
    }>;

    expectTypeOf<ComponentDeps['missingProvider']>().toEqualTypeOf<{
      CounterExtended: CounterExtendedDependency;
      Counter: CounterDependency;
    }>();
  });

  it('extracts tracked helper dependencies through ExtractDeps', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

    expectTypeOf<ExtractDeps<typeof Counter>>().toEqualTypeOf<{
      Counter: ExtractServiceHelperDependencies<typeof Counter>;
    }>();
  });

  it('merges propertiesDeps into missingProvider computation', () => {
    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

    type CounterDependency = GetServiceDependencies<
      typeof Counter
    >;
    type CounterDependencyMap = ExtractDeps<typeof Counter>;
    type ComponentDeps = GetDeps<{
      deps: {
        CommonModule: CommonModule;
      };
      propertiesDeps: {
        counter: CounterDependencyMap;
        label: ExtractDeps<string>;
      };
      provided: {};
    }>;

    type ExpectedPropertiesDeps = {
      counter: CounterDependencyMap;
      label: {};
    };
    type _PropertiesDeps = Expect<
      ComponentDeps['propertiesDeps'] extends ExpectedPropertiesDeps
        ? true
        : false
    >;
    type _MissingProvider = Expect<
      ComponentDeps['missingProvider']['Counter'] extends CounterDependency
        ? true
        : false
    >;
  });

  it('keeps transitive missing providers from function-scoped property deps', () => {
    const { B } = craftService(
      { name: 'B', providedIn: 'toProvide' },
      () => ({
        read: () => 'service-b',
      }),
    );

    const { Counter } = craftService(
      { name: 'Counter', providedIn: 'function' },
      function* () {
        const b = yield* B();

        return {
          read: () => b.read(),
        };
      },
    );

    type BDependency = GetServiceDependencies<typeof B>;
    type ComponentDeps = GetDeps<{
      deps: {
        CommonModule: CommonModule;
      };
      propertiesDeps: {
        counter: ExtractDeps<typeof Counter>;
      };
      provided: {};
    }>;

    expectTypeOf<ComponentDeps['missingProvider']>().toEqualTypeOf<{
      B: BDependency;
    }>();
  });
});

describe('GetPublicComponentProperties', () => {
  it('extracts only input signals from the public component instance surface', () => {
        class LoginFormComponent {
      readonly userId = input<string>();
      readonly userMandatoryId = craftSignal<string>(undefined as never);
      protected readonly protectedField = 'protected';
      private readonly privateField = 'private';

      submit() {
        return true;
      }
    }

    type PublicProperties = GetPublicComponentProperties<
      typeof LoginFormComponent
    >;

    expectTypeOf<keyof PublicProperties>().toEqualTypeOf<
      'userId' | 'userMandatoryId'
    >();

    expectTypeOf<ReturnType<PublicProperties['userId']>>().toEqualTypeOf<
      string | undefined
    >();

    expectTypeOf<
      ReturnType<PublicProperties['userMandatoryId']>
    >().toEqualTypeOf<string>();
  });

  it('accepts an instance type directly', () => {
        class LoginFormComponent {
      readonly userId = input<string>();
      readonly userMandatoryId = craftSignal<string>(undefined as never);
    }

    type PublicProperties = GetPublicComponentProperties<LoginFormComponent>;

    expectTypeOf<ReturnType<PublicProperties['userId']>>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<
      ReturnType<PublicProperties['userMandatoryId']>
    >().toEqualTypeOf<string>();
  });

  it('strips internal InputSignal brand symbols — input properties are exposed as plain callables', () => {
        class SignalComponent {
      readonly label = input<string>();
      readonly count = craftSignal<number>(undefined as never);
    }

    type PublicProperties = GetPublicComponentProperties<
      typeof SignalComponent
    >;

    // Each input is exposed as a plain callable, not as InputSignal
    expectTypeOf<PublicProperties['label']>().toEqualTypeOf<
      () => string | undefined
    >();
    expectTypeOf<PublicProperties['count']>().toEqualTypeOf<() => number>();

    // The branded symbol keys from InputSignal are not present
    expectTypeOf<keyof PublicProperties>().toEqualTypeOf<'label' | 'count'>();
  });

  it('omits non-signal public members', () => {
        class MixedComponent {
      readonly value = input<boolean>();
      compute(): string {
        return 'result';
      }
    }

    type PublicProperties = GetPublicComponentProperties<typeof MixedComponent>;

    expectTypeOf<keyof PublicProperties>().toEqualTypeOf<'value'>();
    expectTypeOf<PublicProperties['value']>().toEqualTypeOf<
      () => boolean | undefined
    >();
  });
});
