import { bootstrapApplication } from '@angular/platform-browser';
import { toApplicationConfig } from '@craft-ng/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, toApplicationConfig(appConfig)).catch((err) =>
  console.error(err),
);
