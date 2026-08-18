/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo shell styles. */
import {
  CraftRouterOutlet,
  craftComponent,
  div,
  heading,
  headingSection,
  main,
  p,
} from '@craft-ts/component';

export const App = craftComponent(
  'App',
  {
    styles: `
      :scope { display: block; min-height: 100vh; }
      .app-header { padding: 1.5rem 2rem 0; }
      .app-header h1 { margin: 0; color: #0f172a; font-size: 1.35rem; }
      .app-header p { margin: 0.35rem 0 0; color: #64748b; font-size: 0.9rem; }
      .app-content { padding: 0 1rem 2rem; }
    `,
  },
  function* () {
    return {};
  },
  () =>
    div([
      div({ class: 'app-header' }, [
        heading('EffectTS + CraftTS'),
        p(
          'Un espace de démonstration dédié aux programmes Effect dans CraftTS.',
        ),
      ]),
      main({ class: 'app-content' }, headingSection(CraftRouterOutlet())),
    ]),
);
