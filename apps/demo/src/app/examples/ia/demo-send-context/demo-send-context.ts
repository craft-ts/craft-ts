import {
  craftComponent,
  div,
  forNode,
  heading,
  headingSection,
} from '@craft-ts/component';
import { SendContextCounterComponent } from './counter';

const DemoSendContextComponent = craftComponent(
  'DemoSendContextComponent',
  {},
  () => ({ counters: Array.from({ length: 13 }, (_, index) => index) }),
  ({ counters }) =>
    div([
      heading('Demo send context'),
      headingSection(
        forNode(counters, { track: (index) => index }, () =>
          SendContextCounterComponent({
            initialValue: function* () {
              return 1;
            },
          }),
        ),
      ),
    ]),
);

export default DemoSendContextComponent;
