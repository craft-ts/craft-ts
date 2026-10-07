import {
  a,
  button,
  craftComponent,
  span,
  type Input,
  type Output,
} from '@craft-ts/component';
import { DocIcon, type IconName } from '../icon/icon.ts';
import { buttonUi, iconButtonUi } from './button.style.ts';

export type ButtonVariant =
  | 'primary'
  | 'tonal'
  | 'secondary'
  | 'danger'
  | 'link';

export interface ButtonInput {
  readonly label: Input<string>;
  readonly variant: Input<ButtonVariant>;
  readonly press: Output<() => void>;
  /** Cannot be pressed. Leaves the tab order. */
  readonly disabled: Input<boolean>;
  /** A result is pending: the button shows a spinner and refuses presses. */
  readonly loading: Input<boolean>;
}

/**
 * The button. One class and three attributes: the variant, the busy flag and
 * the native `disabled`. The sheet answers each one; nothing here builds a
 * class name.
 */
export const DocButton = craftComponent(
  'DocButton',
  {},
  (input: ButtonInput) =>
    button(
      'docButton',
      {
        type: 'button', // button-has-type
        class: buttonUi.root,
        'data-variant': input.variant,
        'data-loading': function* () {
          return (yield* input.loading()) ? 'true' : 'false';
        },
        'aria-busy': function* () {
          return (yield* input.loading()) ? 'true' : 'false';
        },
        // A busy button is not pressable either, without leaving the tab order
        // for the user who is waiting on it.
        disabled: function* () {
          return yield* input.disabled();
        },
        click: function* () {
          if (!(yield* input.loading())) input.press();
        },
      },
      [span(input.label)],
    ),
);

export interface IconButtonInput {
  /** What the button does. The accessible name: it has no visible text. */
  readonly label: Input<string>;
  readonly icon: Input<IconName>;
  readonly press: Output<() => void>;
  readonly disabled: Input<boolean>;
}

/** A square button that holds a glyph and nothing else. */
export const DocIconButton = craftComponent(
  'DocIconButton',
  {},
  (input: IconButtonInput) =>
    button(
      'docIconButton',
      {
        type: 'button',
        class: iconButtonUi.root,
        'aria-label': input.label,
        title: input.label,
        disabled: function* () {
          return yield* input.disabled();
        },
        click: input.press,
      },
      [
        DocIcon({
          name: input.icon,
          size: function* () {
            return 'md' as const;
          },
        }),
      ],
    ),
);

export interface LinkButtonInput {
  readonly label: Input<string>;
  readonly href: Input<string>;
  readonly variant: Input<ButtonVariant>;
}

/**
 * A link that looks like a button: the same sheet, an `<a>` underneath. A
 * button changes the page; a link goes somewhere, and a link is what a call to
 * action on a docs page is.
 */
export const DocLinkButton = craftComponent(
  'DocLinkButton',
  {},
  (input: LinkButtonInput) =>
    a(
      'docLinkButton',
      {
        class: buttonUi.root,
        href: input.href,
        'data-variant': input.variant,
      },
      [span(input.label)],
    ),
);
