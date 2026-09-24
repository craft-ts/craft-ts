import { button, craftComponent, div, heading, p } from '@craft-ts/component';
import { state } from '@craft-ts/core';
import { CssVarsPageNav } from './css-vars-demo.shared';
import { AssignedMeter, RegisteredMeter } from './css-vars-property.shared';
import { cssVarsDemo } from './css-vars.style';
import { example } from '../shared/example.style';

export const CssVarsPropertyDemo = craftComponent(
  'CssVarsPropertyDemo',
  {},
  () =>
    state('meterValue', 78, ({ update }) => ({
      nudge: () => update((current) => (current >= 100 ? 10 : current + 10)),
    })),
  (meterValue) =>
    div({ class: cssVarsDemo.page }, [
      CssVarsPageNav(),
      div({ class: cssVarsDemo.intro }, [
        heading('Registered variables (@property)'),
        p(
          { class: cssVarsDemo.muted },
          'The first meter keeps the registered initial value. The second one is assigned at runtime, and animates because the variable is typed.',
        ),
      ]),
      div({ class: cssVarsDemo.grid }, [
        RegisteredMeter(),
        AssignedMeter({ value: meterValue }),
      ]),
      button(
        'nudgeMeter',
        {
          class: example.button,
          'data-exampleButton': 'primary',
          type: 'button',
          click: meterValue.nudge,
        },
        'Move the second meter',
      ),
    ]),
);

export default CssVarsPropertyDemo;
