/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  button,
  craftComponent,
  div,
  heading,
  ifBlock,
  p,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed, state } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { loadGreeting } from '../../shared/greeting-service';

/**
 * Demonstrates an Effect service declared in a shared file and resolved by a
 * Layer provided outside this component, in app.config.ts.
 */
const EffectSharedServiceComponent = craftComponent(
  'EffectSharedServiceComponent',
  {
    styles: `
      :scope {
        display: block;
        max-width: 880px;
        margin: 2rem auto;
        padding: 1.5rem;
        border: 1px solid #dbeafe;
        border-radius: 12px;
        color: #1e293b;
        background: #eff6ff;
      }
      :scope h1 { margin: 0 0 0.5rem; color: #172554; }
      .intro { margin: 0 0 1.25rem; color: #334155; line-height: 1.55; }
      .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
      .actions button {
        padding: 0.5rem 0.9rem;
        border: 1px solid #93c5fd;
        border-radius: 6px;
        color: #1e3a8a;
        background: #fff;
        cursor: pointer;
      }
      .panel {
        padding: 1rem 1.1rem;
        border: 1px solid #bfdbfe;
        border-radius: 8px;
        background: #fff;
      }
      .panel-title {
        margin: 0 0 0.65rem;
        color: #64748b;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .mono {
        padding: 0.05rem 0.3rem;
        border-radius: 3px;
        background: #dbeafe;
        font-family: ui-monospace, monospace;
        font-size: 0.8rem;
      }
      button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    `,
  },
  function* () {
    const request = yield* state(
      'request',
      { name: 'Ada' },
      ({ update }) => ({
        greet: (name: string) => update(() => ({ name })),
      }),
    );

    const greetingQuery = yield* queryEffect('greetingQuery', {
      params: request,
      // This operation is imported from a shared domain file. Its Effect
      // requires GreetingService, which app.config.ts supplies with a Layer.
      loader: ({ params }) => loadGreeting(params.name),
    });

    const greeting = craftComputed('greeting', function* () {
      return (yield* greetingQuery.value())?.text ?? '…';
    });

    const isLoading = craftComputed('isLoading', function* () {
      const status = yield* greetingQuery.status();
      return status === 'loading' || status === 'reloading';
    });

    const status = craftComputed('status', function* () {
      return yield* greetingQuery.status();
    });

    return { request, greetingQuery, greeting, isLoading, status };
  },
  ({ request, greeting, isLoading, status }) =>
    div([
      heading('Effect service from a shared file'),
      p(
        { class: 'intro' },
        'The service, its Layer, and the domain operation live outside the component. The loader remains a simple Effect callback; GreetingService is resolved by provideLayer(...) in app.config.ts.',
      ),
      div({ class: 'actions' }, [
        button(
          'adaButton',
          { type: 'button', *click() { yield* request.greet('Ada'); } },
          'Ada',
        ),
        button(
          'graceButton',
          { type: 'button', *click() { yield* request.greet('Grace'); } },
          'Grace',
        ),
        button(
          'linusButton',
          { type: 'button', *click() { yield* request.greet('Linus'); } },
          'Linus',
        ),
      ]),
      div({ class: 'panel' }, [
        p({ class: 'panel-title' }, 'Dependency resolution'),
        ifBlock(isLoading, () => p('Resolving service…')),
        p({}, [
          strong('Result: '),
          greeting,
        ]),
        p({}, ['Status : ', status]),
        p({}, [
          'The Effect callback keeps the requirement ',
          span({ class: 'mono' }, 'R = GreetingService'),
          '. It is satisfied by the application Layer.',
        ]),
      ]),
    ]),
);

export default EffectSharedServiceComponent;
