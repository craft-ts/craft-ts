/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  button,
  craftComponent,
  div,
  heading,
  p,
  pendingNode,
  span,
} from '@craft-ts/component';
import { craftComputed, settled, state } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import {
  i18nRuntime,
  renderReceipt,
  type ReceiptLocale,
} from '../../shared/i18n-domain';

const ORDER = {
  totalCents: 128_450,
  lineCount: 3,
  placedAt: Date.UTC(2026, 7, 25, 14, 30),
} as const;

/**
 * `@craft-ts/i18n-effect` from the inside.
 *
 * `renderReceipt` is an ordinary Effect program that happens to translate; its
 * `I18nEffectService` requirement is satisfied by the route's
 * `provideLayer(I18nLive)`. Remove that Layer and the build fails on the
 * `EffectRequirementsCheckedDI` proof in `app.routes.ts`, not at runtime.
 *
 * The locale lives in a `state`, and it is the query's `params`: switching it
 * calls `setLocale` on the shared runtime and re-runs the program, so every
 * string on screen changes together.
 */
const EffectI18nComponent = craftComponent(
  'EffectI18nComponent',
  {
    styles: `
      :scope { display: block; max-width: 880px; margin: 2rem auto; padding: 1.5rem; border: 1px solid #e0e7ff; border-radius: 12px; color: #1e1b4b; background: #f5f3ff; }
      :scope h1 { margin: 0 0 0.5rem; color: #2e1065; }
      .intro { margin: 0 0 1.25rem; color: #4c1d95; line-height: 1.55; }
      .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; }
      .actions button { padding: 0.45rem 0.85rem; border: 1px solid #c4b5fd; border-radius: 999px; color: #4c1d95; background: #fff; font-size: 0.85rem; cursor: pointer; }
      .actions button[aria-pressed='true'] { color: #fff; background: #6d28d9; border-color: #6d28d9; }
      .receipt { display: grid; gap: 0.5rem; padding: 1.1rem; border: 1px solid #ddd6fe; border-radius: 8px; background: #fff; }
      .receipt h2 { margin: 0; color: #2e1065; font-size: 1.15rem; }
      .receipt p { margin: 0; color: #4338ca; }
      .loading { display: flex; align-items: center; gap: 0.5rem; min-height: 2rem; margin: 0; color: #6d28d9; font-size: 0.95rem; }
      .note { margin-top: 1.25rem; color: #4c1d95; font-size: 0.85rem; line-height: 1.6; }
      .mono { padding: 0.05rem 0.3rem; border-radius: 3px; background: #ede9fe; font-family: ui-monospace, monospace; font-size: 0.8rem; }
      button:focus-visible, a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    `,
  },
  function* () {
    const locale = yield* state(
      'locale',
      'en-US' as ReceiptLocale,
      ({ set, state: read }) => {
        // One active locale for the process: the Effect side reads the same
        // runtime, so nothing here has to tell it twice.
        const choose = (next: ReceiptLocale) =>
          function* () {
            i18nRuntime.setLocale(next);
            yield* set(next);
          };

        return {
          chooseEnglish: choose('en-US'),
          chooseFrench: choose('fr-FR'),
          englishPressed: craftComputed('englishPressed', function* () {
            return (yield* read()) === 'en-US' ? 'true' : 'false';
          }),
          frenchPressed: craftComputed('frenchPressed', function* () {
            return (yield* read()) === 'fr-FR' ? 'true' : 'false';
          }),
        };
      },
    );

    const receiptQuery = yield* queryEffect(
      'receiptQuery',
      {
        params: function* () {
          return yield* locale();
        },
        loader: () => renderReceipt(ORDER),
      },
      ({ resource }) => ({
        heading: craftComputed('heading', function* () {
          return (yield* settled(resource)).heading;
        }),
        placed: craftComputed('placed', function* () {
          return (yield* settled(resource)).placed;
        }),
        total: craftComputed('total', function* () {
          return (yield* settled(resource)).total;
        }),
        lines: craftComputed('lines', function* () {
          return (yield* settled(resource)).lines;
        }),
      }),
    );

    return { locale, receiptQuery };
  },
  ({ locale, receiptQuery }) =>
    div([
      heading('Translating inside an Effect program'),
      p(
        { class: 'intro' },
        'renderReceipt is a plain Effect that calls translateEffect. Its I18nEffectService requirement is provided by the route Layer, and the active locale is Craft state driving the query params.',
      ),
      div({ class: 'actions' }, [
        button(
          'chooseEnglish',
          {
            type: 'button',
            click: locale.chooseEnglish,
            'aria-pressed': locale.englishPressed,
          },
          'English',
        ),
        button(
          'chooseFrench',
          {
            type: 'button',
            click: locale.chooseFrench,
            'aria-pressed': locale.frenchPressed,
          },
          'Français',
        ),
      ]),
      div({ class: 'receipt' }, [
        heading(receiptQuery.heading),
        p(receiptQuery.placed),
        p(receiptQuery.total),
        p(receiptQuery.lines),
      ]).pipe(
        pendingNode({
          fallback: () =>
            p(
              { class: 'loading', role: 'status', 'aria-live': 'polite' },
              'Translating…',
            ),
        }),
      ),
      p({ class: 'note' }, [
        'Both plural branches are declared, so ',
        span({ class: 'mono' }, 'defineLocaleLike'),
        ' accepts the French catalogue. Drop a key from it and the build fails on the catalogue, before any French speaker sees an English string.',
      ]),
    ]),
);

export default EffectI18nComponent;
