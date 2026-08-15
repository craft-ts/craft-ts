import '@angular/compiler';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  Injector,
  type Provider,
  runInInjectionContext,
  ɵINJECTOR_SCOPE,
} from '@angular/core';
import { describe, expect, it } from 'vitest';
import { COMPONENT_REGISTER, createComponentRegister } from './component-register';
import { HOST_TAG_LIST, HostName, provideHostName } from './host-tag';
import { ɵcraftInjectorFromHost } from './host/angular-craft-injector-host';
import { craftUse } from './craft-use';

function createHostInjector(providers: Provider[] = []) {
  const environmentInjector = createEnvironmentInjector(
    [
      { provide: ɵINJECTOR_SCOPE, useValue: 'root' },
      {
        provide: COMPONENT_REGISTER as never,
        useValue: createComponentRegister(),
      },
      ...providers,
    ],
    Injector.NULL as EnvironmentInjector,
    'host-tag-spec',
  );
  return ɵcraftInjectorFromHost(environmentInjector);
}

describe('host tags', () => {
  it('should provide HostName through the exported craftService helpers', () => {
    createHostInjector([provideHostName('A')]).run(() => {
      expect(craftUse(HostName())).toBe('A');
      expect(inject(HOST_TAG_LIST)).toEqual(['A#1']);
    });
  });

  it('should append nested host names in parent-to-child order', () => {
    const rootInjector = createHostInjector();
    rootInjector.run(() => {
      const parentInjector = createEnvironmentInjector(
        [provideHostName('A')],
        inject(EnvironmentInjector),
      );
      const childInjector = createEnvironmentInjector(
        [provideHostName('B')],
        parentInjector,
      );

      runInInjectionContext(childInjector, () => {
        expect(craftUse(HostName())).toBe('B');
        expect(inject(HOST_TAG_LIST)).toEqual(['A#1', 'B#2']);
      });
    });
  });

  it('should default the host tag list to an empty array', () => {
    createHostInjector().run(() => {
      expect(inject(HOST_TAG_LIST)).toEqual([]);
    });
  });
});
