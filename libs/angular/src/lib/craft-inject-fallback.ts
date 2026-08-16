import {
  DestroyRef as AngularDestroyRef,
  inject as angularInject,
  Injector as AngularInjector,
} from '@angular/core';
import {
  DestroyRef,
  Injector,
  ɵcraftInjectorFromHost,
  ɵsetCraftInjectFallback,
} from '@craft-ng/core';

ɵsetCraftInjectFallback((token, options) => {
  if (token === Injector) {
    return ɵcraftInjectorFromHost(angularInject(AngularInjector));
  }
  if (token === DestroyRef) {
    return angularInject(AngularDestroyRef, options);
  }
  return angularInject(token as never, options);
});
