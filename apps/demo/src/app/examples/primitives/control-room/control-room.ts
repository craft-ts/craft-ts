import {
  button,
  craftComponent,
  div,
  forNode,
  header,
  heading,
  headingSection,
  ifNode,
  input,
  label,
  p,
  section,
  small,
  span,
  strong,
  type Input,
} from '@craft-ts/component';
import { craftComputed, craftService, state } from '@craft-ts/core';
import { assign } from '@craft-ts/style';
import { buttonUi } from '@craft-ts/ui/style';
import { eventValue } from '../../../event-value';
import { example } from '../../shared/example.style';
import { pixel, pixelColor, pixelVars } from '../pixel-art/pixel.style';
import { controlRoom } from './control-room.style';

/**
 * A large page made of many small, different, interactive components — and no
 * long list. It exists to measure what mounting a big page and reacting on it
 * costs: every instrument is its own component with its own service, all of
 * them report to the page's service, and two page-wide settings fan out to
 * every gauge and band.
 *
 * `?copies=N` (1 to 20) draws the room N times, to scale the page up.
 */
const params =
  typeof globalThis.location !== 'undefined'
    ? new URLSearchParams(globalThis.location.search)
    : undefined;
const COPIES = Math.min(20, Math.max(1, Number(params?.get('copies')) || 1));

/** A constant component input: inputs are read with `yield*`, like any reactive value. */
const fixed = <T>(value: T) =>
  function* () {
    return value;
  };

type Units = 'metric' | 'imperial';
type GaugeKind = 'temperature' | 'pressure' | 'load';

const UNIT_LABELS: Readonly<
  Record<GaugeKind, Readonly<Record<Units, string>>>
> = {
  temperature: { metric: '°C', imperial: '°F' },
  pressure: { metric: 'bar', imperial: 'psi' },
  load: { metric: '%', imperial: '%' },
};

// -- The page ---------------------------------------------------------------

export const { ControlRoomView, provideControlRoomView } = craftService(
  { name: 'controlRoomView', providedIn: 'toProvide' },
  function* () {
    const activity = yield* state('activity', 0, ({ update }) => {
      const record = () => update((count) => count + 1);
      return {
        gaugeDecremented: record,
        gaugeIncremented: record,
        gaugeReset: record,
        switchToggled: record,
        sliderMoved: record,
        textEdited: record,
        ratingChanged: record,
        disclosureToggled: record,
        tabSelected: record,
        stepperMovedBack: record,
        stepperAdvanced: record,
        colorChosen: record,
        checklistToggled: record,
      };
    });
    const compact = yield* state('compact', false, ({ update }) => ({
      toggle: () => update((value) => !value),
    }));
    yield* state('units', 'metric' as Units, ({ set }) => ({
      chooseMetric: () => set('metric'),
      chooseImperial: () => set('imperial'),
    }));
    yield* craftComputed('activityLabel', function* () {
      const count = yield* activity();
      return count === 0
        ? 'No interaction yet'
        : `${count} interaction${count > 1 ? 's' : ''}`;
    });
    yield* craftComputed('density', function* () {
      return (yield* compact()) ? 'compact' : 'comfortable';
    });
  },
);

// -- Gauge: a reading, three buttons, a unit that follows the page ----------

// The gauge keeps how far it was moved from its starting reading; the reading
// itself is derived from the component's inputs.
export const { ControlRoomGaugeView, provideControlRoomGaugeView } =
  craftService(
    { name: 'controlRoomGaugeView', providedIn: 'toProvide' },
    function* () {
      yield* state('offset', 0, ({ update, set }) => ({
        increment: () => update((current) => current + 1),
        decrement: () => update((current) => current - 1),
        reset: () => set(0),
      }));
    },
  );

