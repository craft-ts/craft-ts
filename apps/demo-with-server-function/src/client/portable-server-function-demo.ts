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
import { craftComputed, craftMethod, query, state } from '@craft-ts/core';
import { getPortableUsers } from '../users/portable-list.fn-client';

const PortableServerFunctionDemo = craftComponent(
  'PortableServerFunctionDemo',
  {
    styles: `
      :scope { display: block; min-height: 100vh; color: #e8edf8; background: radial-gradient(circle at 85% 5%, #263f70 0, #0b1020 36rem); }
      .shell { width: min(1120px, calc(100% - 40px)); margin: 0 auto; padding: 70px 0 34px; }
      .hero { max-width: 790px; }
      .eyebrow, .panel-kicker { color: #7ee8c0; font-size: .72rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      .eyebrow { display: flex; align-items: center; gap: 9px; }
      .pulse { width: 8px; height: 8px; border-radius: 50%; background: #52e2ae; box-shadow: 0 0 0 5px #52e2ae20; }
      h1 { max-width: 790px; margin: 16px 0 15px; color: #fff; font-size: clamp(2.5rem, 6vw, 4.8rem); letter-spacing: -.065em; line-height: .98; }
      .hero-copy { max-width: 700px; margin: 0; color: #aab6cf; font-size: 1.08rem; }
      .flow { display: flex; align-items: stretch; margin: 52px 0 24px; padding: 10px; border: 1px solid #273351; border-radius: 18px; background: #111a30b3; }
      .flow-step { display: grid; flex: 1; grid-template-columns: auto 1fr; column-gap: 10px; align-items: center; padding: 13px 15px; }
      .flow-step strong { color: #f7f9ff; font-size: .9rem; }
      .flow-step small { grid-column: 2; color: #73809e; font-size: .7rem; white-space: nowrap; }
      .step-number { grid-row: span 2; color: #67cda9; font: 700 .7rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
      .flow-arrow { align-self: center; color: #526389; font-size: 1.4rem; }
      .workspace { display: grid; grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr); gap: 18px; }
      .panel { min-height: 340px; padding: 28px; border: 1px solid #293655; border-radius: 22px; background: linear-gradient(145deg, #18233d, #11192d); box-shadow: 0 20px 80px #00000020; }
      .panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
      h2 { margin: 5px 0 0; color: #fff; font-size: 1.2rem; letter-spacing: -.025em; }
      .mono { padding: 6px 8px; border: 1px solid #39715f; border-radius: 7px; color: #9cf1cf; font: .68rem ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
      .panel-copy { margin: 14px 0 27px; color: #8996b1; font-size: .88rem; }
      .search-form label { display: block; margin-bottom: 8px; color: #bdc8dc; font-size: .78rem; font-weight: 700; }
      .search-row { display: flex; gap: 9px; }
      input { width: 100%; min-width: 0; padding: 13px 14px; border: 1px solid #3a4a70; border-radius: 10px; outline: none; color: #fff; background: #0c1427; font: inherit; }
      input:focus { border-color: #76dcb6; box-shadow: 0 0 0 3px #76dcb622; }
      button { padding: 0 15px; border: 0; border-radius: 10px; color: #0b1020; background: #83e1bc; cursor: pointer; font: inherit; font-weight: 800; white-space: nowrap; }
      button:hover { background: #a2efd0; }
      button:disabled { cursor: wait; opacity: .6; }
      .request-card { display: flex; gap: 11px; align-items: flex-start; margin-top: 42px; padding: 13px; border: 1px solid #2d3d61; border-radius: 11px; background: #0d162a; }
      .request-dot { flex: 0 0 auto; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: #52e2ae; }
      .request-card strong, .request-card small { display: block; }
      .request-card strong { color: #dce5f8; font-size: .78rem; }
      .request-card small { margin-top: 3px; color: #7483a1; font-size: .7rem; }
      .loading { margin: 29px 0 9px; padding: 11px 12px; border: 1px solid #39715f; border-radius: 10px; color: #b7f5dc; background: #173d36; font-size: .78rem; }
      .count-badge { min-width: 27px; padding: 4px 8px; border-radius: 20px; color: #a9f0d0; background: #27614f; font: 700 .75rem ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
      .results { display: grid; gap: 9px; margin: 29px 0 0; padding: 0; list-style: none; }
      .user-row { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #2c3b5b; border-radius: 12px; background: #10192d; }
      .avatar { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; color: #18233d; background: #83e1bc; font-weight: 900; }
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
      button:focus-visible, input:focus-visible { outline: 2px solid #83e1bc; outline-offset: 2px; }
      @media (max-width: 780px) { .shell { width: min(100% - 28px, 600px); padding-top: 40px; } .flow { display: grid; grid-template-columns: 1fr 1fr; } .flow-arrow { display: none; } .workspace { grid-template-columns: 1fr; } }
      @media (max-width: 470px) { .panel { padding: 21px; } .panel-heading { display: block; } .mono { display: inline-block; margin-top: 14px; } .search-row { display: grid; grid-template-columns: 1fr; } button { min-height: 44px; } .demo-footer { display: block; } .footer-file { display: block; margin-top: 5px; } }
    `,
  },
  function* () {
    const searchInput = yield* state('portableSearchInput', '', ({ set }) => ({
      setPortableSearchInput: (value: string) => set(value),
    }));
    const usersQuery = yield* query('portableUsersQuery', {
      method: (term: string) => term,
      loader: ({ params }) => getPortableUsers({ filter: params }),
    });
    yield* usersQuery.call('');
    const hasUsers = craftComputed('portableHasUsers', () =>
      usersQuery.hasValue(),
    );
    const isEmpty = craftComputed('portableIsEmpty', function* () {
      return !usersQuery.isLoading && !(yield* hasUsers());
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
      return Array.isArray(value) ? value.length.toString() : '—';
    });

    return {
      searchInput,
      setSearchInput: searchInput.setPortableSearchInput,
      usersQuery,
      submitSearch,
      resultCount,
      hasUsers,
      isEmpty,
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
  }) =>
    main({ class: 'shell' }, [
      header({ class: 'hero' }, [
        div({ class: 'eyebrow' }, [
          span({ class: 'pulse' }),
          ' runnable playground',
        ]),
        heading('Frontend → Portable Middleware → Promise → DB'),
        p(
          { class: 'hero-copy' },
          'This page calls the new server function without importing Effect on the server function side. The registry executes the opaque Promise program after the portable middleware chain.',
        ),
      ]),
      section({ class: 'flow', attrs: { 'aria-label': 'Demo flow' } }, [
        flowStep('01', 'Client call', 'getPortableUsers({ filter })'),
        span({ class: 'flow-arrow' }, '→'),
        flowStep('02', 'HTTP', 'POST /__server-functions'),
        span({ class: 'flow-arrow' }, '→'),
        flowStep('03', 'Middleware', 'portableAudit → next()'),
        span({ class: 'flow-arrow' }, '→'),
        flowStep('04', 'Promise', 'readFile + filter'),
      ]),
      section({ class: 'workspace' }, [
        div({ class: 'panel query-panel' }, [
          div({ class: 'panel-heading' }, [
            div([
              span({ class: 'panel-kicker' }, 'Portable server function'),
              heading('Search users'),
            ]),
            span({ class: 'mono' }, 'demo.users.portable-list'),
          ]),
          p(
            { class: 'panel-copy' },
            'The middleware creates an audit id and forwards it through the server context before the Promise handler reads the local database.',
          ),
          form(
            'portableSearchForm',
            { class: 'search-form', submit: submitSearch },
            [
              label({ htmlFor: 'portableFilterInput' }, 'Filter'),
              div({ class: 'search-row' }, [
                input('portableFilterInput', {
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
                  { type: 'submit', disabled: usersQuery.isLoading },
                  'Run ↗',
                ),
              ]),
            ],
          ),
          div({ class: 'request-card' }, [
            span({ class: 'request-dot' }),
            div([
              strong(function* () {
                return usersQuery.isLoading
                  ? 'Calling portable server function…'
                  : 'Portable request ready';
              }),
              small(function* () {
                return usersQuery.isLoading
                  ? 'POST /__server-functions · middleware is running'
                  : 'Promise handler · local users.json';
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
            span({ class: 'count-badge' }, resultCount),
          ]),
          ifBlock(usersQuery.isLoading, () =>
            p({ class: 'loading' }, '⏳ Promise program is running…'),
          ),
          ifBlock(hasUsers, () =>
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
          ifBlock(isEmpty, () =>
            div({ class: 'empty' }, [
              strong('No results loaded'),
              span('Run a search to display users.'),
            ]),
          ),
        ]),
      ]),
      footer({ class: 'demo-footer' }, [
        span('No Effect import in the server function or middleware.'),
        span({ class: 'footer-file' }, 'users/portable-list.fn-serveur.ts'),
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

export { PortableServerFunctionDemo };
