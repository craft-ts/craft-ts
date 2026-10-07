import 'virtual:craft-style.css';
import { bootstrapCraft, provideCraftRootComponent } from '@craft-ts/component';
import { craftAppConfig } from '@craft-ts/core';
import { Preview } from './preview.ts';

/**
 * A development harness, not part of the package: it mounts the components of
 * `docs-ui` in a browser so they can be compared with the mock-up, in light and
 * in dark. `?page=guide|home|404|gallery` picks the page.
 */
bootstrapCraft({
  config: craftAppConfig({ providers: [provideCraftRootComponent(Preview)] }),
  mode: 'development',
});