const Gauge = craftComponent(
  'ControlRoomGauge',
  { providers: [provideControlRoomGaugeView()] },
  (inputs: {
    readonly name: Input<string>;
    readonly kind: Input<GaugeKind>;
    readonly start: Input<number>;
    readonly max: Input<number>;
  }) => {
    const reading = function* () {
      return Math.max(
        0,
        (yield* inputs.start()) + (yield* ControlRoomGaugeView.offset()),
      );
    };
    return div(
      {
        class: controlRoom.widget,
        'data-controlRoomLevel': function* () {
          const ratio = (yield* reading()) / (yield* inputs.max());
          return ratio >= 0.85 ? 'high' : ratio <= 0.15 ? 'low' : 'ok';
        },
      },
      [
        span({ class: example.hint }, inputs.name),
        strong(function* () {
          const units = yield* ControlRoomView.units();
          return `${yield* reading()} ${UNIT_LABELS[yield* inputs.kind()][units]}`;
        }),
        small({ class: example.hint }, function* () {
          return `${Math.round(((yield* reading()) / (yield* inputs.max())) * 100)}% of max`;
        }),
        div({ class: controlRoom.actions }, [
          button(
            'gaugeDecrement',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              *click() {
                yield* ControlRoomGaugeView.offset.decrement();
                yield* ControlRoomView.activity.gaugeDecremented();
              },
            },
            '−',
          ),
          button(
            'gaugeIncrement',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              *click() {
                yield* ControlRoomGaugeView.offset.increment();
                yield* ControlRoomView.activity.gaugeIncremented();
              },
            },
            '+',
          ),
          button(
            'gaugeReset',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'link',
              *click() {
                yield* ControlRoomGaugeView.offset.reset();
                yield* ControlRoomView.activity.gaugeReset();
              },
            },
            'Reset',
          ),
        ]),
      ],
    );
  },
);

// -- Switch -----------------------------------------------------------------

export const { ControlRoomSwitchView, provideControlRoomSwitchView } =
  craftService(
    { name: 'controlRoomSwitchView', providedIn: 'toProvide' },
    function* () {
      const on = yield* state('on', false, ({ update }) => ({
        toggle: () => update((value) => !value),
      }));
      yield* craftComputed('stateLabel', function* () {
        return (yield* on()) ? 'on' : 'off';
      });
      yield* craftComputed('checked', function* () {
        return String(yield* on());
      });
    },
  );

const Switch = craftComponent(
  'ControlRoomSwitch',
  { providers: [provideControlRoomSwitchView()] },
  (inputs: { readonly name: Input<string> }) =>
    div({ class: controlRoom.widget }, [
      button(
        'switchToggle',
        {
          type: 'button',
          role: 'switch',
          class: buttonUi.root,
          'data-variant': 'secondary',
          'aria-checked': ControlRoomSwitchView.checked,
          *click() {
            yield* ControlRoomSwitchView.on.toggle();
            yield* ControlRoomView.activity.switchToggled();
          },
        },
        [inputs.name, ': ', ControlRoomSwitchView.stateLabel],
      ),
    ]),
);

// -- Slider -----------------------------------------------------------------

// The slider keeps where it was moved to; until then it shows its input.
export const { ControlRoomSliderView, provideControlRoomSliderView } =
  craftService(
    { name: 'controlRoomSliderView', providedIn: 'toProvide' },
    function* () {
      yield* state('position', null as number | null, ({ set }) => ({
        moveTo: (next: number) => set(next),
      }));
    },
  );

const Slider = craftComponent(
  'ControlRoomSlider',
  { providers: [provideControlRoomSliderView()] },
  (inputs: { readonly name: Input<string>; readonly start: Input<number> }) => {
    const current = function* () {
      return (
        (yield* ControlRoomSliderView.position()) ?? (yield* inputs.start())
      );
    };
    const text = function* () {
      return String(yield* current());
    };
    return div({ class: controlRoom.widget }, [
      label({ class: example.label }, [inputs.name, ' · ', text]),
      input('sliderRange', {
        type: 'range',
        min: '0',
        max: '100',
        value: text,
        *input(event) {
          yield* ControlRoomSliderView.position.moveTo(
            Number(eventValue(event)),
          );
          yield* ControlRoomView.activity.sliderMoved();
        },
      }),
      small({ class: example.text, 'data-exampleText': 'error' }, function* () {
        return (yield* current()) >= 80 ? 'Above the 80 limit' : '';
      }),
    ]);
  },
);

