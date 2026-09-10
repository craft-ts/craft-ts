import { craftMethod, craftService, state } from '@craft-ts/core';
import {
  initialRetirementReason,
  isRetirementReason,
  type RetirementReason,
} from './devtool-view-state';

/** Why a removed subject is being retired, chosen once per card. */
export const { RetirementReasonChoice } = craftService(
  { name: 'RetirementReasonChoice', providedIn: 'global' },
  function* () {
    const retirementReason = yield* state(
      'retirementReason',
      initialRetirementReason(),
      ({ set }) => ({ choose: (value: RetirementReason) => set(value) }),
    );

    // Takes the raw select value and no-ops on anything unexpected, so a
    // template's change handler stays a single yield with no local guard.
    const chooseRetirementReason = craftMethod(
      'chooseRetirementReason',
      function* (value: string) {
        if (!isRetirementReason(value)) return;
        yield* retirementReason.choose(value);
      },
    );

    return { retirementReason, chooseRetirementReason };
  },
);
