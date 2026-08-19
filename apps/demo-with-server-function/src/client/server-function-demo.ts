/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  article,
  button,
  craftComponent,
  div,
  each,
  footer,
  form,
  heading,
  header,
  ifBlock,
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
import { Effect } from 'effect';
import {
  craftComputed,
  craftMethod,
  isCraftException,
  state,
} from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { CurrentUser, requireAdmin } from '../shared/authenticated-user';
import { getAuthenticatedUsers } from '../users/authenticated-list.fn-client';

const ServerFunctionDemo = craftComponent(
  'ServerFunctionDemo',
  {
    styles: `
      :scope { display: block; min-height: 100vh; color: #e8edf8; background: radial-gradient(circle at 85% 5%, #243768 0, #0b1020 36rem); }
      .shell { width: min(1120px, calc(100% - 40px)); margin: 0 auto; padding: 70px 0 34px; }
      .hero { max-width: 760px; }
      .eyebrow, .panel-kicker { color: #8da8ff; font-size: .72rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      .eyebrow { display: flex; align-items: center; gap: 9px; }
      .pulse { width: 8px; height: 8px; border-radius: 50%; background: #52e2ae; box-shadow: 0 0 0 5px #52e2ae20; }
      h1 { max-width: 760px; margin: 16px 0 15px; color: #fff; font-size: clamp(2.5rem, 6vw, 4.8rem); letter-spacing: -.065em; line-height: .98; }
      .hero-copy { max-width: 650px; margin: 0; color: #aab6cf; font-size: 1.08rem; }
      .flow { display: flex; align-items: stretch; margin: 52px 0 24px; padding: 10px; border: 1px solid #273351; border-radius: 18px; background: #111a30b3; }
      .flow-step { display: grid; flex: 1; grid-template-columns: auto 1fr; column-gap: 10px; align-items: center; padding: 13px 15px; }
      .flow-step strong { color: #f7f9ff; font-size: .9rem; }
      .flow-step small { grid-column: 2; color: #73809e; font-size: .7rem; white-space: nowrap; }
      .step-number { grid-row: span 2; color: #6379b7; font: 700 .7rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
      .flow-arrow { align-self: center; color: #526389; font-size: 1.4rem; }
      .workspace { display: grid; grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr); gap: 18px; }
      .panel { min-height: 340px; padding: 28px; border: 1px solid #293655; border-radius: 22px; background: linear-gradient(145deg, #18233d, #11192d); box-shadow: 0 20px 80px #00000020; }
      .panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
      h2 { margin: 5px 0 0; color: #fff; font-size: 1.2rem; letter-spacing: -.025em; }
      .mono { padding: 6px 8px; border: 1px solid #384a75; border-radius: 7px; color: #a7bbff; font: .68rem ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
      .panel-copy { margin: 14px 0 27px; color: #8996b1; font-size: .88rem; }
      .search-form label { display: block; margin-bottom: 8px; color: #bdc8dc; font-size: .78rem; font-weight: 700; }
      .search-row { display: flex; gap: 9px; }
      input { width: 100%; min-width: 0; padding: 13px 14px; border: 1px solid #3a4a70; border-radius: 10px; outline: none; color: #fff; background: #0c1427; font: inherit; }
      input:focus { border-color: #89a4ff; box-shadow: 0 0 0 3px #89a4ff22; }
      button { padding: 0 15px; border: 0; border-radius: 10px; color: #0b1020; background: #9fb5ff; cursor: pointer; font: inherit; font-weight: 800; white-space: nowrap; }
      button:hover { background: #b4c6ff; }
      button:disabled { cursor: wait; opacity: .6; }
      .request-card { display: flex; gap: 11px; align-items: flex-start; margin-top: 42px; padding: 13px; border: 1px solid #2d3d61; border-radius: 11px; background: #0d162a; }
      .request-dot { flex: 0 0 auto; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: #52e2ae; }
      .request-card strong, .request-card small { display: block; }
      .request-card strong { color: #dce5f8; font-size: .78rem; }
      .request-card small { margin-top: 3px; color: #7483a1; font-size: .7rem; }
      .loading { margin: 29px 0 9px; padding: 11px 12px; border: 1px solid #435b96; border-radius: 10px; color: #b7c8ff; background: #263c73; font-size: .78rem; }
      .count-badge { min-width: 27px; padding: 4px 8px; border-radius: 20px; color: #a9bbff; background: #354a83; font: 700 .75rem ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
      .results { display: grid; gap: 9px; margin: 29px 0 0; padding: 0; list-style: none; }
      .user-row { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #2c3b5b; border-radius: 12px; background: #10192d; }
      .avatar { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; color: #18233d; background: #9fb5ff; font-weight: 900; }
      .user-info { flex: 1; min-width: 0; }
      .user-info strong, .user-info span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .user-info strong { color: #f5f7ff; font-size: .88rem; }
      .user-info span { margin-top: 2px; color: #8290ae; font-size: .75rem; }
      .user-id { color: #637299; font: .7rem ui-monospace, SFMono-Regular, Menlo, monospace; }
      .empty { display: grid; place-items: center; min-height: 180px; border: 1px dashed #334262; border-radius: 13px; color: #8492ad; text-align: center; }
      .empty strong, .empty span { display: block; }
      .empty strong { color: #cdd7ec; font-size: .88rem; }
      .empty span { margin-top: 4px; font-size: .75rem; }
      .demo-footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 22px; color: #63708c; font-size: .72rem; }
      .footer-file { color: #7f8fb2; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      button:focus-visible, input:focus-visible { outline: 2px solid #9fb5ff; outline-offset: 2px; }
      @media (max-width: 780px) { .shell { width: min(100% - 28px, 600px); padding-top: 40px; } .flow { display: grid; grid-template-columns: 1fr 1fr; } .flow-arrow { display: none; } .workspace { grid-template-columns: 1fr; } }
      @media (max-width: 470px) { .panel { padding: 21px; } .panel-heading { display: block; } .mono { display: inline-block; margin-top: 14px; } .search-row { display: grid; grid-template-columns: 1fr; } button { min-height: 44px; } .demo-footer { display: block; } .footer-file { display: block; margin-top: 5px; } }
    `,
  },
  function* () {
    const searchInput = yield* state('searchInput', '', ({ set }) => ({
      setSearchInput: (value: string) => set(value),
    }));
    const currentUserQuery = yield* queryEffect('currentUserQuery', {
      params: () => true,
      loader: () => CurrentUser,
    });
    const currentUser = craftComputed('currentUser', function* () {
      return yield* currentUserQuery.value();
    });
    const isAdmin = craftComputed('isAdmin', function* () {
      return (yield* currentUser())?.role === 'admin';
    });
    // todo removeImporve and remove all the coments
    const usersQuery = yield* queryEffect(
      'usersQuery',
      {
        method: (term: string) => term,
        loader: ({ params }) =>
          Effect.gen(function* () {
            // Contrôle d'UX uniquement : il évite un aller-retour réseau, il
            // n'autorise rien.
            yield* requireAdmin;
            // L'identité annoncée ne se recopie plus à la main dans l'input :
            // elle voyage dans le canal `context`, alimenté par la chaîne
            // client déclarée sur la façade.
            const result = yield* Effect.promise(() =>
              getAuthenticatedUsers({ filter: params }),
            );
            // Le canal d'erreur du serveur arrive typé jusqu'ici : `AdminRequired`
            // et `AuthenticatedUserMismatch` viennent de la chaîne de middleware.
            // On le traite au lieu de le faire passer pour une liste d'utilisateurs.
            if (isCraftException(result)) {
              return yield* Effect.fail(result);
            }
            return result;
          }),
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
          const payload = error.payload as { readonly message?: unknown };
          return `404 · ${String(payload.message ?? 'No matching users.')}`;
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
    main({ class: 'shell' }, [
      header({ class: 'hero' }, [
        div({ class: 'eyebrow' }, [
          span({ class: 'pulse' }),
          ' runnable playground',
        ]),
        heading('Frontend → DI → Server Function → Effect → DB'),
        p(
          { class: 'hero-copy' },
          'The frontend reads the current user through DI for immediate UX feedback. The backend reads its own session and checks the role before accessing data.',
        ),
      ]),
      section({ class: 'flow', attrs: { 'aria-label': 'Demo flow' } }, [
        flowStep('01', 'CraftTS DI', 'current user + role'),
        span({ class: 'flow-arrow' }, '→'),
        flowStep('02', 'HTTP', 'POST /__server-functions'),
        span({ class: 'flow-arrow' }, '→'),
        flowStep('03', 'Effect', 'server runtime + Layer'),
        span({ class: 'flow-arrow' }, '→'),
        flowStep('04', 'Local DB', 'data/users.json'),
      ]),
      section({ class: 'workspace' }, [
        div({ class: 'panel query-panel' }, [
          div({ class: 'panel-heading' }, [
            div([
              span({ class: 'panel-kicker' }, 'Protected server function'),
              heading('Search users'),
            ]),
            span({ class: 'mono' }, 'demo.users.authenticated-list'),
          ]),
          p(
            { class: 'panel-copy' },
            'The role comes from a client-side Craft service: if the user is not an admin, no network request is sent. This check improves UX, but the server does not trust it.',
          ),
          div({ class: 'request-card' }, [
            span({ class: 'request-dot' }),
            div([
              strong(function* () {
                return `User: ${(yield* currentUser())?.id ?? '…'}`;
              }),
              small(function* () {
                return `Role: ${(yield* currentUser())?.role ?? '…'}`;
              }),
            ]),
          ]),
          form('searchForm', { class: 'search-form', submit: submitSearch }, [
            label({ htmlFor: 'filterInput' }, 'Filter'),
            div({ class: 'search-row' }, [
              input('filterInput', {
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
                { type: 'submit', disabled: usersQuery.isLoading },
                'Run ↗',
              ),
            ]),
          ]),
          div({ class: 'request-card' }, [
            span({ class: 'request-dot' }),
            div([
              strong(function* () {
                return yield* usersQuery.requestTitle();
              }),
              small(function* () {
                return yield* usersQuery.requestDetail();
              }),
            ]),
          ]),
        ]),
        div({ class: 'panel result-panel' }, [
          div({ class: 'panel-heading' }, [
            div([
              span({ class: 'panel-kicker' }, 'Response'),
              heading('Users'),
            ]),
            span({ class: 'count-badge' }, function* () {
              return yield* usersQuery.resultCount();
            }),
          ]),
          ifBlock(usersQuery.isLoading, () =>
            p({ class: 'loading' }, '⏳ The Effect backend is working…'),
          ),
          ifBlock(usersQuery.accessDenied, () =>
            div({ class: 'empty' }, [
              strong('Access denied'),
              span(
                'The client-side check blocked the request before it reached the network: admin role required.',
              ),
            ]),
          ),
          ifBlock(notFound, () =>
            div({ class: 'empty' }, [
              strong('No users found'),
              span(function* () {
                return yield* notFoundMessage();
              }),
              span('The server returned a 404 exception for this filter.'),
            ]),
          ),
          ifBlock(usersQuery.hasUsers, () =>
            ul(
              { class: 'results' },
              each(usersQuery.value, { track: (user) => user.id }, (user) =>
                article({ class: 'user-row' }, [
                  div({ class: 'avatar' }, function* () {
                    return (yield* user()).name.slice(0, 1);
                  }),
                  div({ class: 'user-info' }, [
                    strong(function* () {
                      return (yield* user()).name;
                    }),
                    span(function* () {
                      return (yield* user()).email;
                    }),
                  ]),
                  span({ class: 'user-id' }, function* () {
                    return `#${(yield* user()).id}`;
                  }),
                ]),
              ),
            ),
          ),
          ifBlock(usersQuery.isEmpty, () =>
            div({ class: 'empty' }, [
              strong('No results loaded'),
              span('Run a search to display users.'),
            ]),
          ),
        ]),
      ]),
      footer({ class: 'demo-footer' }, [
        span('Same Effect service, two instances: client and server.'),
        span({ class: 'footer-file' }, 'apps/demo-with-server-function'),
      ]),
    ]),
);

function flowStep(number: string, title: string, description: string) {
  return div({ class: 'flow-step' }, [
    span({ class: 'step-number' }, number),
    strong(title),
    small(description),
  ]);
}

export { ServerFunctionDemo };
