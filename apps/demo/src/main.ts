import { bootstrapApplication } from '@angular/platform-browser';
import { toApplicationConfig } from '@craft-ng/core';
import { appConfig } from './app/app.config';
import { CraftRootComponentHost } from '@craft-ng/angular';

bootstrapApplication(
  CraftRootComponentHost,
  toApplicationConfig(appConfig),
).catch((err) =>
  // eslint-disable-next-line craft-ng/prefer-browser-boundaries
  console.error(err),
);
