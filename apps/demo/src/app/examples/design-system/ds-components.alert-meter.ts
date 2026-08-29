import { craftComponent, div, span, type Input } from '@craft-ts/component';
import { assign, unit } from '@craft-ts/style';
import { alert, meter, meterVars } from './components.style';

/** A banner whose accent colour is one variable written by the tone axis. */
export const DsAlert = craftComponent(
  'DsAlert',
  {},
  (
    message: Input<string>,
    tone: Input<'neutral' | 'info' | 'success' | 'warning' | 'danger'>,
  ) => ({ message, tone }),
  ({ message, tone }) =>
    div(
      {
        class: alert.root,
        role: 'status',
        'data-tone': tone,
      },
      message,
    ),
);

export type DsAlert = typeof DsAlert;

/** A progress meter whose dynamic width is emitted through a custom property. */
export const DsMeter = craftComponent(
  'DsMeter',
  {},
  (value: Input<number>, caption: Input<string>) => ({ value, caption }),
  ({ value, caption }) =>
    div({ class: meter.root }, [
      div(
        {
          class: meter.track,
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': value,
          'aria-label': caption,
        },
        [
          div({
            class: meter.fill,
            style: function* () {
              return assign(meterVars.value, unit.pct(yield* value()));
            },
          }),
        ],
      ),
      span({ class: meter.label }, function* () {
        return `${yield* caption()} — ${yield* value()}%`;
      }),
    ]),
);

export type DsMeter = typeof DsMeter;
