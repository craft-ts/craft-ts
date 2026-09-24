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
import { example } from '../shared/example.style';

type DemoClientId = 'acme' | 'globex';

function eventClientId(event: Event): DemoClientId {
  return eventValue(event) === 'globex' ? 'globex' : 'acme';
}

const ORDER_DATE = new Date('2026-08-25T14:30:00Z');
const LAST_SYNC_DAYS = -2;

export const TypeSafeI18nDemo = craftComponent(
  'TypeSafeI18nDemo',
  {
    providers: [provideClientCurrency(), provideClientUnits()],
  },
  function* () {
    return {
      ...(yield* I18n()),
      clientCurrency: yield* ClientCurrency(),
    };
  },
  ({ language, translate, clientCurrency }) =>
    section({ class: example.stack, 'aria-labelledby': 'i18n-title' }, [
      div({ class: example.stack }, [
        heading(
          { class: example.title, id: 'i18n-title' },
          translate('page.title'),
        ),
        p(
          { class: example.text, 'data-exampleText': 'muted' },
          translate('page.intro'),
        ),
      ]),
      div({ class: example.toolbar }, [
        label(
          { class: example.label, htmlFor: 'i18n-language' },
          translate('page.language'),
        ),
        select(
          'i18n-language',
          {
            class: example.select,
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
        label({ class: example.label, htmlFor: 'i18n-client' }, 'Client'),
        select(
          'i18n-client',
          {
            class: example.select,
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
      div({ class: example.tiles }, [
        div({ class: example.box }, [
          strong({ class: example.label }, 'Money + date'),
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
        div({ class: example.box }, [
          strong({ class: example.label }, 'Plural + fraction'),
          p(translate('page.items', { count: 1.5 })),
          p(translate('page.items', { count: 1 })),
        ]),
        div({ class: example.box }, [
          strong({ class: example.label }, 'Custom token'),
          p(translate('page.status', { status: 'paid' })),
          p(translate('page.custom')),
        ]),
        div({ class: example.box }, [
          strong({ class: example.label }, 'Number profiles'),
          p(
            translate('page.metrics', {
              revenue: 1234567,
              visitors: 98765,
              rate: 0.27523334,
            }),
          ),
        ]),
        div({ class: example.box }, [
          strong({ class: example.label }, 'Date profiles'),
          p(
            translate('page.dates', {
              shortDate: ORDER_DATE,
              timestamp: ORDER_DATE,
            }),
          ),
        ]),
        div({ class: example.box }, [
          strong({ class: example.label }, 'Relative time'),
          p(translate('page.relative', { daysAgo: LAST_SYNC_DAYS })),
        ]),
      ]),
      div({ class: example.note }, [span(translate('page.custom'))]),
    ]),
);

export default TypeSafeI18nDemo;
