import {
  DestroyRef as AngularDestroyRef,
  ElementRef as AngularElementRef,
  inject as angularInject,
  Injector as AngularInjector,
  isDevMode as angularIsDevMode,
  runInInjectionContext,
} from '@angular/core';
import {
  DestroyRef,
  Injector,
  ɵcraftInjectorFromHost,
  ɵElementRef,
  ɵregisterCraftTokenHostToken,
  ɵsetCraftDevMode,
  ɵsetCraftHostInjectorRunner,
  ɵsetCraftInjectFallback,
} from '@craft-ng/core';

ɵsetCraftDevMode(angularIsDevMode());

ɵregisterCraftTokenHostToken(DestroyRef, AngularDestroyRef);
ɵregisterCraftTokenHostToken(ɵElementRef, AngularElementRef);

ɵsetCraftHostInjectorRunner((host, fn) =>
  runInInjectionContext(host as AngularInjector, fn),
);

ɵsetCraftInjectFallback((token, options) => {
  if (token === Injector) {
    return ɵcraftInjectorFromHost(angularInject(AngularInjector));
  }
  if (token === DestroyRef) {
    return angularInject(AngularDestroyRef, options);
  }
  return angularInject(token as never, options);
});
