import { button, craftComponent, div, forNode, ifNode, p, type Input } from '@craft-ts/component';
import { craftComputed, craftMethod, craftService, craftUse, state } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { example } from '../../shared/example.style';
import { controlRoom } from './control-room.style';
import { ControlRoomView } from './control-room-view.service';
import { Gauge } from './control-room-gauge';
import { Switch } from './control-room-switch-slider';
import { fixed, type GaugeKind } from './control-room.model';

// -- Accordion section ------------------------------------------------------

export const { ControlRoomDisclosureView, provideControlRoomDisclosureView } =
  craftService(
    { name: 'controlRoomDisclosureView', providedIn: 'toProvide' },
    function* () {
      const open = yield* state('open', false, ({ state: read, update }) => ({
        toggle: () => update((value) => !value),
        expanded: craftUse(craftComputed('expanded', function* () {
          return String(yield* read());
        })),
        isOpen: craftUse(craftComputed('isOpen', function* () {
          return yield* read();
        })),
      }));
      yield* craftMethod('toggle', function* () {
        yield* open.toggle();
        yield* ControlRoomView.activity.disclosureToggled();
      });
    },
  );

export const Disclosure = craftComponent(
  'Disclosure',
  { providers: [provideControlRoomDisclosureView()] },
  (inputs: { readonly topic: Input<string>; readonly body: Input<string> }) =>
    div({ class: controlRoom.widget }, [
      button(
        'disclosureToggle',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          'data-testid': 'control-room-disclosure',
          'aria-expanded': ControlRoomDisclosureView.open.expanded,
          click: ControlRoomDisclosureView['toggle'],
        },
        inputs.topic,
      ),
      ifNode(ControlRoomDisclosureView.open.isOpen, () =>
        p({ class: example.text, 'data-exampleText': 'muted' }, inputs.body),
      ),
    ]),
);

// -- Tabs: the active panel mounts its own instruments ----------------------

type Tab = 'Overview' | 'Boiler' | 'Pumps';
const TABS: readonly Tab[] = ['Overview', 'Boiler', 'Pumps'];
const initialTab = (): Tab => 'Overview';

export const { ControlRoomTabsView, provideControlRoomTabsView } = craftService(
  { name: 'controlRoomTabsView', providedIn: 'toProvide' },
  function* () {
    const active = yield* state('active', initialTab(), ({ state: read, set }) => ({
      select: (tab: Tab) => set(tab),
      onOverview: craftUse(craftComputed('onOverview', function* () {
        return (yield* read()) === 'Overview';
      })),
      onBoiler: craftUse(craftComputed('onBoiler', function* () {
        return (yield* read()) === 'Boiler';
      })),
      onPumps: craftUse(craftComputed('onPumps', function* () {
        return (yield* read()) === 'Pumps';
      })),
      current: craftUse(craftComputed('current', function* () {
        return yield* read();
      })),
    }));
    yield* craftMethod('selectTab', function* (tab: Tab) {
      yield* active.select(tab);
      yield* ControlRoomView.activity.tabSelected();
    });
  },
);

export const Tabs = craftComponent(
  'Tabs',
  { providers: [provideControlRoomTabsView()] },
  () =>
    div({ class: controlRoom.widget }, [
      div(
        { class: controlRoom.actions, role: 'tablist' },
        forNode(TABS, { track: (tab) => tab }, (tab) =>
          button(
            'tabsTab',
            {
              type: 'button',
              role: 'tab',
              class: buttonUi.root,
              'data-variant': 'secondary',
              'aria-selected': function* () {
                return String(
                  (yield* tab()) === (yield* ControlRoomTabsView.active.current()),
                );
              },
              click: function* () {
                yield* ControlRoomTabsView['selectTab'](yield* tab());
              },
            },
            tab,
          ),
        ),
      ),
      ifNode(ControlRoomTabsView.active.onOverview, () =>
        p({ class: example.text }, 'All circuits nominal.'),
      ),
      ifNode(ControlRoomTabsView.active.onBoiler, () =>
        Gauge({
          name: fixed('Boiler outlet'),
          kind: fixed<GaugeKind>('temperature'),
          start: fixed(71),
          max: fixed(110),
        }),
      ),
      ifNode(ControlRoomTabsView.active.onPumps, () =>
        div({ class: controlRoom.actions }, [
          Switch({ name: fixed('Pump 1') }),
          Switch({ name: fixed('Pump 2') }),
        ]),
      ),
    ]),
);
