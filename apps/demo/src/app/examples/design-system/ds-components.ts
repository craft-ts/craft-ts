import { craftService } from '@craft-ts/core';
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
  type Input,
  type Output,
} from '@craft-ts/component';
import { button } from './components.style';

export { DsAlert, DsMeter } from './ds-components.alert-meter';

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
export const { DsButtonView, provideDsButtonView } = craftService(
  { name: 'dsButtonView', providedIn: 'toProvide' },
  (inputs: {
    readonly label: Input<string>;
    readonly tone: Input<Tone>;
    readonly size: Input<Size>;
    readonly press: Output<() => void>;
  }) => {
    const { label, tone, size, press } = inputs;
    return { label, tone, size, press };
  },
);

export const DsButton = craftComponent(
  'DsButton',
  { providers: [provideDsButtonView()] },
  function* (inputs: {
    readonly label: Input<string>;
    readonly tone: Input<Tone>;
    readonly size: Input<Size>;
    readonly press: Output<() => void>;
  }) {
    const { label, tone, size, press } = yield* DsButtonView(inputs);
    return buttonEl(
      'dsButton',
      {
        type: 'button',
        class: button.root,
        'data-tone': tone,
        'data-size': size,
        click: press,
      },
      label,
    );
  },
);

export type DsButton = typeof DsButton;

/** The same geometry without the fill — a second class, not a second component. */
export const { DsGhostButtonView, provideDsGhostButtonView } = craftService(
  { name: 'dsGhostButtonView', providedIn: 'toProvide' },
  (inputs: {
    readonly label: Input<string>;
    readonly press: Output<() => void>;
  }) => {
    const { label, press } = inputs;
    return { label, press };
  },
);

export const DsGhostButton = craftComponent(
  'DsGhostButton',
  { providers: [provideDsGhostButtonView()] },
  function* (inputs: {
    readonly label: Input<string>;
    readonly press: Output<() => void>;
  }) {
    const { label, press } = yield* DsGhostButtonView(inputs);
    return buttonEl(
      'dsGhostButton',
      {
        type: 'button',
        class: button.ghost,
        click: press,
      },
      label,
    );
  },
);

export type DsGhostButton = typeof DsGhostButton;