// -- Text field -------------------------------------------------------------

const TEXT_LIMIT = 24;

export const { ControlRoomTextFieldView, provideControlRoomTextFieldView } =
  craftService(
    { name: 'controlRoomTextFieldView', providedIn: 'toProvide' },
    function* () {
      const text = yield* state('text', '', ({ set }) => ({
        setText: (next: string) => set(next),
      }));
      yield* craftComputed('remaining', function* () {
        return `${TEXT_LIMIT - (yield* text()).length} characters left`;
      });
      yield* craftComputed('tooLong', function* () {
        return (yield* text()).length > TEXT_LIMIT;
      });
    },
  );

const TextField = craftComponent(
  'ControlRoomTextField',
  { providers: [provideControlRoomTextFieldView()] },
  (inputs: { readonly name: Input<string>; readonly hint: Input<string> }) =>
    div({ class: controlRoom.widget }, [
      label({ class: example.label }, inputs.name),
      input('textFieldInput', {
        type: 'text',
        class: example.input,
        placeholder: inputs.hint,
        value: ControlRoomTextFieldView.text,
        *input(event) {
          yield* ControlRoomTextFieldView.text.setText(eventValue(event));
          yield* ControlRoomView.activity.textEdited();
        },
      }),
      small({ class: example.hint }, ControlRoomTextFieldView.remaining),
      ifNode(ControlRoomTextFieldView.tooLong, () =>
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
      const stars = yield* state('stars', 0, ({ set }) => ({
        rate: (next: number) => set(next),
      }));
      yield* craftComputed('summary', function* () {
        const count = yield* stars();
        return count === 0 ? 'Not rated' : `${count} / 5`;
      });
      yield* craftComputed('current', function* () {
        return yield* stars();
      });
    },
  );

const Rating = craftComponent(
  'ControlRoomRating',
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
              *click() {
                yield* ControlRoomRatingView.stars.rate(yield* star());
                yield* ControlRoomView.activity.ratingChanged();
              },
            },
            function* () {
              return (yield* star()) <= (yield* ControlRoomRatingView.current())
                ? '★'
                : '☆';
            },
          ),
        ),
      ),
      small({ class: example.hint }, ControlRoomRatingView.summary),
    ]),
);

// -- Accordion section ------------------------------------------------------

export const { ControlRoomDisclosureView, provideControlRoomDisclosureView } =
  craftService(
    { name: 'controlRoomDisclosureView', providedIn: 'toProvide' },
    function* () {
      const open = yield* state('open', false, ({ update }) => ({
        toggle: () => update((value) => !value),
      }));
      yield* craftComputed('expanded', function* () {
        return String(yield* open());
      });
      yield* craftComputed('isOpen', function* () {
        return yield* open();
      });
    },
  );

const Disclosure = craftComponent(
  'ControlRoomDisclosure',
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
          'aria-expanded': ControlRoomDisclosureView.expanded,
          *click() {
            yield* ControlRoomDisclosureView.open.toggle();
            yield* ControlRoomView.activity.disclosureToggled();
          },
        },
        inputs.topic,
      ),
      ifNode(ControlRoomDisclosureView.isOpen, () =>
        p({ class: example.text, 'data-exampleText': 'muted' }, inputs.body),
      ),
    ]),
);

// -- Tabs: the active panel mounts its own instruments ----------------------

const TABS = ['Overview', 'Boiler', 'Pumps'] as const;
type Tab = (typeof TABS)[number];

