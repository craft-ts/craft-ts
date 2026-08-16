import {
  DestroyRef as AngularDestroyRef,
  ElementRef as AngularElementRef,
  inject as angularInject,
  Injector as AngularInjector,
  isDevMode as angularIsDevMode,
  runInInjectionContext,
} from '@angular/core';
import { ActivatedRoute as AngularActivatedRoute } from '@angular/router';
import {
  ActivatedRoute,
  ɵDestroyRef as DestroyRef,
  ɵInjector as Injector,
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
ɵregisterCraftTokenHostToken(ActivatedRoute, AngularActivatedRoute);

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
  if (token === ActivatedRoute) {
    return angularInject(AngularActivatedRoute, options);
  }
  return angularInject(token as never, options);
});
