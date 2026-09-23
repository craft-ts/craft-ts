import {
  article,
  button,
  craftComponent,
  div,
  forNode,
  footer,
  form,
  heading,
  header,
  input,
  label,
  main,
  p,
  pendingNode,
  section,
  small,
  span,
  strong,
  ul,
} from '@craft-ts/component';
import {
  craftComputed,
  craftMethod,
  isCraftException,
  query,
  queryParams,
  state,
} from '@craft-ts/core';
import { getUsers } from '../users/list.fn-client';
import { demoPage } from './demo.style';

/**
 * Companion to `authenticated-list-demo`: same shape, but `demo.users.list`
 * requires no client DI at all — no current-user check, no role gate. It
 * shows the server function pipeline (client → HTTP → Effect handler → DB)
 * stripped down to its simplest form.
 */
const SimpleListDemo = craftComponent(
  'SimpleListDemo',
  {},
  function* () {
    const usersFilter = yield* queryParams(
      'usersFilter',
      {
        state: {
          filter: {
            fallbackValue: '',
            codec: {
              decode: (value: string) => value,
              encode: (value: string) => value,
            },
          },
        },
      },
      ({ patch }) => ({ patch }),
    );
    const usersQuery = yield* query(
      'usersQuery',
      {
        params: () => usersFilter.filter(),
        loader: function* ({ params }) {
          return yield* getUsers({ filter: params });
        },
      },
      ({ resource, exceptions }) => {
        const notFound = craftComputed('notFound', function* () {
          const error = (yield* exceptions()).loader;
          return isCraftException(error) && error._tag === 'UsersNotFound';
        });

        return {
          notFound,
          requestTitle: craftComputed('requestTitle', function* () {
            const currentStatus = yield* resource.status();
            if (yield* notFound()) return 'Server returned 404';
            return currentStatus === 'loading' || currentStatus === 'reloading'
              ? 'Calling demo.users.list from the URL filter…'
              : 'Server function ready';
          }),
          requestDetail: craftComputed('requestDetail', function* () {
            const currentStatus = yield* resource.status();
            if (yield* notFound()) {
              const error = (yield* exceptions()).loader;
              return `404 · ${exceptionMessage(error, 'No matching users.')}`;
            }
            return currentStatus === 'loading' || currentStatus === 'reloading'
              ? 'POST /__server-functions · Effect is running'
              : `Status: ${currentStatus}`;
          }),
          resultCount: craftComputed('resultCount', function* () {
            const value = yield* resource.value();
            return Array.isArray(value) ? value.length.toString() : '—';
          }),
        };
      },
    );
    const users = craftComputed('users', function* () {
      const value = yield* usersQuery.value();
      return Array.isArray(value) ? value : [];
    });
    const searchInput = yield* state(
      'searchInput',
      yield* usersFilter.filter(),
      ({ set }) => ({
        setSearchInput: (value: string) => set(value),
      }),
    );
    const submitSearch = craftMethod('submitSearch', function* (event?: Event) {
      event?.preventDefault();
      yield* usersFilter.patch({ filter: (yield* searchInput()).trim() });
    });

    return {
      searchInput,
      setSearchInput: searchInput.setSearchInput,
      usersFilter,
      usersQuery,
      users,
      submitSearch,
    };
  },
  ({ searchInput, setSearchInput, usersQuery, users, submitSearch }) =>
    main({ class: demoPage.shell }, [
      header({ class: demoPage.hero }, [
        div({ class: demoPage.eyebrow }, [
          span({ class: demoPage.pulse }),
          ' runnable playground',
        ]),
        heading(
          { class: demoPage.title },
          'Frontend → Server Function → Effect → DB',
        ),
        p(
          { class: demoPage.heroCopy },
          'Un filtre dans l’URL déclenche une Server Function publique et affiche sa réponse. Aucun contexte client ni contrôle d’accès ne vient détourner le trajet.',
        ),
      ]),
      section({ class: demoPage.workspace }, [
        div({ class: demoPage.panel }, [
          div({ class: demoPage.panelHeading }, [
            div([
              span({ class: demoPage.kicker }, 'Public server function'),
              heading({ class: demoPage.panelTitle }, 'Search users'),
            ]),
            span({ class: demoPage.mono }, 'demo.users.list'),
          ]),
          p(
            { class: demoPage.copy },
            'La valeur est conservée dans le paramètre URL `filter`.',
          ),
          form('simpleSearchForm', { submit: submitSearch }, [
            label(
              { class: demoPage.label, htmlFor: 'simpleFilterInput' },
              'Filter',
            ),
            div({ class: demoPage.searchRow }, [
              input('simpleFilterInput', {
                class: demoPage.input,
                type: 'search',
                value: searchInput,
                placeholder: 'ada, craft.dev…',
                autocomplete: 'off',
                'aria-label': 'User filter',
                *input(event) {
                  yield* setSearchInput(event.target.value);
                },
              }),
              button(
                'simpleSearchButton',
                {
                  class: demoPage.button,
                  type: 'submit',
                  disabled: usersQuery.isLoading,
                },
                'Run ↗',
              ),
            ]),
          ]),
          div({ class: demoPage.requestCard }, [
            span({ class: demoPage.requestDot }),
            div([
              strong({ class: demoPage.requestTitle }, function* () {
                return yield* usersQuery.requestTitle();
              }),
              small({ class: demoPage.requestDetail }, function* () {
                return yield* usersQuery.requestDetail();
              }),
            ]),
          ]),
        ]),
        div({ class: demoPage.panel }, [
          div({ class: demoPage.panelHeading }, [
            div([
              span({ class: demoPage.kicker }, 'Response'),
              heading({ class: demoPage.panelTitle }, 'Users'),
            ]),
            span({ class: demoPage.countBadge }, function* () {
              return yield* usersQuery.resultCount();
            }),
          ]),
          div([
            ul(
              { class: demoPage.results },
              forNode(users, { track: (user) => user.id }, (user) =>
                article({ class: demoPage.row }, [
                  div({ class: demoPage.avatar }, function* () {
                    return (yield* user()).name.slice(0, 1);
                  }),
                  div({ class: demoPage.rowInfo }, [
                    strong({ class: demoPage.rowName }, function* () {
                      return (yield* user()).name;
                    }),
                    span({ class: demoPage.rowMeta }, function* () {
                      return (yield* user()).email;
                    }),
                  ]),
                  span({ class: demoPage.rowId }, function* () {
                    return `#${(yield* user()).id}`;
                  }),
                ]),
              ),
            ),
          ]).pipe(
            pendingNode({
              fallback: () =>
                p(
                  { class: demoPage.loading },
                  '⏳ The Effect backend is working…',
                ),
            }),
          ),
        ]),
      ]),
      footer({ class: demoPage.footer }, [
        span('Same Effect service, two instances: client and server.'),
        span({ class: demoPage.footerFile }, 'apps/demo-with-server-function'),
      ]),
    ]),
);

function exceptionMessage(error: unknown, fallback: string): string {
  if (!isCraftException(error) || !isRecord(error.payload)) return fallback;
  const directMessage = error.payload.message;
  if (typeof directMessage === 'string') return directMessage;
  const nestedPayload = error.payload.payload;
  return isRecord(nestedPayload) && typeof nestedPayload.message === 'string'
    ? nestedPayload.message
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export { SimpleListDemo };
