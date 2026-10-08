import {
  craftService,
  craftExpose,
  type CraftServiceInput,
} from '@craft-ts/core';
import {
  craftComponent,
  div,
  span,
  type Input,
  withComponentProviders,
} from '@craft-ts/component';
import { assign, unit } from '@craft-ts/style';
import { alert, meter, meterVars } from './components.style';

/** A banner whose accent colour is one variable written by the tone axis. */
export const { DsAlertView, provideDsAlertView } = craftService(
  { name: 'dsAlertView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: {
      readonly message: CraftServiceInput<string>;
      readonly tone: CraftServiceInput<'neutral' | 'info' | 'success' | 'warning' | 'danger'>;
    };
  }) {
    const { message, tone } = inputs.$provided;
    yield* craftExpose('message', message);
    yield* craftExpose('tone', tone);
  },
);

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
).pipe(
  withComponentProviders(({ message, tone }) => [
    provideDsAlertView({ message, tone }),
  ]),
);

export type DsAlert = typeof DsAlert;

/** A progress meter whose dynamic width is emitted through a custom property. */
export const { DsMeterView, provideDsMeterView } = craftService(
  { name: 'dsMeterView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: {
      readonly value: CraftServiceInput<number>;
      readonly caption: CraftServiceInput<string>;
    };
  }) {
    const { value, caption } = inputs.$provided;
    yield* craftExpose('value', value);
    yield* craftExpose('caption', caption);
  },
);

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
).pipe(
  withComponentProviders(({ value, caption }) => [
    provideDsMeterView({ value, caption }),
  ]),
);

export type DsMeter = typeof DsMeter;
