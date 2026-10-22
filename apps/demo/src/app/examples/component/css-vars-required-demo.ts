import { craftComponent, div, heading, p, span } from '@craft-ts/component';
import { CssVarsPageNav } from './css-vars-demo.shared';
import { TokenCard, type CssVarsTokenCardTone } from './css-vars-token-card';
import { cssVarsDemo } from './css-vars.style';

const BLUE: CssVarsTokenCardTone = 'blue';
const PINK: CssVarsTokenCardTone = 'pink';
const GREEN: CssVarsTokenCardTone = 'green';

export const CssVarsRequiredDemo = craftComponent(
  'CssVarsRequiredDemo',
  {},
  () =>
    div({ class: cssVarsDemo.page }, [
      CssVarsPageNav(),
      div({ class: cssVarsDemo.intro }, [
        heading('Per-instance values'),
        p({ class: cssVarsDemo.muted }, [
          'A variable declared with ',
          span({ class: cssVarsDemo.code }, 'kind.color(initial)'),
          ' is never required: a variant sets what it changes, and the rest falls back to the registered initial value.',
        ]),
      ]),
      div({ class: cssVarsDemo.grid }, [
        TokenCard({
          label: function* () {
            return 'Calm blue';
          },
          tone: function* () {
            return BLUE;
          },
        }),
        TokenCard({
          label: function* () {
            return 'Rounded pink';
          },
          tone: function* () {
            return PINK;
          },
        }),
        TokenCard({
          label: function* () {
            return 'Only the ink is set';
          },
          tone: function* () {
            return GREEN;
          },
        }),
        TokenCard({
          label: function* () {
            return 'Initial values only';
          },
          tone: function* () {
            return null;
          },
        }),
      ]),
    ]),
);

export default CssVarsRequiredDemo;
