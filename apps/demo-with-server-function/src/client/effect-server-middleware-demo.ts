/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  article,
  button,
  craftComponent,
  div,
  each,
  form,
  heading,
  ifBlock,
  input,
  label,
  main,
  p,
  section,
  span,
  strong,
  ul,
} from '@craft-ts/component';
import { craftComputed, query, state } from '@craft-ts/core';
import { getEffectMiddlewareUsers } from '../users/effect-middleware-list.fn-client';

const EffectServerMiddlewareDemo = craftComponent(
  'EffectServerMiddlewareDemo',
  {
    styles: `
      :scope { display: block; min-height: 100vh; color: #e8edf8; background: radial-gradient(circle at 85% 5%, #5b321e 0, #0b1020 36rem); }
      .shell { width: min(1080px, calc(100% - 40px)); margin: 0 auto; padding: 70px 0 34px; }
      .eyebrow { color: #ffbd82; font-size: .72rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      h1 { max-width: 780px; margin: 16px 0 15px; color: #fff; font-size: clamp(2.5rem, 6vw, 4.8rem); letter-spacing: -.065em; line-height: .98; }
      .hero-copy { max-width: 720px; color: #aab6cf; font-size: 1.08rem; }
      .flow { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; margin: 48px 0 24px; border: 1px solid #493b34; border-radius: 18px; overflow: hidden; background: #493b34; }
      .flow-step { padding: 18px; background: #171722; }
      .flow-step strong, .flow-step span { display: block; }
      .flow-step strong { color: #fff; font-size: .86rem; }
      .flow-step span { margin-top: 7px; color: #8d8aa2; font: .7rem ui-monospace, SFMono-Regular, Menlo, monospace; }
      .workspace { display: grid; grid-template-columns: .85fr 1.15fr; gap: 18px; }
      .panel { min-height: 330px; padding: 28px; border: 1px solid #493b34; border-radius: 22px; background: linear-gradient(145deg, #2c2430, #161724); }
      .panel-kicker { color: #ffbd82; font-size: .72rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      h2 { margin: 7px 0 0; color: #fff; font-size: 1.2rem; }
      .copy { color: #9994a9; font-size: .88rem; line-height: 1.55; }
      label { display: block; margin: 28px 0 8px; color: #c8c2d2; font-size: .78rem; font-weight: 700; }
      .search-row { display: flex; gap: 9px; }
      input { width: 100%; min-width: 0; padding: 13px 14px; border: 1px solid #66505a; border-radius: 10px; outline: none; color: #fff; background: #11131f; font: inherit; }
      input:focus { border-color: #ffbd82; box-shadow: 0 0 0 3px #ffbd8222; }
      button { padding: 0 15px; border: 0; border-radius: 10px; color: #21151a; background: #ffbd82; cursor: pointer; font: inherit; font-weight: 800; }
      button:disabled { cursor: wait; opacity: .6; }
      .status { margin-top: 28px; padding: 13px; border: 1px solid #594957; border-radius: 11px; color: #c9c0d2; background: #171522; font-size: .78rem; }
      .scenario-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
      .scenario-actions button { min-height: 38px; }
      .scenario-actions .danger { color: #fff; background: #a94f55; }
      .error { margin-top: 18px; padding: 14px; border: 1px solid #a94f55; border-radius: 11px; color: #ffd7d0; background: #42252e; font: .76rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-wrap: anywhere; }
      .results { display: grid; gap: 9px; margin: 25px 0 0; padding: 0; list-style: none; }
      .user-row { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #493b4d; border-radius: 12px; background: #171722; }
      .avatar { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; color: #2c2430; background: #ffbd82; font-weight: 900; }
      .user-info { flex: 1; min-width: 0; }
      .user-info strong, .user-info span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .user-info span { margin-top: 2px; color: #9994a9; font-size: .75rem; }
      .user-id { color: #777087; font: .7rem ui-monospace, SFMono-Regular, Menlo, monospace; }
      .empty { display: grid; place-items: center; min-height: 190px; color: #9994a9; text-align: center; }
      .empty strong, .empty span { display: block; }
      .empty span { margin-top: 5px; font-size: .76rem; }
      @media (max-width: 780px) { .shell { width: min(100% - 28px, 600px); padding-top: 40px; } .flow, .workspace { grid-template-columns: 1fr; } }
      @media (max-width: 470px) { .panel { padding: 21px; } .search-row { display: grid; grid-template-columns: 1fr; } button { min-height: 44px; } }
      :scope { color: #172033; background: #f6f7fb; }
      .shell { width: min(1060px, calc(100% - 40px)); padding: 52px 0 30px; }
      .eyebrow, .panel-kicker { color: #5570c7; }
      h1, h2 { color: #172033; }
      h1 { margin: 12px 0; font-size: clamp(2.1rem, 5vw, 3.7rem); line-height: 1.02; }
      .hero-copy, .copy { color: #68738a; line-height: 1.55; }
      .flow { display: none; }
      .workspace { margin-top: 38px; }
      .panel { min-height: 320px; padding: 25px; border: 1px solid #e2e6ef; border-radius: 16px; background: #fff; box-shadow: 0 10px 28px #25345a0a; }
      input { border-color: #d7dce7; color: #172033; background: #fff; }
      input:focus { border-color: #7991df; box-shadow: 0 0 0 3px #5570c71c; }
      button { color: #fff; background: #4665c4; }
      button:hover { background: #3855ad; }
      .status { border-color: #e3e7ef; color: #68738a; background: #fafbfc; }
      .scenario-actions .danger { color: #fff; background: #c65d66; }
      .error { border-color: #edc5c8; color: #9e414b; background: #fff5f5; }
      .user-row { border-color: #e5e8ef; background: #fff; }
      .avatar { color: #3159c8; background: #edf2ff; }
      .user-info span, .user-id { color: #7a8498; }
      .empty { color: #7a8498; }
      @media (max-width: 780px) { .shell { width: min(100% - 28px, 600px); padding-top: 38px; } }
    `,
  },
  function* () {
    const filter = yield* state('effectMiddlewareFilter', '', ({ set }) => ({
      setEffectMiddlewareFilter: (value: string) => set(value),
    }));
    const usersQuery = yield* query(
      'effectMiddlewareUsersQuery',
      {
        method: (request: {
          readonly filter: string;
          readonly simulateError: 'none' | 'middleware' | 'handler';
        }) => request,
        loader: ({ params }) => getEffectMiddlewareUsers(params),
      },
      ({ exceptions }) => ({
        serverError: craftComputed('effectMiddlewareServerError', function* () {
          return (yield* exceptions()).loader;
        }),
      }),
    );
    yield* usersQuery.call({ filter: '', simulateError: 'none' });
    const hasUsers = craftComputed('effectMiddlewareHasUsers', () =>
      usersQuery.hasValue(),
    );
    const serverErrorText = craftComputed(
      // todo interdire ? JSON.stringify ? et pourquoi aps eereur eslint remonté ici ?
      'effectMiddlewareServerErrorText',
      function* () {
        const error = yield* usersQuery.serverError();
        if (!error || typeof error !== 'object') return '';
        const record = error as {
          readonly _tag?: unknown;
          readonly payload?: unknown;
        };
        return `${String(record._tag)} · ${JSON.stringify(record.payload)}`;
      },
    );
    const hasServerError = craftComputed('effectMiddlewareHasServerError', () =>
      Boolean(usersQuery.serverError()),
    );
    const isEmpty = craftComputed('effectMiddlewareIsEmpty', function* () {
      return (
        !usersQuery.isLoading &&
        !(yield* hasUsers()) &&
        !(yield* hasServerError())
      );
    });
    function* runScenario(simulateError: 'none' | 'middleware' | 'handler') {
      yield* usersQuery.call({
        filter: (yield* filter()).trim(),
        simulateError,
      });
    }
    function* submit(event?: Event) {
      event?.preventDefault();
      yield* runScenario('none');
    }
    return {
      filter,
      setFilter: filter.setEffectMiddlewareFilter,
      usersQuery,
      hasUsers,
      hasServerError,
      serverErrorText,
      isEmpty,
      runScenario,
      submit,
    };
  },
  ({
    filter,
    setFilter,
    usersQuery,
    hasUsers,
    hasServerError,
    serverErrorText,
    isEmpty,
    runScenario,
    submit,
  }) =>
    main({ class: 'shell' }, [
      div({ class: 'eyebrow' }, 'runnable playground · Effect adapter'),
      heading('Frontend → effectServerMiddleware → Effect → DB'),
      p(
        { class: 'hero-copy' },
        'This page invokes a server function whose middleware is an Effect combinator. The registry keeps the Effect opaque until executeEffect provides the server Layer.',
      ),
      section(
        { class: 'flow', attrs: { 'aria-label': 'Effect middleware flow' } },
        [
          flowStep('01', 'Client', 'getEffectMiddlewareUsers'),
          flowStep('02', 'Middleware', 'before → next → after'),
          flowStep('03', 'Adapter', 'executeEffect(Layer)'),
          flowStep('04', 'Handler', 'UserRepository + DB'),
        ],
      ),
      section({ class: 'workspace' }, [
        div({ class: 'panel' }, [
          span({ class: 'panel-kicker' }, 'Effect server middleware'),
          heading('Run the pipeline'),
          p(
            { class: 'copy' },
            'The middleware reads CurrentUser, logs before and after the handler, and runs inside the same Effect runtime as the server function.',
          ),
          form('effectMiddlewareSearchForm', { submit }, [
            label({ htmlFor: 'effectMiddlewareFilterInput' }, 'Filter'),
            div({ class: 'search-row' }, [
              input('effectMiddlewareFilterInput', {
                type: 'search',
                value: filter,
                placeholder: 'ada, craft.dev…',
                autocomplete: 'off',
                'aria-label': 'User filter',
                *input(event) {
                  yield* setFilter(event.target.value);
                },
              }),
              button(
                'effectMiddlewareSearchButton',
                { type: 'submit', disabled: usersQuery.isLoading },
                'Run success ↗',
              ),
            ]),
          ]),
          div({ class: 'scenario-actions' }, [
            button(
              'effectMiddlewareErrorButton',
              {
                type: 'button',
                class: 'danger',
                disabled: usersQuery.isLoading,
                *click() {
                  yield* runScenario('middleware');
                },
              },
              'Fail in middleware',
            ),
            button(
              'effectHandlerErrorButton',
              {
                type: 'button',
                class: 'danger',
                disabled: usersQuery.isLoading,
                *click() {
                  yield* runScenario('handler');
                },
              },
              'Fail in handler',
            ),
          ]),
          div({ class: 'status' }, function* () {
            return (yield* usersQuery.isLoading())
              ? 'Effect middleware is running…'
              : 'Effect middleware ready';
          }),
        ]),
        div({ class: 'panel' }, [
          span({ class: 'panel-kicker' }, 'Response'),
          heading('Users'),
          ifBlock(hasServerError, () =>
            div({ class: 'error' }, [
              strong('Server error · '),
              span(serverErrorText),
            ]),
          ),
          ifBlock(usersQuery.isLoading, () =>
            p(
              { class: 'copy' },
              'Waiting for the Effect runtime and database…',
            ),
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
              span('Run a search to see the Effect response.'),
            ]),
          ),
        ]),
      ]),
    ]),
);

function flowStep(number: string, title: string, description: string) {
  return div({ class: 'flow-step' }, [
    span({ class: 'step-number' }, number),
    strong(title),
    span(description),
  ]);
}

export { EffectServerMiddlewareDemo };
