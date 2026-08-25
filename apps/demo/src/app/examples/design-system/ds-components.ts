/**
 * The components of the mini design system.
 *
 * Three of them, and the split is deliberate: `button`, `alert` and `meter` are
 * components because they own behaviour or a slot of dynamic state, while
 * `stack` and `card` stay **sheets** applied directly by the caller. A design
 * system does not have to wrap every rectangle in a component, and pretending
 * otherwise is how you end up with fifty components that only set padding.
 *
 * What every one of them has in common: the class is a constant, and the
 * variant travels as a `data-*` attribute. Nothing here builds a class string.
 */
import {
  button as buttonEl,
  craftComponent,
  div,
  span,
  type Input,
  type Output,
} from '@craft-ts/component';
import { assign, unit } from '@craft-ts/style';
import { alert, button, meter, meterVars } from './components.style';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type Size = 'sm' | 'md' | 'lg';

/**
 * A button whose look is one class and two attributes.
 *
 * Compare with what this replaced across the demo: `class: function* () { return
 * \`btn btn-${tone} btn-${size}\` }`. That version had fifteen possible class
 * strings and no way to enumerate them; this one has one class, and the fifteen
 * combinations are rules the emitter already wrote.
 */
export const DsButton = craftComponent(
  'DsButton',
  {},
  (
    label: Input<string>,
    tone: Input<Tone>,
    size: Input<Size>,
    press: Output<() => void>,
  ) => ({ label, tone, size, press }),
  ({ label, tone, size, press }) =>
    buttonEl(
      'dsButton',
      {
        type: 'button',
        class: button.root,
        'data-tone': function* () {
          return yield* tone();
        },
        'data-size': function* () {
          return yield* size();
        },
        *click() {
          yield* press();
        },
      },
      function* () {
        return yield* label();
      },
    ),
);

export type DsButton = typeof DsButton;

/** The same geometry without the fill — a second class, not a second component. */
export const DsGhostButton = craftComponent(
  'DsGhostButton',
  {},
  (label: Input<string>, press: Output<() => void>) => ({ label, press }),
  ({ label, press }) =>
    buttonEl(
      'dsGhostButton',
      {
        type: 'button',
        class: button.ghost,
        *click() {
          yield* press();
        },
      },
      function* () {
        return yield* label();
      },
    ),
);

export type DsGhostButton = typeof DsGhostButton;

/** A banner whose accent colour is one variable written by the tone axis. */
export const DsAlert = craftComponent(
  'DsAlert',
  {},
  (message: Input<string>, tone: Input<Tone>) => ({ message, tone }),
  ({ message, tone }) =>
    div(
      {
        class: alert.root,
        role: 'status',
        'data-tone': function* () {
          return yield* tone();
        },
      },
      function* () {
        return yield* message();
      },
    ),
);

export type DsAlert = typeof DsAlert;

/**
 * The dynamic half of the system, in one component.
 *
 * The fill width comes from a signal, so it cannot be a class — there is no
 * finite set of widths to emit at build time. It goes through a `<percentage>`
 * custom property instead, written with `assign(...)`. The browser validates
 * the value because the property is registered; a length would simply not
 * apply, rather than applying wrongly.
 */
export const DsMeter = craftComponent(
  'DsMeter',
  {},
  (value: Input<number>, label: Input<string>) => ({ value, label }),
  ({ value, label }) =>
    div({ class: meter.root }, [
      div(
        {
          class: meter.track,
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': function* () {
            return yield* value();
          },
          'aria-label': function* () {
            return yield* label();
          },
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
        return `${yield* label()} — ${yield* value()}%`;
      }),
    ]),
);

export type DsMeter = typeof DsMeter;
