import { craftComputed, craftService } from '@craft-ts/core';
import { craftComponent, div, span, type Input } from '@craft-ts/component';
import { assign, unit } from '@craft-ts/style';
import { alert, meter, meterVars } from './components.style';

/** A banner whose accent colour is one variable written by the tone axis. */
export const { DsAlertView, provideDsAlertView } = craftService(
  { name: 'dsAlertView', providedIn: 'toProvide' },
  (inputs: {
    readonly message: Input<string>;
    readonly tone: Input<'neutral' | 'info' | 'success' | 'warning' | 'danger'>;
  }) => {
    const { message, tone } = inputs;
    return { message, tone };
  },
);

export const DsAlert = craftComponent(
  'DsAlert',
  { providers: [provideDsAlertView()] },
  function* (inputs: {
    readonly message: Input<string>;
    readonly tone: Input<'neutral' | 'info' | 'success' | 'warning' | 'danger'>;
  }) {
    const { message, tone } = yield* DsAlertView(inputs);
    return div(
      {
        class: alert.root,
        role: 'status',
        'data-tone': tone,
      },
      message,
    );
  },
);

export type DsAlert = typeof DsAlert;

/** A progress meter whose dynamic width is emitted through a custom property. */
export const { DsMeterView, provideDsMeterView } = craftService(
  { name: 'dsMeterView', providedIn: 'toProvide' },
  (inputs: {
    readonly value: Input<number>;
    readonly caption: Input<string>;
  }) => {
    const { value, caption } = inputs;
    const fillStyle = craftComputed('fillStyle', function* () {
      return assign(meterVars.value, unit.pct(yield* value()));
    });
    return { value, caption, fillStyle };
  },
);

export const DsMeter = craftComponent(
  'DsMeter',
  { providers: [provideDsMeterView()] },
  function* (inputs: {
    readonly value: Input<number>;
    readonly caption: Input<string>;
  }) {
    const { value, caption, fillStyle } = yield* DsMeterView(inputs);
    return div({ class: meter.root }, [
      div(
        {
          class: meter.track,
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': value,
          'aria-label': caption,
        },
        [div({ class: meter.fill, style: fillStyle })],
      ),
      span({ class: meter.label }, function* () {
        return `${yield* caption()} — ${yield* value()}%`;
      }),
    ]);
  },
);

export type DsMeter = typeof DsMeter;
