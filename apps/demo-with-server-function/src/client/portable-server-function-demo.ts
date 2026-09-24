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
import { craftComputed, craftMethod, query, state } from '@craft-ts/core';
import { getPortableUsers } from '../users/portable-list.fn-client';
import { demoPage } from './demo.style';

const PortableServerFunctionDemo = craftComponent(
  'PortableServerFunctionDemo',
  {},
  function* () {
    const searchInput = yield* state('portableSearchInput', '', ({ set }) => ({
      setPortableSearchInput: (value: string) => set(value),
    }));
    const usersQuery = yield* query('portableUsersQuery', {
      method: (term: string) => term,
      loader: function* ({ params }) {
        return yield* getPortableUsers({ filter: params });
      },
    });
    yield* usersQuery.call('');
    // Le payload remonté par la chaîne : chaque clé a été produite par une
    // couche différente du `.pipe(...)` côté serveur.
    const portableUsers = craftComputed('portableUsers', function* () {
      return (yield* usersQuery.value())?.users ?? [];
    });
    const hasUsers = craftComputed('portableHasUsers', function* () {
      return (yield* portableUsers()).length > 0;
    });
    const isEmpty = craftComputed('portableIsEmpty', function* () {
      return !usersQuery.isLoading && !(yield* hasUsers());
    });
    const auditId = craftComputed('portableAuditId', function* () {
      return (yield* usersQuery.value())?.auditId ?? '—';
    });
    const normalizedFilter = craftComputed(
      'portableNormalizedFilter',
      function* () {
        const value = (yield* usersQuery.value())?.filter ?? '';
        return value.length === 0 ? '(empty)' : value;
      },
    );
    const scannedCount = craftComputed('portableScannedCount', function* () {
      const value = yield* usersQuery.value();
      return value === undefined ? '—' : value.scanned.toString();
    });

    const submitSearch = craftMethod(
      'submitPortableSearch',
      function* (event?: Event) {
        event?.preventDefault();
        yield* usersQuery.call((yield* searchInput()).trim());
      },
    );
    const resultCount = craftComputed('portableResultCount', function* () {
      const value = yield* usersQuery.value();
      return value === undefined ? '—' : value.users.length.toString();
    });

    return {
      searchInput,
      setSearchInput: searchInput.setPortableSearchInput,
      usersQuery,
      submitSearch,
      resultCount,
      hasUsers,
      isEmpty,
      portableUsers,
      auditId,
      normalizedFilter,
      scannedCount,
    };
  },
  ({
    searchInput,
    setSearchInput,
    usersQuery,
    submitSearch,
    resultCount,
    hasUsers,
    isEmpty,
    portableUsers,
    auditId,
    normalizedFilter,
    scannedCount,
  }) =>
    main({ class: demoPage.shell }, [
      header({ class: demoPage.hero }, [
        div({ class: demoPage.eyebrow }, [
          span({ class: demoPage.pulse }),
          ' runnable playground',
        ]),
        heading(
          { class: demoPage.title },
          'Frontend → Layer pipe → Promise → DB',
        ),
        p(
          { class: demoPage.heroCopy },
          'This page calls the new server function without importing Effect on the server function side. The server composes its layers with .pipe(...), and each one hands a typed payload to the next before the opaque Promise program runs.',
        ),
      ]),
      section({ class: demoPage.workspace }, [
        div({ class: demoPage.panel }, [
          div({ class: demoPage.panelHeading }, [
            div([
              span({ class: demoPage.kicker }, 'Portable server function'),
              heading({ class: demoPage.panelTitle }, 'Search users'),
            ]),
            span({ class: demoPage.mono }, 'demo.users.portable-list'),
          ]),
          p(
            { class: demoPage.copy },
            'The first layer creates an audit id, mapContext derives the normalized filter from it, and flatMapContext runs the Promise that loads the local database. The handler only reads the accumulated context.',
          ),
          form('portableSearchForm', { submit: submitSearch }, [
            label(
              { class: demoPage.label, htmlFor: 'portableFilterInput' },
              'Filter',
            ),
            div({ class: demoPage.searchRow }, [
              input('portableFilterInput', {
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
                'portableSearchButton',
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
                return (yield* usersQuery.isLoading())
                  ? 'Calling portable server function…'
                  : 'Portable request ready';
              }),
              small({ class: demoPage.requestDetail }, function* () {
                return (yield* usersQuery.isLoading())
                  ? 'POST /__server-functions · middleware is running'
                  : 'Promise handler · local users.json';
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
            span({ class: demoPage.countBadge }, resultCount),
          ]),
          ifNode(usersQuery.isLoading, () =>
            p({ class: demoPage.loading }, '⏳ Promise program is running…'),
          ),
          // Une ligne par couche : ce qu'elle a ajouté au contexte, tel que le
          // handler l'a lu avant de répondre.
          div({ class: demoPage.payload }, [
            div({ class: demoPage.payloadStep }, [
              span({ class: demoPage.payloadLayer }, 'portableAudit'),
              span({ class: demoPage.payloadKey }, 'auditId'),
              span({ class: demoPage.payloadValue }, auditId),
            ]),
            div({ class: demoPage.payloadStep }, [
              span({ class: demoPage.payloadLayer }, 'mapContext'),
              span({ class: demoPage.payloadKey }, 'normalizedFilter'),
              span({ class: demoPage.payloadValue }, normalizedFilter),
            ]),
            div({ class: demoPage.payloadStep }, [
              span({ class: demoPage.payloadLayer }, 'flatMapContext'),
              span({ class: demoPage.payloadKey }, 'scanned'),
              span({ class: demoPage.payloadValue }, scannedCount),
            ]),
          ]),
          ifNode(hasUsers, () =>
            ul(
              { class: demoPage.results },
              forNode(portableUsers, { track: (user) => user.id }, (user) =>
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
          ifNode(isEmpty, () =>
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
        span('No Effect import in the server function or its layers.'),
        span(
          { class: demoPage.footerFile },
          'users/portable-list.fn-serveur.ts',
        ),
      ]),
    ]),
);

export { PortableServerFunctionDemo };
