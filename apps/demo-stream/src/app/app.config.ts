import { provideCraftRootComponent } from '@craft-ts/component';
import {
  craftAppConfig,
  provideCorrelationIdTracking,
  provideTakeAppSnapshot,
} from '@craft-ts/core';
import StreamDemo from './stream-demo';
import { provideDemoStreamTrace } from './trace-log';

export const appConfig = craftAppConfig({
  providers: [
    provideCorrelationIdTracking(),
    provideDemoStreamTrace(),
    // eslint-disable-next-line craft-ts/prefer-browser-boundaries
    provideTakeAppSnapshot((reports) => console.warn('App snapshot:', reports)),
    provideCraftRootComponent(StreamDemo),
  ],
});
