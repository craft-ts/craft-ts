import {
  inject,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import {
  ɵcreateCraftInjectorFromHost,
  type CraftToken,
} from '@craft-ng/core';

export function injectCraft<T>(token: CraftToken<T> | object): T {
  const injector = inject(Injector);
  return ɵcreateCraftInjectorFromHost(injector, (fn) =>
    runInInjectionContext(injector, fn),
  ).get(token as CraftToken<T>);
}
