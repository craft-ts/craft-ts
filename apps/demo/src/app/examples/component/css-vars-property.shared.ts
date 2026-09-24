import { craftComponent, div, span, type Input } from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { assign, unit } from '@craft-ts/style';
import { meter, meterVars } from './css-vars.style';

/** Reads the registered `<percentage>` and never writes it: 35%, its initial value. */
export const RegisteredMeter = craftComponent(
  'RegisteredMeter',
  {},
  () => ({}),
  () =>
    div({ class: meter.root }, [
      span('Initial value: 35%'),
      div({ class: meter.track }, div({ class: meter.fill })),
    ]),
);

/**
 * The same meter with the value assigned at runtime. The variable is typed, so
 * the browser interpolates it and the width transition runs on every change.
 */
export const AssignedMeter = craftComponent(
  'AssignedMeter',
  {},
  (value: Input<number>) => ({
    value,
    label: craftComputed('label', function* () {
      return `Assigned value: ${yield* value()}%`;
    }),
  }),
  ({ value, label }) =>
    div({ class: meter.root }, [
      span(label),
      div(
        { class: meter.track },
        div({
          class: meter.fill,
          style: function* () {
            return assign(meterVars.value, unit.pct(yield* value()));
          },
        }),
      ),
    ]),
);
