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
import { example } from '../../effect-demo.style';

const ORDER = {
  totalCents: 128_450,
  lineCount: 3,
  placedAt: Date.UTC(2026, 7, 25, 14, 30),
};

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
  {},
  function* () {
    const locale = yield* state('locale', 'en-US', ({ set, state: read }) => {
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
    });

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
    div({ class: example.card, 'data-exampleTint': 'violet' }, [
      heading({ class: example.title }, 'Translating inside an Effect program'),
      p(
        { class: example.intro },
        'renderReceipt is a plain Effect that calls translateEffect. Its I18nEffectService requirement is provided by the route Layer, and the active locale is Craft state driving the query params.',
      ),
      div({ class: example.actions }, [
        button(
          'chooseEnglish',
          {
            class: example.button,
            type: 'button',
            click: locale.chooseEnglish,
            'aria-pressed': locale.englishPressed,
          },
          'English',
        ),
        button(
          'chooseFrench',
          {
            class: example.button,
            type: 'button',
            click: locale.chooseFrench,
            'aria-pressed': locale.frenchPressed,
          },
          'Français',
        ),
      ]),
      div({ class: example.receipt }, [
        heading({ class: example.receiptTitle }, receiptQuery.heading),
        p({ class: example.receiptText }, receiptQuery.placed),
        p({ class: example.receiptText }, receiptQuery.total),
        p({ class: example.receiptText }, receiptQuery.lines),
      ]).pipe(
        pendingNode({
          fallback: () =>
            p(
              { class: example.loading, role: 'status', 'aria-live': 'polite' },
              'Translating…',
            ),
        }),
      ),
      p({ class: example.note }, [
        'Both plural branches are declared, so ',
        span({ class: example.mono }, 'defineLocaleLike'),
        ' accepts the French catalogue. Drop a key from it and the build fails on the catalogue, before any French speaker sees an English string.',
      ]),
    ]),
);

export default EffectI18nComponent;
