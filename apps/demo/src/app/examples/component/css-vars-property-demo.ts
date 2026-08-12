import { craftComponent, div, h1, p, span } from '@craft-ng/component';
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
    `,
  },
  () => ({}),
  () =>
    div([
      span('Token enregistré et validé par le navigateur'),
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
    `,
  },
  () => ({}),
  () =>
    div([
      CssVarsPageNav(),
      div({ class: 'css-vars-property__intro' }, [
        h1('@property possédé par le composant'),
        p(
          'Le premier compteur utilise initial-value: 35. Le second reçoit une valeur numérique de 78.',
        ),
      ]),
      div({ class: 'css-vars-property__grid' }, [
        RegisteredMeter(),
        RegisteredMeter({ cssVars: { '--registered-meter-value': 78 } }),
      ]),
    ]),
);

export default CssVarsPropertyDemo;
