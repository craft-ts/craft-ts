import { Effect, Queue, Schema, Stream } from 'effect';
import { Runtime, Subscription, type Update } from 'foldkit';
import { createKeyedLazy, type HtmlBuilder } from 'foldkit/html';
import { defineMessageUnion } from 'foldkit/message';
import {
  initialModel,
  visibleRows,
  reduce,
  settings,
  begin,
  installActionHandler,
} from '../common.js';

const Row = Schema.Struct({ id: Schema.Number, label: Schema.String });
type Row = typeof Row.Type;
const Model = Schema.Struct({
  rows: Schema.Array(Row),
  filtered: Schema.Boolean,
  revision: Schema.Number,
});
type Model = typeof Model.Type;
const Message = defineMessageUnion({
  ClickedAction: {
    action: Schema.Literals([
      'update-one',
      'update-tenth',
      'reverse',
      'filter',
    ]),
  },
});
type Message = typeof Message.Type;

const update = (
  model: Model,
  message: Message,
): Update.Return<Model, Message> => ({
  model: reduce(model, message.action),
});

// The shared native controls enter Foldkit through its public Subscription API.
// Queueing, update, view and patch all remain inside the measured DOM interval.
const subscriptions = Subscription.make<Model, Message>()(() => ({
  controls: Subscription.persistentEntry(
    Stream.callback<Message>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          installActionHandler((action: Message['action']) =>
            Queue.offerUnsafe(queue, Message.ClickedAction({ action })),
          ),
        ),
        () => Effect.sync(() => installActionHandler(() => {})),
      ),
    ),
  ),
}));

const rowView = (row: Row, position: number, h: HtmlBuilder<Message>) =>
  h.keyed('div')(
    row.id,
    [h.DataAttribute('row', String(row.id))],
    settings.indexes
      ? [
          h.span(
            [h.DataAttribute('position', String(position))],
            [`${position + 1}. `],
          ),
          row.label,
        ]
      : [row.label],
  );

// One stable view function per row, memoized by id and immutable input identity.
// The fixture's key space is bounded to 1,000/5,000 ids for the whole navigation.
const lazyRow = createKeyedLazy();
const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [h.Id('rows'), h.DataAttribute('revision', String(model.revision))],
    visibleRows(model).map((row: Row, position: number) =>
      lazyRow(row.id, rowView, [row, settings.indexes ? position : 0, h]),
    ),
  );

begin();
Runtime.run(
  Runtime.makeElement({
    Model,
    init: () => ({ model: initialModel }),
    update,
    view,
    subscriptions,
    // Foldkit replaces its container. The disposable placeholder keeps the
    // shared #mount observer attached, with the same final DOM as other apps.
    container: document.getElementById('foldkit-root'),
  }),
);
