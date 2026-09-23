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
  ifNode,
  input,
  label,
  main,
  p,
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
  state,
} from '@craft-ts/core';
import { CurrentUser, requireAdmin } from '../shared/authenticated-user';
import { getAuthenticatedUsers } from '../users/authenticated-list.fn-client';
import { demoPage } from './demo.style';

const ServerFunctionDemo = craftComponent(
  'ServerFunctionDemo',
  {},
  function* () {
    const searchInput = yield* state('searchInput', '', ({ set }) => ({
      setSearchInput: (value: string) => set(value),
    }));
    const currentUserQuery = yield* query('currentUserQuery', {
      params: () => true,
      loader: function* () {
        return yield* CurrentUser;
      },
    });
    const currentUser = craftComputed('currentUser', function* () {
      return yield* currentUserQuery.value();
    });
    const isAdmin = craftComputed('isAdmin', function* () {
      return (yield* currentUser())?.role === 'admin';
    });
    // todo removeImporve and remove all the coments
    const usersQuery = yield* query(
      'usersQuery',
      {
        method: (term: string) => term,
        loader: function* ({ params }) {
          // Contrôle d'UX uniquement : il évite un aller-retour réseau, il
          // n'autorise rien.
          yield* requireAdmin;
          // L'identité annoncée ne se recopie plus à la main dans l'input :
          // elle voyage dans le canal `context`, alimenté par la chaîne
          // client déclarée sur la façade.
          return yield* getAuthenticatedUsers({ filter: params });
        },
      },
      ({ resource, exceptions }) => {
        const hasUsers = craftComputed('hasUsers', () => resource.hasValue());
        const notFound = craftComputed('notFound', function* () {
          const error = (yield* exceptions()).loader;
          return (
            isCraftException(error) &&
            error._tag === 'AuthenticatedUsersNotFound'
          );
        });
        const notFoundMessage = craftComputed('notFoundMessage', function* () {
          const error = (yield* exceptions()).loader;
          if (!isCraftException(error)) return '';
          const payload = error.payload;
          const message =
            payload && typeof payload === 'object' && 'message' in payload
              ? payload.message
              : undefined;
          return `404 · ${String(message ?? 'No matching users.')}`;
        });
        return {
          accessDenied: craftComputed(function* () {
            return (yield* currentUser())?.role === 'member';
          }),
          hasUsers,
          notFound,
          notFoundMessage,
          isEmpty: craftComputed('isEmpty', function* () {
            const currentStatus = yield* resource.status();
            return (
              (yield* currentUser())?.role !== 'member' &&
              !(yield* notFound()) &&
              currentStatus !== 'loading' &&
              currentStatus !== 'reloading' &&
              !resource.hasValue()
            );
          }),
          requestTitle: craftComputed('requestTitle', function* () {
            const currentStatus = yield* resource.status();
            if ((yield* currentUser())?.role === 'member') {
              return 'Client-side access denied';
            }
            if (yield* notFound()) return 'Server returned 404';
            return currentStatus === 'loading' || currentStatus === 'reloading'
              ? 'Calling demo.users.authenticated-list…'
              : 'Server function ready';
          }),
          requestDetail: craftComputed('requestDetail', function* () {
            const currentStatus = yield* resource.status();
            if ((yield* currentUser())?.role === 'member') {
              return `Role “${(yield* currentUser())?.role ?? '…'}” · no request sent`;
            }
            if (yield* notFound()) {
              return 'No matching users were found on the server';
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
    yield* usersQuery.call(''); // trigger first call
    const submitSearch = craftMethod('submitSearch', function* (event?: Event) {
      event?.preventDefault();
      if (!(yield* isAdmin())) return; // todo remove
      yield* usersQuery.call((yield* searchInput()).trim());
    });

    return {
      searchInput,
      setSearchInput: searchInput.setSearchInput,
      usersQuery,
      notFound: usersQuery.notFound,
      notFoundMessage: usersQuery.notFoundMessage,
      currentUser,
      submitSearch,
    };
  },
  ({
    searchInput,
    setSearchInput,
    usersQuery,
    currentUser,
    notFound,
    notFoundMessage,
    submitSearch,
  }) =>
    main({ class: demoPage.shell }, [
      header({ class: demoPage.hero }, [
        div({ class: demoPage.eyebrow }, [
          span({ class: demoPage.pulse }),
          ' runnable playground',
        ]),
        heading(
          { class: demoPage.title },
          'Frontend → DI → Server Function → Effect → DB',
        ),
        p(
          { class: demoPage.heroCopy },
          'The frontend reads the current user through DI for immediate UX feedback. The backend reads its own session and checks the role before accessing data.',
        ),
      ]),
      section({ class: demoPage.workspace }, [
        div({ class: demoPage.panel }, [
          div({ class: demoPage.panelHeading }, [
            div([
              span({ class: demoPage.kicker }, 'Protected server function'),
              heading({ class: demoPage.panelTitle }, 'Search users'),
            ]),
            span({ class: demoPage.mono }, 'demo.users.authenticated-list'),
          ]),
          p(
            { class: demoPage.copy },
            'The role comes from a client-side Craft service: if the user is not an admin, no network request is sent. This check improves UX, but the server does not trust it.',
          ),
          div({ class: demoPage.requestCard }, [
            span({ class: demoPage.requestDot }),
            div([
              strong({ class: demoPage.requestTitle }, function* () {
                return `User: ${(yield* currentUser())?.id ?? '…'}`;
              }),
              small({ class: demoPage.requestDetail }, function* () {
                return `Role: ${(yield* currentUser())?.role ?? '…'}`;
              }),
            ]),
          ]),
          form('searchForm', { submit: submitSearch }, [
            label({ class: demoPage.label, htmlFor: 'filterInput' }, 'Filter'),
            div({ class: demoPage.searchRow }, [
              input('filterInput', {
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
                'searchButton',
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
          ifNode(usersQuery.isLoading, () =>
            p({ class: demoPage.loading }, '⏳ The Effect backend is working…'),
          ),
          ifNode(usersQuery.accessDenied, () =>
            div({ class: demoPage.empty }, [
              strong({ class: demoPage.emptyTitle }, 'Access denied'),
              span(
                { class: demoPage.emptyText },
                'The client-side check blocked the request before it reached the network: admin role required.',
              ),
            ]),
          ),
          ifNode(notFound, () =>
            div({ class: demoPage.empty }, [
              strong({ class: demoPage.emptyTitle }, 'No users found'),
              span({ class: demoPage.emptyText }, function* () {
                return yield* notFoundMessage();
              }),
              span(
                { class: demoPage.emptyText },
                'The server returned a 404 exception for this filter.',
              ),
            ]),
          ),
          ifNode(usersQuery.hasUsers, () =>
            ul(
              { class: demoPage.results },
              forNode(usersQuery.value, { track: (user) => user.id }, (user) =>
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
          ),
          ifNode(usersQuery.isEmpty, () =>
            div({ class: demoPage.empty }, [
              strong({ class: demoPage.emptyTitle }, 'No results loaded'),
              span(
                { class: demoPage.emptyText },
                'Run a search to display users.',
              ),
            ]),
          ),
        ]),
      ]),
      footer({ class: demoPage.footer }, [
        span('Same Effect service, two instances: client and server.'),
        span({ class: demoPage.footerFile }, 'apps/demo-with-server-function'),
      ]),
    ]),
);

export { ServerFunctionDemo };
