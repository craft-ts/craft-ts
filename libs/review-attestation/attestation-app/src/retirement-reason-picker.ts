import { craftComponent, label, option, select } from '@craft-ts/component';
import { eventValue } from './annotation-text';
import { ReviewPreferences } from './preferences.service';
import { decisionColumn } from './review-card.style';
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
    return [
      label(
        { class: decisionColumn.retirementLabel, htmlFor: 'retirement-reason' },
        function* () {
          return (yield* (yield* ReviewPreferences()).locale.messages()).retirementReason;
        },
      ),
      select(
        'RetirementReason',
        {
          id: 'retirement-reason',
          value: function* () {
            return yield* (yield* RetirementReasonChoice()).retirementReason();
          },
          *change(event: Event) {
            (yield* RetirementReasonChoice()).chooseRetirementReason(
              eventValue(event),
            );
          },
        },
        [
          option({ value: 'superseded' }, function* () {
            return (yield* (yield* ReviewPreferences()).locale.messages()).superseded;
          }),
          option({ value: 'defect' }, function* () {
            return (yield* (yield* ReviewPreferences()).locale.messages()).defect;
          }),
          option({ value: 'derivation' }, function* () {
            return (yield* (yield* ReviewPreferences()).locale.messages()).derivation;
          }),
        ],
      ),
    ];
  },
);
