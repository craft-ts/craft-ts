/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  craftComponent,
  div,
  p,
  span,
  heading,
} from '@craft-ng/component';
import { CssVarsPageNav } from './css-vars-demo.shared';

const RegisteredMeter = craftComponent(
  'RegisteredMeter',
  {
    styles: `
      @property --registered-meter-value {
        syntax: '<number>';
        inherits: true;
        initial-value: 35;
      }
      :scope {
        --registered-meter-track: #e2e8f0;
        --registered-meter-fill: #7c3aed;
        display: grid;
        gap: .55rem;
        padding: 1rem;
        border: 1px solid #dbe3f0;
        border-radius: 1rem;
      }
      .registered-meter__track {
        height: .8rem;
        overflow: hidden;
        border-radius: 999px;
        background: var(--registered-meter-track);
      }
      .registered-meter__fill {
        width: calc(var(--registered-meter-value) * 1%);
        height: 100%;
        background: var(--registered-meter-fill);
        transition: width 220ms ease;
      }
    
      @media (prefers-reduced-motion: reduce){:scope{animation:none;transition:none}}
    `,
  },
  () => ({}),
  () =>
    div([
      span('Token registered and validated by the browser'),
      div(
        { class: 'registered-meter__track' },
        div({ class: 'registered-meter__fill' }),
      ),
    ]),
);

export const CssVarsPropertyDemo = craftComponent(
  'CssVarsPropertyDemo',
  {
    styles: `
      :scope { display: grid; gap: 1.5rem; max-width: 72rem; margin: 0 auto; color: #172033; }
      h1, p { margin: 0; }
      .css-vars-property__intro { display: grid; gap: .5rem; }
      .css-vars-property__intro p { color: #64748b; line-height: 1.55; }
      .css-vars-property__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; }
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  () => ({}),
  () =>
    div([
      CssVarsPageNav(),
      div({ class: 'css-vars-property__intro' }, [
        heading('Component-owned @property'),
        p(
          'The first meter uses initial-value: 35. The second receives a numeric value of 78.',
        ),
      ]),
      div({ class: 'css-vars-property__grid' }, [
        RegisteredMeter(),
        RegisteredMeter({ cssVars: { '--registered-meter-value': 78 } }),
      ]),
    ]),
);

export default CssVarsPropertyDemo;
