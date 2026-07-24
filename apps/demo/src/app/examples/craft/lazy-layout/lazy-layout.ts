import type { Router } from '@angular/router';
import {
  angular,
  article,
  component,
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
import {
  componentMonitoring,
  CraftRouterOutlet,
  provideHostName,
  type GetDeps,
} from '@craft-ng/core';

const LazyLayoutComponent = component(
  {
    providers: [provideHostName('component:LazyLayoutComponent')],
    styles:
      '.lazy-layout{display:grid;gap:1.5rem}.lazy-hero{padding:1.75rem;border-radius:24px;color:#f8fafc;background:linear-gradient(135deg,#0f172a,#0f766e)}.lazy-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:1.25rem}',
  },
  (
    teamId: Input<string>,
    someParentRouteData: Input<string>,
  ) => {
    componentMonitoring();
    return { teamId, someParentRouteData };
  },
  ({ teamId, someParentRouteData }) =>
    section({ class: 'lazy-layout' }, [
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
        angular(CraftRouterOutlet),
      ]),
    ]),
);

export default LazyLayoutComponent;
export type GenDeps_LazyLayoutComponent = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
  missingProvider: { Router: Router };
}>;