export const { ControlRoomTabsView, provideControlRoomTabsView } = craftService(
  { name: 'controlRoomTabsView', providedIn: 'toProvide' },
  function* () {
    const active = yield* state('active', 'Overview' as Tab, ({ set }) => ({
      select: (tab: Tab) => set(tab),
    }));
    yield* craftComputed('onOverview', function* () {
      return (yield* active()) === 'Overview';
    });
    yield* craftComputed('onBoiler', function* () {
      return (yield* active()) === 'Boiler';
    });
    yield* craftComputed('onPumps', function* () {
      return (yield* active()) === 'Pumps';
    });
    yield* craftComputed('current', function* () {
      return yield* active();
    });
  },
);

const Tabs = craftComponent(
  'ControlRoomTabs',
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
                  (yield* tab()) === (yield* ControlRoomTabsView.current()),
                );
              },
              *click() {
                yield* ControlRoomTabsView.active.select(yield* tab());
                yield* ControlRoomView.activity.tabSelected();
              },
            },
            tab,
          ),
        ),
      ),
      ifNode(ControlRoomTabsView.onOverview, () =>
        p({ class: example.text }, 'All circuits nominal.'),
      ),
      ifNode(ControlRoomTabsView.onBoiler, () =>
        Gauge({
          name: fixed('Boiler outlet'),
          kind: fixed<GaugeKind>('temperature'),
          start: fixed(71),
          max: fixed(110),
        }),
      ),
      ifNode(ControlRoomTabsView.onPumps, () =>
        div({ class: controlRoom.actions }, [
          Switch({ name: fixed('Pump 1') }),
          Switch({ name: fixed('Pump 2') }),
        ]),
      ),
    ]),
);

// -- Stepper ----------------------------------------------------------------

const STEP_COUNT = 4;

export const { ControlRoomStepperView, provideControlRoomStepperView } =
  craftService(
    { name: 'controlRoomStepperView', providedIn: 'toProvide' },
    function* () {
      const step = yield* state('step', 1, ({ update }) => ({
        advance: () => update((current) => Math.min(STEP_COUNT, current + 1)),
        goBack: () => update((current) => Math.max(1, current - 1)),
      }));
      yield* craftComputed('atStart', function* () {
        return (yield* step()) === 1;
      });
      yield* craftComputed('atEnd', function* () {
        return (yield* step()) === STEP_COUNT;
      });
      yield* craftComputed('progress', function* () {
        return `Step ${yield* step()} of ${STEP_COUNT}`;
      });
    },
  );

const Stepper = craftComponent(
  'ControlRoomStepper',
  { providers: [provideControlRoomStepperView()] },
  (inputs: { readonly name: Input<string> }) =>
    div({ class: controlRoom.widget }, [
      span({ class: example.hint }, inputs.name),
      strong(ControlRoomStepperView.progress),
      div({ class: controlRoom.actions }, [
        button(
          'stepperPrevious',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'secondary',
            disabled: ControlRoomStepperView.atStart,
            *click() {
              yield* ControlRoomStepperView.step.goBack();
              yield* ControlRoomView.activity.stepperMovedBack();
            },
          },
          'Back',
        ),
        button(
          'stepperNext',
          {
            type: 'button',
            class: buttonUi.root,
            'data-variant': 'primary',
            disabled: ControlRoomStepperView.atEnd,
            *click() {
              yield* ControlRoomStepperView.step.advance();
              yield* ControlRoomView.activity.stepperAdvanced();
            },
          },
          'Next',
        ),
      ]),
    ]),
);

// -- Colour chooser ---------------------------------------------------------

const COLORS = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#eab308'];

export const {
  ControlRoomColorChooserView,
  provideControlRoomColorChooserView,
} = craftService(
  { name: 'controlRoomColorChooserView', providedIn: 'toProvide' },
  function* () {
    const chosen = yield* state('chosen', COLORS[0], ({ set }) => ({
      choose: (color: string) => set(color),
    }));
    yield* craftComputed('label', function* () {
      return `Signal colour ${yield* chosen()}`;
    });
  },
);

