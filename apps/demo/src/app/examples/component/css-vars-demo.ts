/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  a,
  craftComponent,
  div,
  heading,
  headingSection,
  p,
  section,
} from '@craft-ng/component';
import { CraftRouterLink } from '@craft-ng/core';
import { CssVarsPageNav } from './css-vars-demo.shared';

const CASES = [
  {
    path: 'css-vars/required',
    title: 'Required and optional values',
    description:
      'Compare multiple instances, fallbacks, and the omit marker.',
  },
  {
    path: 'css-vars/inheritance',
    title: 'Native inheritance',
    description:
      'Observe inherit and how the variable resolves from a parent.',
  },
  {
    path: 'css-vars/forwarding',
    title: 'Forwarding and overrides',
    description:
      "Turn a child's tokens into an optional parent API.",
  },
  {
    path: 'css-vars/property',
    title: '@property',
    description: 'Register a numeric token owned by the component.',
  },
] as const;

export const CssVarsDemo = craftComponent(
  'CssVarsDemo',
  {
    styles: `
      :scope {
        --css-vars-demo-ink: #172033;
        --css-vars-demo-muted: #64748b;
        --css-vars-demo-panel: #f8fafc;
        --css-vars-demo-border: #dbe3f0;
        display: grid;
        gap: 1.5rem;
        max-width: 72rem;
        margin: 0 auto;
        color: var(--css-vars-demo-ink);
      }
      h1, h2, p { margin: 0; }
      .css-vars-demo__intro { display: grid; gap: .5rem; }
      .css-vars-demo__intro p { color: var(--css-vars-demo-muted); line-height: 1.55; }
      .css-vars-demo__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1rem; }
      .css-vars-demo__card {
        display: grid;
        gap: .65rem;
        min-height: 8rem;
        padding: 1.25rem;
        border: 1px solid var(--css-vars-demo-border);
        border-radius: 1rem;
        color: inherit;
        background: var(--css-vars-demo-panel);
        text-decoration: none;
        transition: transform 160ms ease, box-shadow 160ms ease;
      }
      .css-vars-demo__card:hover { transform: translateY(-2px); box-shadow: 0 .8rem 2rem #17203314; }
      .css-vars-demo__card p { color: var(--css-vars-demo-muted); line-height: 1.45; }
    
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    
      @media (prefers-reduced-motion: reduce){:scope{animation:none;transition:none}}
    `,
  },
  () => ({}),
  () =>
    div([
      CssVarsPageNav(),
      div({ class: 'css-vars-demo__intro' }, [
        heading('Typed CSS variables'),
        p(
          'Each mechanism now has its own page to isolate its behavior and contract.',
        ),
      ]),
      headingSection(
      section(
        { class: 'css-vars-demo__grid', 'aria-label': 'Examples' },
        CASES.map(({ path, title, description }) =>
          a('cardLink',
            {
              class: 'css-vars-demo__card',
              craftRouterLink: { to: path },
            },
            [heading(title), p(description)],
          ).pipe(CraftRouterLink),
        ),
      ),
      ),
    ]),
);

export default CssVarsDemo;
