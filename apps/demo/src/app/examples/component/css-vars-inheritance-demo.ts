import { craftService } from '@craft-ts/core';
/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import { craftComponent, div, p, heading } from '@craft-ts/component';
import { CssVarsPageNav } from './css-vars-demo.shared';
import { InheritanceExample } from './css-vars-inheritance.shared';

const { CssVarsInheritanceDemoView, provideCssVarsInheritanceDemoView } =
  craftService(
    { name: 'cssVarsInheritanceDemoView', providedIn: 'toProvide' },
    () => ({}),
  );

export const CssVarsInheritanceDemo = craftComponent(
  'CssVarsInheritanceDemo',
  {
    providers: [provideCssVarsInheritanceDemoView()],
    styles: `
      :scope { display: grid; gap: 1.5rem; max-width: 72rem; margin: 0 auto; color: #172033; }
      h1, p { margin: 0; }
      .css-vars-inheritance__intro { display: grid; gap: .5rem; }
      .css-vars-inheritance__intro p { color: #64748b; line-height: 1.55; }
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    `,
  },
  function* () {
    yield* CssVarsInheritanceDemoView();
    return div([
      CssVarsPageNav(),
      div({ class: 'css-vars-inheritance__intro' }, [
        heading('Native inheritance'),
        p(
          'The inherit marker produces no inline style: the CSS cascade resolves the value from the parent.',
        ),
      ]),
      InheritanceExample(),
    ]);
  },
);

export default CssVarsInheritanceDemo;
