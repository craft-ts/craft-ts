import { craftComponent, div, each } from '@craft-ng/component';
import { SendContextCounterComponent } from './counter';

const DemoSendContextComponent = craftComponent(
  'DemoSendContextComponent',
  {},
  () => ({ counters: Array.from({ length: 13 }, (_, index) => index) }),
  ({ counters }) =>
    div([
      'Demo',
      each(counters, { track: (index) => index }, () =>
        SendContextCounterComponent({
          initialValue: function* () {
            return 1;
          },
        }),
      ),
    ]),
);

export default DemoSendContextComponent;
