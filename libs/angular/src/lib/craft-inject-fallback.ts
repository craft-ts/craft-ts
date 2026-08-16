import {
  DestroyRef as AngularDestroyRef,
  inject as angularInject,
  Injector as AngularInjector,
  isDevMode as angularIsDevMode,
} from '@angular/core';
import {
  DestroyRef,
  Injector,
  ɵcraftInjectorFromHost,
  ɵsetCraftDevMode,
  ɵsetCraftInjectFallback,
} from '@craft-ng/core';

ɵsetCraftDevMode(angularIsDevMode());

ɵsetCraftInjectFallback((token, options) => {
  if (token === Injector) {
    return ɵcraftInjectorFromHost(angularInject(AngularInjector));
  }
  if (token === DestroyRef) {
    return angularInject(AngularDestroyRef, options);
  }
  return angularInject(token as never, options);
});
