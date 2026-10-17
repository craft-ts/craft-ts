import { craftService, craftExpose } from '@craft-ts/core';
import {
  craftComponent,
  div,
  forNode,
  heading,
  headingSection,
} from '@craft-ts/component';
import { sendContext } from './demo-send-context.style';
import { SendContextCounterComponent } from './counter';

export const { DemoSendContextView, provideDemoSendContextView } = craftService(
  { name: 'demoSendContextView', providedIn: 'toProvide' },
  function* () {
    yield* craftExpose('counters', Array.from({ length: 13 }, (_, index) => index));
  },
);

const DemoSendContextComponent = craftComponent(
  'DemoSendContextComponent',
  { providers: [provideDemoSendContextView()] },
  () => div({ class: sendContext.page }, [
      heading('Demo send context'),
      headingSection(
        div(
          { class: sendContext.grid },
          forNode(DemoSendContextView.counters, { track: (index) => index }, () =>
            SendContextCounterComponent({
              initialValue: function* () {
                return 1;
              },
            }),
          ),
        ),
      ),
    ]),
);

export default DemoSendContextComponent;
