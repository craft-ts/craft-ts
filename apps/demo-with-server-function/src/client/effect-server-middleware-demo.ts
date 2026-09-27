import {
  article,
  button,
  craftComponent,
  div,
  forNode,
  form,
  heading,
  ifNode,
  input,
  label,
  main,
  p,
  section,
  span,
  strong,
  ul,
} from '@craft-ts/component';
import { craftService, craftComputed, query, state, craftUse, craftExpose } from '@craft-ts/core';
import { getEffectMiddlewareUsers } from '../users/effect-middleware-list.fn-client';
import { demoPage } from './demo.style';

export const {
  EffectServerMiddlewareDemoView,
  provideEffectServerMiddlewareDemoView,
} = craftService(
  { name: 'effectServerMiddlewareDemoView', providedIn: 'toProvide' },
  function* () {
    const filter = yield* state('filter', '', ({ set }) => ({
      setEffectMiddlewareFilter: (value: string) => set(value),
    }));
    const usersQuery = yield* query(
      'usersQuery',
      {
        method: (request: {
          readonly filter: string;
          readonly simulateError: 'none' | 'middleware' | 'handler';
        }) => request,
        loader: function* ({ params }) {
          return yield* getEffectMiddlewareUsers(params);
        },
      },
      ({ exceptions }) => ({
        serverError: craftUse(craftComputed('effectMiddlewareServerError', function* () {
          return (yield* exceptions()).loader;
        })),
      }),
    );
    yield* usersQuery.call({ filter: '', simulateError: 'none' });
    const hasUsers = yield* craftComputed('hasUsers', () =>
      usersQuery.hasValue(),
    );
    yield* craftComputed(
      // todo interdire ? JSON.stringify ? et pourquoi aps eereur eslint remonté ici ?
      'serverErrorText',
      function* () {
        const error = yield* usersQuery.serverError();
        if (!error || typeof error !== 'object') return '';
        const tag = '_tag' in error ? error._tag : undefined;
        const payload = 'payload' in error ? error.payload : undefined;
        return `${String(tag)} · ${JSON.stringify(payload)}`;
      },
    );
    const hasServerError = yield* craftComputed('hasServerError', () =>
      Boolean(usersQuery.serverError()),
    );
    yield* craftComputed('isEmpty', function* () {
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
    yield* craftExpose('setFilter', filter.setEffectMiddlewareFilter);
    yield* craftExpose('runScenario', runScenario);
    yield* craftExpose('submit', submit);
  },
);

const EffectServerMiddlewareDemo = craftComponent(
  'EffectServerMiddlewareDemo',
  {
    providers: [provideEffectServerMiddlewareDemoView()],
  },
  function* () {
    const {
      filter,
      setFilter,
      usersQuery,
      hasUsers,
      hasServerError,
      serverErrorText,
      isEmpty,
      runScenario,
      submit,
    } = yield* EffectServerMiddlewareDemoView();
    return main({ class: demoPage.shell }, [
      div({ class: demoPage.eyebrow }, 'runnable playground · Effect adapter'),
      heading(
        { class: demoPage.title },
        'Frontend → effectServerMiddleware → Effect → DB',
      ),
      p(
        { class: demoPage.heroCopy },
        'This page invokes a server function whose middleware is an Effect combinator. The registry keeps the Effect opaque until executeEffect provides the server Layer.',
      ),
      section({ class: demoPage.workspace }, [
        div({ class: demoPage.panel }, [
          span({ class: demoPage.kicker }, 'Effect server middleware'),
          heading({ class: demoPage.panelTitle }, 'Run the pipeline'),
          p(
            { class: demoPage.copy },
            'The middleware reads CurrentUser, runs before the handler, and stays inside the same Effect runtime as the server function.',
          ),
          form('effectMiddlewareSearchForm', { submit }, [
            label(
              {
                class: [demoPage.label, demoPage.spacedLabel],
                htmlFor: 'effectMiddlewareFilterInput',
              },
              'Filter',
            ),
            div({ class: demoPage.searchRow }, [
              input('effectMiddlewareFilterInput', {
                class: demoPage.input,
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
                {
                  class: demoPage.button,
                  type: 'submit',
                  disabled: usersQuery.isLoading,
                },
                'Run success ↗',
              ),
            ]),
          ]),
          div({ class: demoPage.actions }, [
            button(
              'effectMiddlewareErrorButton',
              {
                type: 'button',
                class: demoPage.button,
                'data-demoButton': 'danger',
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
                class: demoPage.button,
                'data-demoButton': 'danger',
                disabled: usersQuery.isLoading,
                *click() {
                  yield* runScenario('handler');
                },
              },
              'Fail in handler',
            ),
          ]),
          div({ class: demoPage.status }, function* () {
            return (yield* usersQuery.isLoading())
              ? 'Effect middleware is running…'
              : 'Effect middleware ready';
          }),
        ]),
        div({ class: demoPage.panel }, [
          span({ class: demoPage.kicker }, 'Response'),
          heading({ class: demoPage.panelTitle }, 'Users'),
          ifNode(hasServerError, () =>
            div({ class: demoPage.error }, [
              strong('Server error · '),
              span(serverErrorText),
            ]),
          ),
          ifNode(usersQuery.isLoading, () =>
            p(
              { class: demoPage.copy },
              'Waiting for the Effect runtime and database…',
            ),
          ),
          ifNode(hasUsers, () =>
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
          ifNode(isEmpty, () =>
            div({ class: demoPage.empty }, [
              strong({ class: demoPage.emptyTitle }, 'No results loaded'),
              span(
                { class: demoPage.emptyText },
                'Run a search to see the Effect response.',
              ),
            ]),
          ),
        ]),
      ]),
    ]);
  },
);

export { EffectServerMiddlewareDemo };
