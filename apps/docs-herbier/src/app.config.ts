import { provideCraftRootComponent } from '@craft-ts/component';
import { craftAppConfig } from '@craft-ts/core';
import { DocsRoot } from './root.ts';

/** One configuration for the server and the browser: the page arrives as props. */
export const appConfig = craftAppConfig({
  providers: [provideCraftRootComponent(DocsRoot)],
});
