import { craftService } from '@craft-ts/core';
import {
  craftComponent,
  div,
  forNode,
  heading,
  headingSection,
} from '@craft-ts/component';
import { SendContextCounterComponent } from './counter';

export const { DemoSendContextView, provideDemoSendContextView } = craftService(
  { name: 'demoSendContextView', providedIn: 'toProvide' },
  () => ({ counters: Array.from({ length: 13 }, (_, index) => index) }),
);

const DemoSendContextComponent = craftComponent(
  'DemoSendContextComponent',
  { providers: [provideDemoSendContextView()] },
  function* () {
    const { counters } = yield* DemoSendContextView();
    return div([
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
    ]);
  },
);

export default DemoSendContextComponent;
