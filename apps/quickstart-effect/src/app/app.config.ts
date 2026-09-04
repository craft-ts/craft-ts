import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideAppInitializer,
  provideCraftDevTools,
  type AppProvidedDependencyValuesOf,
  type CanRun,
} from '@craft-ts/core';
import {
  installCraftEffectBridge,
  provideLayer,
  type EffectRequirementsCheckedDI,
} from '@craft-ts/effect';
import type { Effect } from 'effect';
import QuickstartTaskPage from './task-page';
import {
  loadTask,
  TaskRepositoryLive,
} from './task-domain';

const developmentProviders = import.meta.env.DEV ? provideCraftDevTools() : [];

export const appConfig = craftAppConfig({
  providers: [
    ...developmentProviders,
    provideCraftRootComponent(QuickstartTaskPage),
    provideLayer(TaskRepositoryLive),
    provideAppInitializer(() => {
      installCraftEffectBridge();
    }),
  ],
});

export type AppProvidedEffectServices = AppProvidedDependencyValuesOf<
  typeof appConfig
>;

type _CheckLoadTaskRequirements = EffectRequirementsCheckedDI<
  Effect.Services<ReturnType<typeof loadTask>>,
  AppProvidedEffectServices
>;
type _CanRunLoadTask = CanRun<_CheckLoadTaskRequirements>;
