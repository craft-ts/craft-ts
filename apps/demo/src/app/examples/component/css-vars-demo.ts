import {
  a,
  craftComponent,
  div,
  h1,
  h2,
  p,
  section,
} from '@craft-ng/component';
import { CraftRouterLink } from '@craft-ng/core';
import { CssVarsPageNav } from './css-vars-demo.shared';

const CASES = [
  {
    path: 'css-vars/required',
    title: 'Valeurs requises et optionnelles',
    description:
      'Comparer plusieurs instances, les fallbacks et le marqueur omit.',
  },
  {
    path: 'css-vars/inheritance',
    title: 'Héritage natif',
    description:
      'Observer inherit et la résolution de la variable depuis un parent.',
  },
  {
    path: 'css-vars/forwarding',
    title: 'Forwarding et surcharge',
    description:
      'Transformer les tokens d’un enfant en API optionnelle du parent.',
  },
  {
    path: 'css-vars/property',
    title: '@property',
    description: 'Enregistrer un token numérique possédé par le composant.',
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
    `,
  },
  () => ({}),
  () =>
    div([
      CssVarsPageNav(),
      div({ class: 'css-vars-demo__intro' }, [
        h1('Variables CSS typées'),
        p(
          'Chaque mécanisme dispose maintenant de sa propre page pour isoler son comportement et son contrat.',
        ),
      ]),
      section(
        { class: 'css-vars-demo__grid', 'aria-label': 'Cas illustrés' },
        CASES.map(({ path, title, description }) =>
          a(
            {
              class: 'css-vars-demo__card',
              craftRouterLink: { to: path },
            },
            [h2(title), p(description)],
          ).pipe(CraftRouterLink),
        ),
      ),
    ]),
);

export default CssVarsDemo;
