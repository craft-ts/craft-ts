import { bootstrapApplication } from '@angular/platform-browser';
import { toApplicationConfig, AppCheckedDI, CanRun } from '@craft-ng/core';
import { appConfig } from './app/app.config';
import { App, GenDeps_App } from './app/app';

bootstrapApplication(App, toApplicationConfig(appConfig)).catch((err) =>
  console.error(err),
);

type CheckAppDI = AppCheckedDI<
  GenDeps_App,
  typeof appConfig.APP_CONFIG_META_DATA
>;
type _CanRun = CanRun<CheckAppDI>;
