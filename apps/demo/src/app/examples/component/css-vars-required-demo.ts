import {
  article,
  craftComponent,
  div,
  heading,
  p,
  span,
  type Input,
} from '@craft-ts/component';
import { CssVarsPageNav } from './css-vars-demo.shared';
import { cssVarsDemo, tokenCard } from './css-vars.style';

type Tone = 'blue' | 'pink' | 'green';

const BLUE: Tone = 'blue';
const PINK: Tone = 'pink';
const GREEN: Tone = 'green';

/**
 * A card whose colours are variables. The tone is a state axis: it sets the
 * variables it changes, and the others keep their registered initial value.
 */
export const TokenCard = craftComponent(
  'TokenCard',
  {},
  (label: Input<string>, tone: Input<Tone | null>) => ({ label, tone }),
  ({ label, tone }) =>
    article({ class: tokenCard.root, 'data-tokenCard': tone }, [
      span({ class: tokenCard.label }, label),
      span(
        { class: tokenCard.contract },
        'ink, bg, radius: typed, each with an initial value',
      ),
    ]),
);

export const CssVarsRequiredDemo = craftComponent(
  'CssVarsRequiredDemo',
  {},
  () => ({}),
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
