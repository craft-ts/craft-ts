import { craftComponent, div, h1, inherit, p, span } from '@craft-ng/component';
import { CssVarsPageNav } from './css-vars-demo.shared';

const InheritedBadge = craftComponent(
  'InheritedBadge',
  {
    styles: `
      :scope {
        --inherited-badge-bg: #e0e7ff;
        display: inline-flex;
        width: fit-content;
        padding: .3rem .65rem;
        border-radius: 999px;
        color: var(--inherited-badge-ink);
        background: var(--inherited-badge-bg);
        font-size: .82rem;
        font-weight: 750;
      }
    `,
  },
  () => ({}),
  () => span('Inherited from parent'),
);

const InheritanceExample = craftComponent(
  'InheritanceExample',
  {
    styles: `
      :scope {
        --inherited-badge-ink: #3730a3;
        display: grid;
        gap: 1rem;
        padding: 1.25rem;
        border: 1px dashed #a5b4fc;
        border-radius: 1rem;
        background: #eef2ff;
      }
    `,
  },
  () => ({}),
  () =>
    div([
      p('The parent declares --inherited-badge-ink in its own scope.'),
      InheritedBadge({ cssVars: { '--inherited-badge-ink': inherit } }),
    ]),
);

export const CssVarsInheritanceDemo = craftComponent(
  'CssVarsInheritanceDemo',
  {
    styles: `
      :scope { display: grid; gap: 1.5rem; max-width: 72rem; margin: 0 auto; color: #172033; }
      h1, p { margin: 0; }
      .css-vars-inheritance__intro { display: grid; gap: .5rem; }
      .css-vars-inheritance__intro p { color: #64748b; line-height: 1.55; }
    `,
  },
  () => ({}),
  () =>
    div([
      CssVarsPageNav(),
      div({ class: 'css-vars-inheritance__intro' }, [
        h1('Native inheritance'),
        p(
          'The inherit marker produces no inline style: the CSS cascade resolves the value from the parent.',
        ),
      ]),
      InheritanceExample(),
    ]),
);

export default CssVarsInheritanceDemo;
