import { cx } from '../../page-common.js';
import { ActivityFeed } from './feed.js';
import { FormSection } from './form.js';
import { Footer } from './footer.js';
import { Header } from './header.js';
import { Sidebar } from './sidebar.js';
import { PageTitle, StatsRow } from './stats.js';
import {
  CurrentUserProvider,
  PageProvider,
  createCurrentUser,
  createPage,
  type Page,
} from './store.js';
import { DataTable, Toolbar } from './table.js';
import { TabsPanel } from './board.js';

/** Where the benchmark's hidden controls reach the page that is mounted. */
export const mounted: { page?: Page } = {};

function MainArea() {
  return (
    <main class="main">
      <PageTitle />
      <StatsRow />
      <div class="content-grid">
        <div class="content-grid__main">
          <Toolbar />
          <DataTable />
          <TabsPanel />
        </div>
        <div class="content-grid__side">
          <ActivityFeed />
        </div>
      </div>
      <FormSection />
    </main>
  );
}

export function App() {
  const page = createPage();
  const user = createCurrentUser();
  mounted.page = page;
  return (
    <PageProvider value={page}>
      <CurrentUserProvider value={user}>
        <div
          class={cx('app', page.isDark() && 'is-dark')}
          data-page-root=""
          data-revision={page.model.revision}
        >
          <Header />
          <div class="layout">
            <Sidebar />
            <MainArea />
          </div>
          <Footer />
        </div>
      </CurrentUserProvider>
    </PageProvider>
  );
}
