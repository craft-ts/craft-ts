import {
  button,
  craftComponent,
  div,
  span,
  type Input,
  type Output,
} from '@craft-ts/component';
import { switchUi } from './switch.style.ts';

export interface SwitchInput {
  /** What the switch controls, as a visible label. */
  readonly label: Input<string>;
  /** Ties the label to the switch. Unique on the page. */
  readonly controlId: Input<string>;
  readonly on: Input<boolean>;
  readonly disabled: Input<boolean>;
  /** Called with the state the switch is asking for. */
  readonly toggle: Output<(next: boolean) => void>;
}

/**
 * An on/off switch. It is controlled: the caller owns the state and hands it
 * back through `on`, so a switch that drives the theme and one that drives a
 * preference are the same component.
 */
export const DocSwitch = craftComponent('DocSwitch', {}, function* (
  props: SwitchInput,
) {
  const id = yield* props.controlId();
  const label = yield* props.label();
  return div({ class: switchUi.row }, [
    button(
      'docSwitch',
      {
        type: 'button',
        class: switchUi.track,
        role: 'switch',
        id,
        'aria-labelledby': `${id}-label`,
        'aria-checked': function* () {
          return (yield* props.on()) ? 'true' : 'false';
        },
        'data-checked': function* () {
          return (yield* props.on()) ? 'true' : 'false';
        },
        disabled: function* () {
          return yield* props.disabled();
        },
        *click() {
          props.toggle(!(yield* props.on()));
        },
      },
    ),
    span({ id: `${id}-label` }, label),
  ]);
});
