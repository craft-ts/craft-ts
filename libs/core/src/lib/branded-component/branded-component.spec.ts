import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { describe, expectTypeOf, it } from 'vitest';
import {
  craftService,
  type GetInjectedServiceDependencies,
  type GetServiceOutput,
} from '../craft-service';
import type {
  DerivedService,
  GetDeps,
  GetPublicComponentProperties,
} from './branded-component';

describe('GetDeps', () => {
  it('computes missing providers from requirement-scoped service deps', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

    type CounterDependency = GetInjectedServiceDependencies<
      typeof injectCounter
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
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => ({
        increment: () => 1,
        decrement: () => 0,
      }),
    );

    type CounterDependency = DerivedService<
      GetInjectedServiceDependencies<typeof injectCounter>,
      {
        derivedPropertiesUsed: {
          increment: GetServiceOutput<typeof injectCounter>['increment'];
          decrement: GetServiceOutput<typeof injectCounter>['decrement'];
        };
        derivedPropertiesExposed: {
          increment: GetServiceOutput<typeof injectCounter>['increment'];
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
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

    @Component({
      selector: 'lib-status',
      template: ` Status `,
    })
    class StatusComponent {}

    class HttpClient {}

    type CounterDependency = GetInjectedServiceDependencies<
      typeof injectCounter
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
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

    @Component({
      selector: 'lib-status',
      template: ` Status `,
    })
    class StatusComponent {}

    class HttpClient {}

    type CounterDependency = GetInjectedServiceDependencies<
      typeof injectCounter
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
    const { CounterToYield, injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

    const { injectCounterExtended } = craftService(
      { name: 'CounterExtended', scope: 'toProvide' },
      function* () {
        yield* CounterToYield();

        return {
          increment: () => 2,
        };
      },
    );

    type CounterDependency = GetInjectedServiceDependencies<
      typeof injectCounter
    >;
    type CounterExtendedDependency = GetInjectedServiceDependencies<
      typeof injectCounterExtended
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
});

describe('GetPublicComponentProperties', () => {
  it('extracts only the public component instance surface', () => {
    @Component({
      selector: 'lib-login-form',
      template: ` Login Form `,
    })
    class LoginFormComponent {
      readonly userId = input<string>();
      readonly userMandatoryId = input.required<string>();
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
      'userId' | 'userMandatoryId' | 'submit'
    >();

    expectTypeOf<ReturnType<PublicProperties['userId']>>().toEqualTypeOf<
      string | undefined
    >();

    expectTypeOf<
      ReturnType<PublicProperties['userMandatoryId']>
    >().toEqualTypeOf<string>();

    expectTypeOf<
      ReturnType<PublicProperties['submit']>
    >().toEqualTypeOf<boolean>();
  });

  it('accepts an instance type directly', () => {
    @Component({
      selector: 'lib-login-form',
      template: ` Login Form `,
    })
    class LoginFormComponent {
      readonly userId = input<string>();
      readonly userMandatoryId = input.required<string>();
    }

    type PublicProperties = GetPublicComponentProperties<LoginFormComponent>;

    expectTypeOf<ReturnType<PublicProperties['userId']>>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<
      ReturnType<PublicProperties['userMandatoryId']>
    >().toEqualTypeOf<string>();
  });
});
