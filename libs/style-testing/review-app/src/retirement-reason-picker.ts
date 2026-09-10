import { craftComponent, label, option, select } from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { eventValue } from './annotation-text';
import { MESSAGES } from './messages';
import { ReviewPreferences } from './preferences.service';
import { RetirementReasonChoice } from './retirement-reason.service';

/**
 * The reason a removed subject is being retired. Self-contained because
 * both `RetirementReasonChoice` and `ReviewPreferences` (for the language
 * the labels render in) are global services — no Input needed.
 */
export const RetirementReasonPicker = craftComponent(
  'RetirementReasonPicker',
  {},
  function* () {
    const { retirementReason, chooseRetirementReason } =
      yield* RetirementReasonChoice();
    const { locale } = yield* ReviewPreferences();
    const t = craftComputed('t', function* () {
      return MESSAGES[yield* locale()];
    });
    return { retirementReason, chooseRetirementReason, t };
  },
  ({ retirementReason, chooseRetirementReason, t }) => [
    label({ htmlFor: 'retirement-reason' }, function* () {
      return (yield* t()).retirementReason;
    }),
    select(
      'RetirementReason',
      {
        id: 'retirement-reason',
        value: retirementReason,
        *change(event: Event) {
          yield* chooseRetirementReason(eventValue(event));
        },
      },
      [
        option({ value: 'superseded' }, function* () {
          return (yield* t()).superseded;
        }),
        option({ value: 'defect' }, function* () {
          return (yield* t()).defect;
        }),
        option({ value: 'derivation' }, function* () {
          return (yield* t()).derivation;
        }),
      ],
    ),
  ],
);
