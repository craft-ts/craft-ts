import {
  article,
  craftComponent,
  CraftRouterOutlet,
  div,
  h1,
  h2,
  header,
  p,
  section,
  span,
  strong,
  type Input,
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
        h1('Parent route values inside a lazy feature'),
        p('This lazy route displays inherited params and data as SFC inputs.'),
      ]),
      div({ class: 'lazy-grid' }, [
        article([
          h2('Layout component'),
          p([strong('Layout route: '), `/craft/lazy-layout/${teamId()}`]),
          p([strong('Parent route input: '), teamId()]),
          p([strong('Parent route data: '), someParentRouteData()]),
        ]),
        CraftRouterOutlet(),
      ]),
    ]),
);

export default LazyLayoutComponent;
