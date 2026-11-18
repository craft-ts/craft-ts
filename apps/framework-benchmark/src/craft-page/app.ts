import {
  craftComponent,
  div,
  main,
} from '@craft-ts/component';
import { ɵInjector, ɵinject, type CraftInjector } from '@craft-ts/core';
import { cx } from '../page-common.js';
import { ActivityFeed } from './feed.js';
import { FormSection } from './form.js';
import { Footer } from './footer.js';
import { Header } from './header.js';
import { Sidebar } from './sidebar.js';
import { PageTitle, StatsRow } from './stats.js';
import { Page, CurrentUser, providePage, provideCurrentUser } from './store.js';
import { DataTable, Toolbar } from './table.js';
import { TabsPanel } from './board.js';

/** Where the benchmark's hidden controls reach the page's own injector. */
export const page: { injector?: CraftInjector } = {};

const MainArea = craftComponent('MainArea', {}, () =>
  main({ class: 'main' }, [
    PageTitle({}),
    StatsRow({}),
    div({ class: 'content-grid' }, [
      div({ class: 'content-grid__main' }, [
        Toolbar({}),
        DataTable({}),
        TabsPanel({}),
      ]),
      div({ class: 'content-grid__side' }, [ActivityFeed({})]),
    ]),
    FormSection({}),
  ]),
);

export const App = craftComponent(
  'App',
  { providers: [providePage(), provideCurrentUser()] },
  () => {
    page.injector = ɵinject(ɵInjector);
    return div(
      {
        class: function* () {
          return cx('app', (yield* Page.isDark()) && 'is-dark');
        },
        'data-page-root': '',
        'data-revision': Page.revision,
      },
      [Header({}), div({ class: 'layout' }, [Sidebar({}), MainArea({})]), Footer({})],
    );
  },
);

void CurrentUser;
