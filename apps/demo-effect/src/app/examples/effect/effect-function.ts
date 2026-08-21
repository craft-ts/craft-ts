/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  craftComponent,
  div,
  heading,
  p,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { Effect } from 'effect';

const EffectFunctionComponent = craftComponent(
  'EffectFunctionComponent',
  {
    styles: `
      :scope { display: block; max-width: 880px; margin: 2rem auto; padding: 1.5rem; border: 1px solid #ede9fe; border-radius: 12px; color: #312e81; background: #f5f3ff; }
      :scope h1 { margin: 0 0 0.5rem; color: #2e1065; }
      .intro { margin: 0 0 1.25rem; color: #4338ca; line-height: 1.55; }
      .panel { padding: 1rem 1.1rem; border: 1px solid #ddd6fe; border-radius: 8px; background: #fff; }
      .panel-title { margin: 0 0 0.65rem; color: #64748b; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
      .result { margin: 0; color: #1e1b4b; font-size: 1.1rem; line-height: 1.5; }
      .note { margin-top: 1rem; color: #4c1d95; font-size: 0.85rem; line-height: 1.6; }
      .mono { padding: 0.05rem 0.3rem; border-radius: 3px; background: #ede9fe; font-family: ui-monospace, monospace; font-size: 0.8rem; }
      button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    `,
  },
  function* () {
    const greetingQuery = yield* queryEffect('effectFunctionQuery', {
      params: () => true,
      loader: () =>
        Effect.succeed({ library: 'Effect' }).pipe(
          Effect.map(({ library }) => ({
            message: `${library} function → Craft component`,
          })),
        ),
    }, ({ resource }) => ({
      greeting: craftComputed('greeting', function* () {
        return (yield* resource.value())?.message ?? '…';
      }),
    }));

    return { greeting: greetingQuery.greeting };
  },
  ({ greeting }) =>
    div([
      heading('Use a function from Effect'),
      p(
        { class: 'intro' },
        'A Craft query can execute a regular Effect program. The component below does not use a service: its loader calls functions from the Effect package and lets the Craft bridge run the result.',
      ),
      div({ class: 'panel' }, [
        p({ class: 'panel-title' }, 'Effect result'),
        p({ class: 'result' }, [strong('Result: '), greeting]),
      ]),
      p({ class: 'note' }, [
        'The example imports ',
        span({ class: 'mono' }, 'Effect.succeed'),
        ' and ',
        span({ class: 'mono' }, 'Effect.map'),
        ' from ',
        span({ class: 'mono' }, 'effect'),
        ' in a ',
        span({ class: 'mono' }, 'queryEffect'),
        ' loader.',
      ]),
    ]),
);

export default EffectFunctionComponent;