const ColorChooser = craftComponent(
  'ControlRoomColorChooser',
  { providers: [provideControlRoomColorChooserView()] },
  () =>
    div({ class: controlRoom.widget }, [
      div(
        { class: pixel.palette },
        forNode(COLORS, { track: (color) => color }, (color) =>
          button('colorChooserSwatch', {
            type: 'button',
            class: pixel.swatch,
            style: function* () {
              return assign(pixelVars.fill, pixelColor(yield* color()));
            },
            'aria-label': function* () {
              return `Choose ${yield* color()}`;
            },
            *click() {
              yield* ControlRoomColorChooserView.chosen.choose(yield* color());
              yield* ControlRoomView.activity.colorChosen();
            },
          }),
        ),
      ),
      small({ class: example.hint }, ControlRoomColorChooserView.label),
    ]),
);

// -- Checklist --------------------------------------------------------------

const TASKS = ['Valves', 'Filters', 'Sensors', 'Logbook'];

export const { ControlRoomChecklistView, provideControlRoomChecklistView } =
  craftService(
    { name: 'controlRoomChecklistView', providedIn: 'toProvide' },
    function* () {
      const done = yield* state(
        'done',
        [] as readonly string[],
        ({ update }) => ({
          toggle: (task: string) =>
            update((current) =>
              current.includes(task)
                ? current.filter((entry) => entry !== task)
                : [...current, task],
            ),
        }),
      );
      yield* craftComputed('summary', function* () {
        return `${(yield* done()).length} / ${TASKS.length} checked`;
      });
      yield* craftComputed('checked', function* () {
        return yield* done();
      });
    },
  );

const Checklist = craftComponent(
  'ControlRoomChecklist',
  { providers: [provideControlRoomChecklistView()] },
  (inputs: { readonly name: Input<string> }) =>
    div({ class: controlRoom.widget }, [
      span({ class: example.hint }, inputs.name),
      div(
        { class: controlRoom.actions },
        forNode(TASKS, { track: (task) => task }, (task) =>
          button(
            'checklistTask',
            {
              type: 'button',
              role: 'checkbox',
              class: buttonUi.root,
              'data-variant': 'secondary',
              'aria-checked': function* () {
                return String(
                  (yield* ControlRoomChecklistView.checked()).includes(
                    yield* task(),
                  ),
                );
              },
              *click() {
                yield* ControlRoomChecklistView.done.toggle(yield* task());
                yield* ControlRoomView.activity.checklistToggled();
              },
            },
            task,
          ),
        ),
      ),
      small({ class: example.hint }, ControlRoomChecklistView.summary),
    ]),
);

// -- One room ---------------------------------------------------------------

const GAUGES = [
  { name: 'Boiler A', kind: 'temperature', start: 64, max: 110 },
  { name: 'Boiler B', kind: 'temperature', start: 97, max: 110 },
  { name: 'Header pressure', kind: 'pressure', start: 6, max: 12 },
  { name: 'Return pressure', kind: 'pressure', start: 1, max: 12 },
  { name: 'Compressor load', kind: 'load', start: 42, max: 100 },
  { name: 'Fan load', kind: 'load', start: 88, max: 100 },
  { name: 'Condenser', kind: 'temperature', start: 35, max: 110 },
  { name: 'Feed water', kind: 'pressure', start: 4, max: 12 },
] as const;
const SWITCHES = [
  'Main breaker',
  'Backup feed',
  'Lighting',
  'Ventilation',
  'Alarm horn',
  'Night mode',
  'Remote access',
  'Heat tracing',
  'Sump pump',
  'Door lock',
];
const SLIDERS = [
  { name: 'Valve 1', start: 20 },
  { name: 'Valve 2', start: 55 },
  { name: 'Damper', start: 84 },
  { name: 'Mixer', start: 40 },
  { name: 'Bypass', start: 10 },
  { name: 'Burner', start: 66 },
];
const FIELDS = [
  { name: 'Shift lead', hint: 'Name' },
  { name: 'Radio channel', hint: 'e.g. 7B' },
  { name: 'Incident ref.', hint: 'INC-0000' },
  { name: 'Handover note', hint: 'Short note' },
  { name: 'Contractor', hint: 'Company' },
  { name: 'Spare part', hint: 'Part number' },
];
const RATINGS = ['Air quality', 'Noise', 'Cleanliness', 'Lighting'];
const SECTIONS = [
  {
    title: 'Start-up procedure',
    body: 'Open the feed, purge, then light the pilot.',
  },
  {
    title: 'Shutdown procedure',
    body: 'Close the burner valve, keep the pumps on for ten minutes.',
  },
  {
    title: 'Alarm codes',
    body: 'A1: low water. A2: high pressure. A3: flame failure.',
  },
  { title: 'Contacts', body: 'Duty engineer on channel 7B, maintenance on 4.' },
  {
    title: 'Tolerances',
    body: 'Header pressure 5 to 9 bar, outlet below 105 °C.',
  },
  { title: 'Logbook rules', body: 'One entry per shift, signed by the lead.' },
];

