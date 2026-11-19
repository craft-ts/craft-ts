import { button, craftComponent, div, header, heading, headingSection, p, type CraftComponent } from '@craft-ts/component';
import { example } from '../../shared/example.style';
import { controlRoom } from './control-room.style';
import { buttonUi } from '@craft-ts/ui/style';
import { ControlRoomView, provideControlRoomView } from './control-room-view.service';
import { Room } from './control-room-room';
import { fixed } from './control-room.model';

const params = typeof globalThis.location !== 'undefined'
  ? new URLSearchParams(globalThis.location.search)
  : undefined;
const COPIES = Math.min(20, Math.max(1, Number(params?.get('copies')) || 1));
const ROOMS = Array.from({ length: COPIES }, (_, index) => `Bay ${index + 1}`);

// The route registry verifies many lazy demo components together; keep this
// composed example behind the public component boundary to limit TS recursion.
// eslint-disable-next-line craft-ts/no-craft-component-return-type
const ControlRoom: CraftComponent = craftComponent(
  'ControlRoom',
  { providers: [provideControlRoomView()] },
  () =>
    div('controlRoomPage', { class: example.page }, [
      header({ class: example.stack }, [
        heading({ class: example.title }, 'Control room'),
        p(
          { class: example.text, 'data-exampleText': 'muted' },
          'Many small instruments, each its own component and service. Every interaction is counted by the page; units and density apply to every bay.',
        ),
        div({ class: controlRoom.actions }, [
          div(
            'controlRoomActivity',
            {
              class: example.label,
              'data-testid': 'control-room-activity',
            },
            ControlRoomView.activity.label,
          ),
          button(
            'controlRoomDensity',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              click: ControlRoomView.compact.toggle,
            },
            'Toggle density',
          ),
          button(
            'controlRoomMetric',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              click: ControlRoomView.units.chooseMetric,
            },
            'Metric',
          ),
          button(
            'controlRoomImperial',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              click: ControlRoomView.units.chooseImperial,
            },
            'Imperial',
          ),
        ]),
      ]),
      headingSection(
        div(
          'controlRoomBays',
          { class: controlRoom.room },
          ROOMS.map((title) => Room({ bay: fixed(title) })),
        ),
      ),
    ]),
);

export default ControlRoom;
