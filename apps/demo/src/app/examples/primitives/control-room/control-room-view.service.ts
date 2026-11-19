import { craftComputed, craftService, craftUse, state } from '@craft-ts/core';

type Units = 'metric' | 'imperial';

export const { ControlRoomView, provideControlRoomView } = craftService(
  { name: 'controlRoomView', providedIn: 'toProvide' },
  function* () {
    yield* state('activity', 0, ({ state: read, update }) => {
      const record = () => update((count) => count + 1);
      return {
        gaugeDecremented: record,
        gaugeIncremented: record,
        gaugeReset: record,
        switchToggled: record,
        sliderMoved: record,
        textEdited: record,
        ratingChanged: record,
        disclosureToggled: record,
        tabSelected: record,
        stepperMovedBack: record,
        stepperAdvanced: record,
        colorChosen: record,
        checklistToggled: record,
        label: craftUse(craftComputed('activityLabel', function* () {
          const count = yield* read();
          return count === 0 ? 'No interaction yet' : `${count} interaction${count > 1 ? 's' : ''}`;
        })),
      };
    });
    yield* state('compact', false, ({ state: read, update }) => ({
      toggle: () => update((value) => !value),
      density: craftUse(craftComputed('density', function* () {
        return (yield* read()) ? 'compact' : 'comfortable';
      })),
    }));
    const initialUnits = (): Units => 'metric';
    yield* state('units', initialUnits(), ({ set }) => ({
      chooseMetric: () => set('metric'),
      chooseImperial: () => set('imperial'),
    }));
  },
);
