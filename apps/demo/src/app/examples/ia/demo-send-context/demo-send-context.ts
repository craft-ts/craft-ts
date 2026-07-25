import { component, div, each } from '@craft-ng/component';
import { provideHostName } from '@craft-ng/core';
import { SendContextCounterComponent } from './counter';

const DemoSendContextComponent = component(
  { providers: [provideHostName('component:DemoSendContextComponent')] },
  () => ({ counters: Array.from({ length: 13 }, (_, index) => index) }),
  ({ counters }) =>
    div([
      'Demo',
      each(counters, { track: (index) => index }, () =>
        SendContextCounterComponent({ initialValue: () => 1 }),
      ),
    ]),
);

export default DemoSendContextComponent;
