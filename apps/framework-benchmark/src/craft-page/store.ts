import { craftComputed, craftService, state } from '@craft-ts/core';
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
  type Action,
  type Model,
} from '../page-common.js';

/**
 * The page's shared state: one immutable model, changed only by `reduce`, and
 * narrow selectors so that a reader depends on the slice it shows.
 */
export const { Page, providePage } = craftService(
  { name: 'Page', providedIn: 'toProvide' },
  function* () {
    const model = yield* state(
      'model',
      makeModel(startRevision()) as Model,
      ({ update }) => ({
        dispatch: (action: Action) =>
          update((previous) => reduce(previous, action)),
      }),
    );
    yield* craftComputed('revision', function* () {
      return (yield* model()).revision;
    });
    const theme = yield* craftComputed('theme', function* () {
      return (yield* model()).theme;
    });
    yield* craftComputed('themeLabel', function* () {
      return `${yield* theme()} theme`;
    });
    yield* craftComputed('isDark', function* () {
      return (yield* theme()) === 'dark';
    });
    const unread = yield* craftComputed('unread', function* () {
      return (yield* model()).unread;
    });
    yield* craftComputed('hasUnread', function* () {
      return (yield* unread()) > 0;
    });
    yield* craftComputed('unreadText', function* () {
      return String(yield* unread());
    });
    yield* craftComputed('unreadSummary', function* () {
      return unreadSummary(yield* unread());
    });
    const search = yield* craftComputed('search', function* () {
      return (yield* model()).search;
    });
    yield* craftComputed('hasSearch', function* () {
      return (yield* search()) !== '';
    });
    yield* craftComputed('menuOpen', function* () {
      return (yield* model()).menuOpen;
    });
    const tab = yield* craftComputed('tab', function* () {
      return (yield* model()).tab;
    });
    yield* craftComputed('onBoard', function* () {
      return (yield* tab()) === 'board';
    });
    yield* craftComputed('onFiles', function* () {
      return (yield* tab()) === 'files';
    });
    yield* craftComputed('onNotes', function* () {
      return (yield* tab()) === 'notes';
    });
    const status = yield* craftComputed('status', function* () {
      return (yield* model()).status;
    });
    const sortKey = yield* craftComputed('sortKey', function* () {
      return (yield* model()).sortKey;
    });
    const sortDir = yield* craftComputed('sortDir', function* () {
      return (yield* model()).sortDir;
    });
    yield* craftComputed('compact', function* () {
      return (yield* model()).compact;
    });
    yield* craftComputed('selected', function* () {
      return (yield* model()).selected;
    });
    const people = yield* craftComputed('people', function* () {
      return (yield* model()).people;
    });
    const tasks = yield* craftComputed('tasks', function* () {
      return (yield* model()).tasks;
    });
    yield* craftComputed('files', function* () {
      return (yield* model()).files;
    });
    yield* craftComputed('feed', function* () {
      return (yield* model()).feed;
    });
    yield* craftComputed('form', function* () {
      return (yield* model()).form;
    });
    const rows = yield* craftComputed('rows', function* () {
      return visibleRows(
        [...(yield* people())],
        yield* status(),
        yield* sortKey(),
        yield* sortDir(),
      );
    });
    yield* craftComputed('noRows', function* () {
      return (yield* rows()).length === 0;
    });
    yield* craftComputed('summary', function* () {
      return pageSummary((yield* rows()).length, (yield* people()).length);
    });
    yield* craftComputed('statusCounts', function* () {
      return statusCounts(yield* people());
    });
    yield* craftComputed('stats', function* () {
      return stats(yield* people(), yield* tasks(), yield* unread());
    });
    yield* craftComputed('tasksByColumn', function* () {
      return groupTasks(yield* tasks());
    });
  },
);

/** The signed-in user: injected where a component needs to know who looks. */
export const { CurrentUser, provideCurrentUser } = craftService(
  { name: 'CurrentUser', providedIn: 'toProvide' },
  function* () {
    const user = yield* state('user', CURRENT_USER);
    yield* craftComputed('userName', function* () {
      return (yield* user()).name;
    });
  },
);
