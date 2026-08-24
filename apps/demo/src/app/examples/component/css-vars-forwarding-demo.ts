/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  craftComponent,
  div,
  forward,
  p,
  heading,
} from '@craft-ts/component';
import { CssVarsPageNav } from './css-vars-demo.shared';
import { TokenCard } from './css-vars-required-demo';

const ForwardingExample = craftComponent(
  'ForwardingExample',
  {
    styles: `
      :scope { display: grid; gap: .6rem; }
      .forwarding-example__note { margin: 0; color: #64748b; font-size: .82rem; }
    `,
  },
  () => ({}),
  () =>
    div([
      TokenCard({
        cssVars: {
          '--token-card-ink': forward('#155e75'),
          '--token-card-bg': forward('#ecfeff'),
        },
        label: function* () {
          return 'Default forwarded values';
        },
      }),
      p(
        { class: 'forwarding-example__note' },
        "These values become the parent component's optional API.",
      ),
    ]),
);

export const CssVarsForwardingDemo = craftComponent(
  'CssVarsForwardingDemo',
  {
    styles: `
      :scope { display: grid; gap: 1.5rem; max-width: 72rem; margin: 0 auto; color: #172033; }
      h1, p { margin: 0; }
      .css-vars-forwarding__intro { display: grid; gap: .5rem; }
      .css-vars-forwarding__intro p { color: #64748b; line-height: 1.55; }
      .css-vars-forwarding__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; }
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  () => ({}),
  () =>
    div([
      CssVarsPageNav(),
      div({ class: 'css-vars-forwarding__intro' }, [
        heading('Forwarding and overrides'),
        p(
          'On the left, default values are forwarded. On the right, the parent is overridden by its caller.',
        ),
      ]),
      div({ class: 'css-vars-forwarding__grid' }, [
        ForwardingExample(),
        ForwardingExample({
          cssVars: {
            '--token-card-ink': '#854d0e',
            '--token-card-bg': '#fefce8',
          },
        }),
      ]),
    ]),
);

export default CssVarsForwardingDemo;
