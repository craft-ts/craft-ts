import { craftComponent, div, heading, section, type Input } from '@craft-ts/component';
import { example } from '../../shared/example.style';
import { controlRoom } from './control-room.style';
import { ControlRoomView } from './control-room-view.service';
import { fixed, type GaugeKind } from './control-room.model';
import { Gauge } from './control-room-gauge';
import { Switch, Slider } from './control-room-switch-slider';
import { TextField, Rating } from './control-room-text-rating';
import { Disclosure, Tabs } from './control-room-disclosure-tabs';
import { Stepper, ColorChooser } from './control-room-stepper-color';
import { Checklist } from './control-room-checklist';

// -- One room ---------------------------------------------------------------

type GaugeEntry = Readonly<{
  name: string;
  kind: GaugeKind;
  start: number;
  max: number;
}>;
const GAUGES: readonly GaugeEntry[] = [
  { name: 'Boiler A', kind: 'temperature', start: 64, max: 110 },
  { name: 'Boiler B', kind: 'temperature', start: 97, max: 110 },
  { name: 'Header pressure', kind: 'pressure', start: 6, max: 12 },
  { name: 'Return pressure', kind: 'pressure', start: 1, max: 12 },
  { name: 'Compressor load', kind: 'load', start: 42, max: 100 },
  { name: 'Fan load', kind: 'load', start: 88, max: 100 },
  { name: 'Condenser', kind: 'temperature', start: 35, max: 110 },
  { name: 'Feed water', kind: 'pressure', start: 4, max: 12 },
];
const SWITCHES: readonly string[] = [
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
const SLIDERS: readonly { readonly name: string; readonly start: number }[] = [
  { name: 'Valve 1', start: 20 },
  { name: 'Valve 2', start: 55 },
  { name: 'Damper', start: 84 },
  { name: 'Mixer', start: 40 },
  { name: 'Bypass', start: 10 },
  { name: 'Burner', start: 66 },
];
const FIELDS: readonly { readonly name: string; readonly hint: string }[] = [
  { name: 'Shift lead', hint: 'Name' },
  { name: 'Radio channel', hint: 'e.g. 7B' },
  { name: 'Incident ref.', hint: 'INC-0000' },
  { name: 'Handover note', hint: 'Short note' },
  { name: 'Contractor', hint: 'Company' },
  { name: 'Spare part', hint: 'Part number' },
];
const RATINGS: readonly string[] = ['Air quality', 'Noise', 'Cleanliness', 'Lighting'];
const SECTIONS: readonly { readonly title: string; readonly body: string }[] = [
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
  'data-controlRoomDensity': ControlRoomView.compact.density,
};

export const Room = craftComponent(
  'Room',
  {},
  (inputs: { readonly bay: Input<string> }) =>
    section({ class: controlRoom.room }, [
      heading({ class: example.subtitle }, inputs.bay),
      div(
        'roomGaugeBand',
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
        'roomSwitchBand',
        band,
        SWITCHES.map((name) => Switch({ name: fixed(name) })),
      ),
      div(
        'roomSliderBand',
        band,
        SLIDERS.map((slider) =>
          Slider({ name: fixed(slider.name), start: fixed(slider.start) }),
        ),
      ),
      div(
        'roomFieldBand',
        band,
        FIELDS.map((field) =>
          TextField({ name: fixed(field.name), hint: fixed(field.hint) }),
        ),
      ),
      div(
        'roomRatingBand',
        band,
        RATINGS.map((name) => Rating({ name: fixed(name) })),
      ),
      div('roomOtherInstrumentsBand', band, [
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
        'roomDisclosureBand',
        band,
        SECTIONS.map((entry) =>
          Disclosure({ topic: fixed(entry.title), body: fixed(entry.body) }),
        ),
      ),
    ]),
);
