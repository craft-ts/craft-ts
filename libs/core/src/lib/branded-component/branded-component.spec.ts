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
    }>();
  });

  it('merges child missing providers with explicit local missing providers', () => {
    const { injectCounter } = craftService(
      { name: 'Counter', scope: 'toProvide' },
      () => ({
        increment: () => 1,
      }),
    );

    class HttpClient {}

    type CounterDependency = GetInjectedServiceDependencies<
      typeof injectCounter
    >;
    type ChildDeps = GetDeps<{
      deps: {
        Counter: CounterDependency;
      };
      provided: {};
    }>;

    type ParentDeps = GetDeps<{
      deps: {
        Child: ChildDeps;
      };
      provided: {};
      missingProvider: {
        HttpClient: HttpClient;
      };
    }>;

    type Result = ParentDeps['missingProvider'];

    expectTypeOf<Result>().toEqualTypeOf<{
      Counter: CounterDependency;
      HttpClient: HttpClient;
    }>();

    expectTypeOf<Omit<ParentDeps, 'missingProvider'>>().toEqualTypeOf<{
      deps: {
        Child: ChildDeps;
      };
      provided: {};
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
