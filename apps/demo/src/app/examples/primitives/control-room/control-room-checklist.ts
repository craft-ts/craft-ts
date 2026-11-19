import { button, craftComponent, div, small, span, type Input } from '@craft-ts/component';
import { craftComputed, craftMethod, craftService, craftUse, state } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { example } from '../../shared/example.style';
import { controlRoom } from './control-room.style';
import { ControlRoomView } from './control-room-view.service';

// -- Checklist --------------------------------------------------------------

const TASKS = ['Valves', 'Filters', 'Sensors', 'Logbook'];

export const { ControlRoomChecklistView, provideControlRoomChecklistView } =
  craftService(
    { name: 'controlRoomChecklistView', providedIn: 'toProvide' },
    function* () {
      const initialDone: readonly string[] = [];
      const done = yield* state(
        'done',
        initialDone,
        ({ state: read, update }) => ({
          toggle: (task: string) =>
            update((current) =>
              current.includes(task)
                ? current.filter((entry) => entry !== task)
                : [...current, task],
            ),
          summary: craftUse(craftComputed('summary', function* () {
            return `${(yield* read()).length} / ${TASKS.length} checked`;
          })),
          valvesChecked: craftUse(craftComputed('valvesChecked', function* () {
            return (yield* read()).includes('Valves');
          })),
          filtersChecked: craftUse(craftComputed('filtersChecked', function* () {
            return (yield* read()).includes('Filters');
          })),
          sensorsChecked: craftUse(craftComputed('sensorsChecked', function* () {
            return (yield* read()).includes('Sensors');
          })),
          logbookChecked: craftUse(craftComputed('logbookChecked', function* () {
            return (yield* read()).includes('Logbook');
          })),
        }),
      );
      yield* craftMethod('toggleTask', function* (task: string) {
        yield* done.toggle(task);
        yield* ControlRoomView.activity.checklistToggled();
      });
    },
  );

export const Checklist = craftComponent(
  'Checklist',
  { providers: [provideControlRoomChecklistView()] },
  (inputs: { readonly name: Input<string> }) =>
    div({ class: controlRoom.widget }, [
      span({ class: example.hint }, inputs.name),
      div({ class: controlRoom.actions }, [
        button('checklistValves', { type: 'button', role: 'checkbox', class: buttonUi.root, 'data-variant': 'secondary', 'aria-checked': ControlRoomChecklistView.done.valvesChecked, click: function* () { yield* ControlRoomChecklistView['toggleTask']('Valves'); } }, 'Valves'),
        button('checklistFilters', { type: 'button', role: 'checkbox', class: buttonUi.root, 'data-variant': 'secondary', 'aria-checked': ControlRoomChecklistView.done.filtersChecked, click: function* () { yield* ControlRoomChecklistView['toggleTask']('Filters'); } }, 'Filters'),
        button('checklistSensors', { type: 'button', role: 'checkbox', class: buttonUi.root, 'data-variant': 'secondary', 'aria-checked': ControlRoomChecklistView.done.sensorsChecked, click: function* () { yield* ControlRoomChecklistView['toggleTask']('Sensors'); } }, 'Sensors'),
        button('checklistLogbook', { type: 'button', role: 'checkbox', class: buttonUi.root, 'data-variant': 'secondary', 'aria-checked': ControlRoomChecklistView.done.logbookChecked, click: function* () { yield* ControlRoomChecklistView['toggleTask']('Logbook'); } }, 'Logbook'),
      ]),
      small({ class: example.hint }, ControlRoomChecklistView.done.summary),
    ]),
);
