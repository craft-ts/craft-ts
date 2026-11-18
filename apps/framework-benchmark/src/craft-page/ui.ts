import {
  button,
  craftComponent,
  div,
  span,
  type Input,
} from '@craft-ts/component';
import { cx, glyph, initials, type Action } from '../page-common.js';
import { CurrentUser, Page } from './store.js';

/** A constant component input: inputs are read with `yield*`, like any reactive value. */
export const fixed = <T>(value: T) =>
  function* () {
    return value;
  };

/** An input, or an item of a `forNode`: anything read with `yield*`. */
type Reader<T> = () => Generator<any, T, any>;

/** A reader of one field of an input. */
export const pluck = <T, K extends keyof T>(input: Reader<T>, key: K) =>
  function* () {
    return (yield* input())[key];
  };

/** A reader of something computed from an input. */
export const derive = <T, R>(input: Reader<T>, map: (value: T) => R) =>
  function* () {
    return map(yield* input());
  };

export const Icon = craftComponent(
  'Icon',
  {},
  (inputs: { readonly name: Input<string> }) =>
    span(
      {
        class: function* () {
          return cx('icon', `icon--${yield* inputs.name()}`);
        },
        'aria-hidden': 'true',
      },
      function* () {
        return glyph(yield* inputs.name());
      },
    ),
);

export const Badge = craftComponent(
  'Badge',
  {},
  (inputs: { readonly tone: Input<string>; readonly text: Input<string> }) =>
    span(
      {
        class: function* () {
          return cx(
            'badge',
            `badge--${yield* inputs.tone()}`,
            (yield* Page.isDark()) && 'is-dark',
          );
        },
      },
      inputs.text,
    ),
);

export const Avatar = craftComponent(
  'Avatar',
  {},
  (inputs: { readonly name: Input<string>; readonly size: Input<string> }) =>
    span(
      {
        class: function* () {
          return cx(
            'avatar',
            `avatar--${yield* inputs.size()}`,
            (yield* inputs.name()) === (yield* CurrentUser.userName()) &&
              'avatar--me',
          );
        },
        title: inputs.name,
      },
      function* () {
        return initials(yield* inputs.name());
      },
    ),
);

export const Button = craftComponent(
  'Button',
  {},
  (inputs: {
    readonly label: Input<string>;
    readonly variant: Input<string>;
    readonly action: Input<Action>;
  }) =>
    button(
      'press',
      {
        type: 'button',
        class: function* () {
          return cx(
            'btn',
            `btn--${yield* inputs.variant()}`,
            (yield* Page.isDark()) && 'is-dark',
          );
        },
        *click() {
          yield* Page.model.dispatch(yield* inputs.action());
        },
      },
      inputs.label,
    ),
);

export const IconButton = craftComponent(
  'IconButton',
  {},
  (inputs: {
    readonly icon: Input<string>;
    readonly label: Input<string>;
    readonly action: Input<Action>;
    readonly active: Input<boolean>;
  }) =>
    button(
      'iconPress',
      {
        type: 'button',
        class: function* () {
          return cx('icon-btn', (yield* inputs.active()) && 'is-active');
        },
        title: inputs.label,
        'aria-label': inputs.label,
        *click() {
          yield* Page.model.dispatch(yield* inputs.action());
        },
      },
      Icon({ name: inputs.icon }),
    ),
);

export const Tag = craftComponent(
  'Tag',
  {},
  (inputs: { readonly text: Input<string> }) =>
    span({ class: 'tag' }, inputs.text),
);

export const Timestamp = craftComponent(
  'Timestamp',
  {},
  (inputs: { readonly text: Input<string> }) =>
    span({ class: 'timestamp' }, inputs.text),
);

export const Counter = craftComponent(
  'Counter',
  {},
  (inputs: { readonly icon: Input<string>; readonly value: Input<number> }) =>
    span({ class: 'counter' }, [
      Icon({ name: inputs.icon }),
      span({ class: 'counter__value' }, function* () {
        return String(yield* inputs.value());
      }),
    ]),
);
