import {
  bootstrapCraft,
  provideCraftRootComponent,
  type CraftAppRef,
} from '@craft-ts/component';
import {
  craftAppConfig,
  craftUse,
  ɵrunInInjectionContext,
} from '@craft-ts/core';
import { begin, installHandlers } from '../page-common.js';
import { App, page } from './app.js';
import { Page } from './store.js';

let app: CraftAppRef | undefined;

function mountApp() {
  app = bootstrapCraft({
    host: document.getElementById('mount')!,
    mode: 'production',
    config: craftAppConfig({ providers: [provideCraftRootComponent(App)] }),
  });
}

begin();
installHandlers({
  update: (action: string) =>
    ɵrunInInjectionContext(page.injector!, () =>
      craftUse(Page.model.dispatch(action)),
    ),
  remount: () => {
    app!.destroy();
    mountApp();
  },
});
mountApp();
