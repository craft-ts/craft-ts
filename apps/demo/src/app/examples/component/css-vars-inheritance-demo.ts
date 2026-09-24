import { craftComponent, div, heading, p } from '@craft-ts/component';
import { CssVarsPageNav } from './css-vars-demo.shared';
import {
  InheritanceExample,
  InheritedBadge,
} from './css-vars-inheritance.shared';
import { cssVarsDemo } from './css-vars.style';

export const CssVarsInheritanceDemo = craftComponent(
  'CssVarsInheritanceDemo',
  {},
  () => ({}),
  () =>
    div({ class: cssVarsDemo.page }, [
      CssVarsPageNav(),
      div({ class: cssVarsDemo.intro }, [
        heading('Inheritance'),
        p(
          { class: cssVarsDemo.muted },
          'The variable is registered with inherits: true. The parent sets it once; the badge inside reads it, the badge outside keeps the initial value. Nothing is written inline.',
        ),
      ]),
      InheritanceExample(),
      // The same badge outside the parent keeps the registered initial value.
      InheritedBadge(),
    ]),
);

export default CssVarsInheritanceDemo;
