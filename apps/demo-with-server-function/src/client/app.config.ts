import { provideCraftRootComponent } from '@craft-ts/component';
import { craftAppConfig } from '@craft-ts/core';
import { ServerFunctionDemo } from './server-function-demo';

export const appConfig = craftAppConfig({
  routingDeps: [],
  providers: [provideCraftRootComponent(ServerFunctionDemo)],
});
