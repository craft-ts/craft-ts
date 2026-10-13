import {
  craftComponent,
  div,
  span,
  type Input,
} from '@craft-ts/component';
import { assign, unit } from '@craft-ts/style';
import { alert, meter, meterVars } from './components.style';

/** A banner whose accent colour is one variable written by the tone axis. */
export const DsAlert = craftComponent(
  'DsAlert',
  {},
  (inputs: {
    readonly message: Input<string>;
    readonly tone: Input<'neutral' | 'info' | 'success' | 'warning' | 'danger'>;
  }) =>
    div(
      {
        class: alert.root,
        role: 'status',
        'data-tone': inputs.tone,
      },
      inputs.message,
    ),
);

export type DsAlert = typeof DsAlert;

/** A progress meter whose dynamic width is emitted through a custom property. */
export const DsMeter = craftComponent(
  'DsMeter',
  {},
  (inputs: {
    readonly value: Input<number>;
    readonly caption: Input<string>;
  }) =>
    div({ class: meter.root }, [
      div(
        {
          class: meter.track,
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': inputs.value,
          'aria-label': inputs.caption,
        },
        [
          div({
            class: meter.fill,
            // The width is a typed variable, written by assign.
            style: function* () {
              return assign(
                meterVars.value,
                unit.pct(yield* inputs.value()),
              );
            },
          }),
        ],
      ),
      span({ class: meter.label }, function* () {
        return `${yield* inputs.caption()} — ${yield* inputs.value()}%`;
      }),
    ]),
);

export type DsMeter = typeof DsMeter;
