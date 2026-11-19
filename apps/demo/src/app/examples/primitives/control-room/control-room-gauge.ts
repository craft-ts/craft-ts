import { button, craftComponent, div, small, span, strong, withComponentProviders, type Input } from '@craft-ts/component';
import { craftComputed, craftMethod, craftService, craftUse, state, type CraftServiceInput } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { example } from '../../shared/example.style';
import { controlRoom } from './control-room.style';
import { ControlRoomView } from './control-room-view.service';
import { UNIT_LABELS, type GaugeKind } from './control-room.model';

// -- Gauge: a reading, three buttons, a unit that follows the page ----------

// The gauge keeps how far it was moved from its starting reading; the reading
// itself is derived from the component's inputs.
export const { ControlRoomGaugeView, provideControlRoomGaugeView } =
  craftService(
    { name: 'controlRoomGaugeView', providedIn: 'toProvide' },
    function* (inputs: {
      readonly $provided: {
        readonly kind: CraftServiceInput<GaugeKind>;
        readonly start: CraftServiceInput<number>;
        readonly max: CraftServiceInput<number>;
      };
    }) {
      const offset = yield* state('offset', 0, ({ state: read, update, set }) => {
        return {
          increment: () => update((current) => current + 1),
          decrement: () => update((current) => current - 1),
          reset: () => set(0),
          reading: craftUse(craftComputed('reading', function* () {
            return Math.max(0, (yield* inputs.$provided.start()) + (yield* read()));
          })),
          level: craftUse(craftComputed('level', function* () {
            const ratio = Math.max(0, (yield* inputs.$provided.start()) + (yield* read())) / (yield* inputs.$provided.max());
            if (ratio >= 0.85) return 'high';
            if (ratio <= 0.15) return 'low';
            return 'ok';
          })),
          readingLabel: craftUse(craftComputed('readingLabel', function* () {
            const units = yield* ControlRoomView.units();
            const kind = yield* inputs.$provided.kind();
            const value = Math.max(0, (yield* inputs.$provided.start()) + (yield* read()));
            return `${value} ${UNIT_LABELS[kind][units]}`;
          })),
          percentLabel: craftUse(craftComputed('percentLabel', function* () {
            const value = Math.max(0, (yield* inputs.$provided.start()) + (yield* read()));
            const percent = Math.round((value / (yield* inputs.$provided.max())) * 100);
            return `${percent}% of max`;
          })),
        };
      });
      yield* craftMethod('decrement', function* () {
        yield* offset.decrement();
        yield* ControlRoomView.activity.gaugeDecremented();
      });
      yield* craftMethod('increment', function* () {
        yield* offset.increment();
        yield* ControlRoomView.activity.gaugeIncremented();
      });
      yield* craftMethod('reset', function* () {
        yield* offset.reset();
        yield* ControlRoomView.activity.gaugeReset();
      });
    },
  );

export const Gauge = craftComponent(
  'Gauge',
  {},
  (inputs: {
    readonly name: Input<string>;
    readonly kind: Input<GaugeKind>;
    readonly start: Input<number>;
    readonly max: Input<number>;
  }) =>
    div(
      {
        class: controlRoom.widget,
        'data-controlRoomLevel': ControlRoomGaugeView.offset.level,
      },
      [
        span({ class: example.hint }, inputs.name),
        strong(ControlRoomGaugeView.offset.readingLabel),
        small({ class: example.hint }, ControlRoomGaugeView.offset.percentLabel),
        div({ class: controlRoom.actions }, [
          button(
            'gaugeDecrement',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              click: ControlRoomGaugeView['decrement'],
            },
            '−',
          ),
          button(
            'gaugeIncrement',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              click: ControlRoomGaugeView['increment'],
            },
            '+',
          ),
          button(
            'gaugeReset',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'link',
              click: ControlRoomGaugeView['reset'],
            },
            'Reset',
          ),
        ]),
      ],
    ),
).pipe(
  withComponentProviders(({ kind, start, max }) => [
    provideControlRoomGaugeView({ kind, start, max }),
  ]),
);
