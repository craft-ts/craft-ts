import { runInInjectionContext, type Injector } from '@angular/core';
import {
  ɵcreateCraftInjectorFromHost,
  type CraftInjector,
} from './craft-injector';

export function ɵcraftInjectorFromHost(hostInjector: object): CraftInjector {
  const angularInjector = hostInjector as Injector;
  return ɵcreateCraftInjectorFromHost(hostInjector, (fn) =>
    runInInjectionContext(angularInjector, fn),
  );
}
