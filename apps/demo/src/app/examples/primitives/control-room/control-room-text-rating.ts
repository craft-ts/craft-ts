import { button, craftComponent, div, forNode, ifNode, input, label, small, span, type Input } from '@craft-ts/component';
import { craftComputed, craftMethod, craftService, craftUse, state } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { eventValue } from '../../../event-value';
import { example } from '../../shared/example.style';
import { controlRoom } from './control-room.style';
import { ControlRoomView } from './control-room-view.service';

// -- Text field -------------------------------------------------------------

const TEXT_LIMIT = 24;

export const { ControlRoomTextFieldView, provideControlRoomTextFieldView } =
  craftService(
    { name: 'controlRoomTextFieldView', providedIn: 'toProvide' },
    function* () {
      const text = yield* state('text', '', ({ state: read, set }) => ({
        setText: (next: string) => set(next),
        remaining: craftUse(craftComputed('remaining', function* () {
          return `${TEXT_LIMIT - (yield* read()).length} characters left`;
        })),
        tooLong: craftUse(craftComputed('tooLong', function* () {
          return (yield* read()).length > TEXT_LIMIT;
        })),
      }));
      yield* craftMethod('writeText', function* (next: string) {
        yield* text.setText(next);
        yield* ControlRoomView.activity.textEdited();
      });
    },
  );

export const TextField = craftComponent(
  'TextField',
  { providers: [provideControlRoomTextFieldView()] },
  (inputs: { readonly name: Input<string>; readonly hint: Input<string> }) =>
    div({ class: controlRoom.widget }, [
      label({ class: example.label }, [
        inputs.name,
        input('textFieldInput', {
          type: 'text',
          class: example.input,
          placeholder: inputs.hint,
          value: ControlRoomTextFieldView.text,
          input: function* (event) {
            yield* ControlRoomTextFieldView['writeText'](eventValue(event));
          },
        }),
      ]),
      small({ class: example.hint }, ControlRoomTextFieldView.text.remaining),
      ifNode(ControlRoomTextFieldView.text.tooLong, () =>
        small({ class: example.text, 'data-exampleText': 'error' }, 'Too long'),
      ),
    ]),
);

// -- Rating -----------------------------------------------------------------

const STARS = [1, 2, 3, 4, 5];

export const { ControlRoomRatingView, provideControlRoomRatingView } =
  craftService(
    { name: 'controlRoomRatingView', providedIn: 'toProvide' },
    function* () {
      const stars = yield* state('stars', 0, ({ state: read, set }) => ({
        rate: (next: number) => set(next),
        summary: craftUse(craftComputed('summary', function* () {
          const count = yield* read();
          return count === 0 ? 'Not rated' : `${count} / 5`;
        })),
        current: craftUse(craftComputed('current', function* () {
          return yield* read();
        })),
      }));
      yield* craftMethod('rate', function* (next: number) {
        yield* stars.rate(next);
        yield* ControlRoomView.activity.ratingChanged();
      });
    },
  );

export const Rating = craftComponent(
  'Rating',
  { providers: [provideControlRoomRatingView()] },
  (inputs: { readonly name: Input<string> }) =>
    div({ class: controlRoom.widget }, [
      span({ class: example.hint }, inputs.name),
      div(
        { class: controlRoom.actions },
        forNode(STARS, { track: (star) => star }, (star) =>
          button(
            'ratingStar',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'link',
              'aria-label': function* () {
                return `Rate ${yield* star()}`;
              },
              click: function* () {
                yield* ControlRoomRatingView['rate'](yield* star());
              },
            },
            ifNode(
              'ratingStarFilled',
              function* () {
                return (yield* star()) <= (yield* ControlRoomRatingView.stars.current());
              },
              () => '★',
              () => '☆',
            ),
          ),
        ),
      ),
      small({ class: example.hint }, ControlRoomRatingView.stars.summary),
    ]),
);
