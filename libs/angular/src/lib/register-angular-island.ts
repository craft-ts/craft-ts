import {
  computed,
  createEnvironmentInjector,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  inject,
  Injector,
  provideZonelessChangeDetection,
  reflectComponentType,
  runInInjectionContext,
  signal,
  untracked,
  ɵEffectScheduler,
  ɵINJECTOR_SCOPE,
} from '@angular/core';
import { ɵregisterAngularIsland } from '@craft-ng/component';
import { AngularMount, CraftAngularDirectiveHost } from './angular';

ɵregisterAngularIsland({
  computed,
  createEnvironmentInjector,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  Injector,
  inject,
  provideZonelessChangeDetection,
  reflectComponentType,
  runInInjectionContext,
  signal,
  untracked,
  ɵEffectScheduler,
  ɵINJECTOR_SCOPE,
  AngularMount,
  CraftAngularDirectiveHost,
});
