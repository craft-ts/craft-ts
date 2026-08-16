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

function isDestroyedHost(host: object): boolean {
  return (
    'destroyed' in host && (host as { destroyed?: boolean }).destroyed === true
  );
}

ɵsetCraftHostInjectorRunner((host, fn) => {
  // Lingering Craft work (demo traces, async loaders) can resume after the
  // Angular host injector is gone. Entering `runInInjectionContext` then
  // throws NG0205; run the callback in Craft's own context instead.
  if (isDestroyedHost(host)) {
    return fn();
  }
  return runInInjectionContext(host as AngularInjector, fn);
});

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
