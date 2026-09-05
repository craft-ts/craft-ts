/* eslint-disable craft-ts/no-hardcoded-design-values -- The demo intentionally exposes its visual contract. */
import {
  craftComponent,
  div,
  heading,
  label,
  option,
  p,
  section,
  select,
  span,
  strong,
} from '@craft-ts/component';
import {
  ClientCurrency,
  provideClientCurrency,
  provideClientUnits,
} from './i18n.service';
import { I18n } from './i18n-runtime.service';
import { eventValue } from '../../event-value';

type DemoClientId = 'acme' | 'globex';

function eventClientId(event: Event): DemoClientId {
  return eventValue(event) === 'globex' ? 'globex' : 'acme';
}

const ORDER_DATE = new Date('2026-08-25T14:30:00Z');
const LAST_SYNC_DAYS = -2;

export const TypeSafeI18nDemo = craftComponent(
  'TypeSafeI18nDemo',
  {
    styles: `
      :scope{display:grid;gap:1.25rem;max-width:70rem;margin:0 auto;color:#172033}
      :scope h1{margin:0;font-size:clamp(1.7rem,4vw,2.6rem);line-height:1.15}
      :scope p{margin:0;line-height:1.55}
      .intro{display:grid;gap:.5rem}.intro p{max-width:60rem;color:#526078}
      .toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:.65rem;padding:1rem 1.15rem;border:1px solid #cbd5e1;border-radius:.8rem;background:#f8fafc}
      .toolbar label{font-weight:700}.toolbar select{min-width:10rem;padding:.5rem .65rem;border:1px solid #94a3b8;border-radius:.45rem;background:#fff;color:inherit;font:inherit}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem}
      .card{display:grid;gap:.65rem;min-height:8rem;padding:1.1rem;border:1px solid #dbe3f0;border-radius:.8rem;background:#fff;box-shadow:0 .35rem 1.2rem #1720330d}
      .card strong{font-size:.9rem;color:#526078}.card p{overflow-wrap:anywhere}
      .note{padding:1rem;border-left:.25rem solid #2563eb;background:#eff6ff;color:#1e3a8a}
      @media (max-width:520px){.grid{grid-template-columns:1fr}.toolbar{align-items:stretch;flex-direction:column}}
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
    providers: [provideClientCurrency(), provideClientUnits()],
  },
  function* () {
    return {
      ...(yield* I18n()),
      clientCurrency: yield* ClientCurrency(),
    };
  },
  ({ language, translate, clientCurrency }) =>
    section({ 'aria-labelledby': 'i18n-title' }, [
      div({ class: 'intro' }, [
        heading({ id: 'i18n-title' }, translate('page.title')),
        p(translate('page.intro')),
      ]),
      div({ class: 'toolbar' }, [
        label({ htmlFor: 'i18n-language' }, translate('page.language')),
        select(
          'i18n-language',
          {
            id: 'i18n-language',
            value: language,
            'aria-label': 'Language',
            change: language.change,
          },
          [
            option({ value: 'en-US' }, 'English'),
            option({ value: 'fr-FR' }, 'Français'),
          ],
        ),
        label({ htmlFor: 'i18n-client' }, 'Client'),
        select(
          'i18n-client',
          {
            id: 'i18n-client',
            value: clientCurrency.client,
            'aria-label': 'Client',
            *change(event: Event) {
              yield* clientCurrency.changeClient(eventClientId(event));
            },
          },
          [
            option({ value: 'acme' }, 'Acme · CHF'),
            option({ value: 'globex' }, 'Globex · USD'),
          ],
        ),
      ]),
      div({ class: 'grid' }, [
        div({ class: 'card' }, [
          strong('Money + date'),
          p(
            translate('page.order', {
              amount: 1234567.89,
              // The schema turns this ISO string into the `Date` the formatter
              // wants, so the call site never builds one.
              placedAt: '2026-08-25T14:30:00Z',
              weight: 12.4,
            }),
          ),
        ]),
        div({ class: 'card' }, [
          strong('Plural + fraction'),
          p(translate('page.items', { count: 1.5 })),
          p(translate('page.items', { count: 1 })),
        ]),
        div({ class: 'card' }, [
          strong('Custom token'),
          p(translate('page.status', { status: 'paid' })),
          p(translate('page.custom')),
        ]),
        div({ class: 'card' }, [
          strong('Number profiles'),
          p(
            translate('page.metrics', {
              revenue: 1234567,
              visitors: 98765,
              rate: 0.27523334,
            }),
          ),
        ]),
        div({ class: 'card' }, [
          strong('Date profiles'),
          p(
            translate('page.dates', {
              shortDate: ORDER_DATE,
              timestamp: ORDER_DATE,
            }),
          ),
        ]),
        div({ class: 'card' }, [
          strong('Relative time'),
          p(translate('page.relative', { daysAgo: LAST_SYNC_DAYS })),
        ]),
      ]),
      div({ class: 'note' }, [span(translate('page.custom'))]),
    ]),
);

export default TypeSafeI18nDemo;
