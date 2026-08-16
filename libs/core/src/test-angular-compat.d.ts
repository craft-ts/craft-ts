import type { InjectionToken as CraftInjectionToken } from './lib/host/craft-compat';
import type { CraftToken } from './lib/host/craft-injector';

declare module '@angular/core' {
  function inject<T>(token: CraftInjectionToken<T> | CraftToken<T> | object): T;
}

declare module '@angular/core/testing' {
  interface TestBedStatic {
    inject<T>(token: CraftInjectionToken<T> | CraftToken<T> | object): T;
  }
}