const band = {
  class: controlRoom.band,
  'data-controlRoomDensity': ControlRoomView.density,
};

const Room = craftComponent(
  'ControlRoomBay',
  {},
  (inputs: { readonly bay: Input<string> }) =>
    section({ class: controlRoom.room }, [
      heading({ class: example.subtitle }, inputs.bay),
      div(
        band,
        GAUGES.map((gauge) =>
          Gauge({
            name: fixed(gauge.name),
            kind: fixed<GaugeKind>(gauge.kind),
            start: fixed(gauge.start),
            max: fixed(gauge.max),
          }),
        ),
      ),
      div(
        band,
        SWITCHES.map((name) => Switch({ name: fixed(name) })),
      ),
      div(
        band,
        SLIDERS.map((slider) =>
          Slider({ name: fixed(slider.name), start: fixed(slider.start) }),
        ),
      ),
      div(
        band,
        FIELDS.map((field) =>
          TextField({ name: fixed(field.name), hint: fixed(field.hint) }),
        ),
      ),
      div(
        band,
        RATINGS.map((name) => Rating({ name: fixed(name) })),
      ),
      div(band, [
        Stepper({ name: fixed('Boiler start-up') }),
        Stepper({ name: fixed('Pump changeover') }),
        Tabs({}),
        Tabs({}),
        ColorChooser({}),
        ColorChooser({}),
        ColorChooser({}),
        Checklist({ name: fixed('Morning round') }),
        Checklist({ name: fixed('Evening round') }),
        Checklist({ name: fixed('Weekly check') }),
      ]),
      div(
        band,
        SECTIONS.map((entry) =>
          Disclosure({ topic: fixed(entry.title), body: fixed(entry.body) }),
        ),
      ),
    ]),
);

const ROOMS = Array.from({ length: COPIES }, (_, index) => `Bay ${index + 1}`);

const ControlRoom = craftComponent(
  'ControlRoom',
  { providers: [provideControlRoomView()] },
  () =>
    div({ class: example.page }, [
      header({ class: example.stack }, [
        heading({ class: example.title }, 'Control room'),
        p(
          { class: example.text, 'data-exampleText': 'muted' },
          'Many small instruments, each its own component and service. Every interaction is counted by the page; units and density apply to every bay.',
        ),
        div({ class: controlRoom.actions }, [
          strong(
            { 'data-testid': 'control-room-activity' },
            ControlRoomView.activityLabel,
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
              *click() {
                yield* ControlRoomView.units.chooseMetric();
              },
            },
            'Metric',
          ),
          button(
            'controlRoomImperial',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'secondary',
              *click() {
                yield* ControlRoomView.units.chooseImperial();
              },
            },
            'Imperial',
          ),
        ]),
      ]),
      headingSection(
        div(
          { class: controlRoom.room },
          ROOMS.map((title) => Room({ bay: fixed(title) })),
        ),
      ),
    ]),
);

export default ControlRoom;
