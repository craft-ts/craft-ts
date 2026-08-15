/* eslint-disable craft-ng/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  article,
  craftComponent,
  CraftRouterOutlet,
  div,
  header,
  p,
  section,
  span,
  strong,
  type Input,
  heading,
  headingSection,
} from '@craft-ng/component';

const LazyLayoutComponent = craftComponent(
  'LazyLayoutComponent',
  {
    styles:
      ':scope{display:grid;gap:1.5rem}.lazy-hero{padding:1.75rem;border-radius:24px;color:#f8fafc;background:linear-gradient(135deg,#0f172a,#0f766e)}.lazy-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:1.25rem}',
  },
  (teamId: Input<string>, someParentRouteData: Input<string>) => {
    return { teamId, someParentRouteData };
  },
  ({ teamId, someParentRouteData }) =>
    section([
      header({ class: 'lazy-hero' }, [
        span('Inherited parent bindings'),
        heading('Parent route values inside a lazy feature'),
        p('This lazy route displays inherited params and data as SFC inputs.'),
      ]),
      headingSection(
      div({ class: 'lazy-grid' }, [
        article([
          heading('Layout component'),
          p([
            strong('Layout route: '),
            function* () {
              return `/craft/lazy-layout/${yield* teamId()}`;
            },
          ]),
          p([
            strong('Parent route input: '),
            teamId,
          ]),
          p([
            strong('Parent route data: '),
            someParentRouteData,
          ]),
        ]),
        CraftRouterOutlet(),
      ]),
      ),
    ]),
);

export default LazyLayoutComponent;
