import {
  batch,
  createContext,
  createMemo,
  createSignal,
  useContext,
} from 'solid-js';
import { createStore, reconcile, unwrap } from 'solid-js/store';
import {
  CURRENT_USER,
  groupTasks,
  makeModel,
  pageSummary,
  reduce,
  startRevision,
  statusCounts,
  stats,
  unreadSummary,
  visibleRows,
} from '../../page-common.js';

/**
 * The page's shared state: a store reconciled by id from the pure reducer
 * (the same one craft-ts uses), and memos for what is derived from several
 * fields. A plain field is read straight from the store.
 */
export function createPage() {
  const [model, setModel] = createStore(makeModel(startRevision()));
  const dispatch = (action: any) =>
    batch(() =>
      setModel(reconcile(reduce(unwrap(model), action), { key: 'id' })),
    );
  const rows = createMemo(() =>
    visibleRows(model.people, model.status, model.sortKey, model.sortDir),
  );
  return {
    model,
    dispatch,
    isDark: () => model.theme === 'dark',
    rows,
    noRows: () => rows().length === 0,
    summary: createMemo(() => pageSummary(rows().length, model.people.length)),
    statusCounts: createMemo(() => statusCounts(model.people)),
    stats: createMemo(() => stats(model.people, model.tasks, model.unread)),
    tasksByColumn: createMemo(() => groupTasks(model.tasks)),
    unreadSummary: () => unreadSummary(model.unread),
  };
}
export type Page = ReturnType<typeof createPage>;

const PageContext = createContext<Page>();
export const PageProvider = PageContext.Provider;
export const usePage = () => useContext(PageContext)!;

/** The signed-in user: provided by the app, read where a component needs to know who looks. */
export function createCurrentUser() {
  const [user] = createSignal(CURRENT_USER);
  return { userName: () => user().name };
}
const CurrentUserContext = createContext<ReturnType<typeof createCurrentUser>>();
export const CurrentUserProvider = CurrentUserContext.Provider;
export const useCurrentUser = () => useContext(CurrentUserContext)!;
