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
} from '@craft-ts/component';
import { example } from '../../shared/example.style';

const LazyLayoutComponent = craftComponent(
  'LazyLayoutComponent',
  {},
  (teamId: Input<string>, someParentRouteData: Input<string>) => {
    return { teamId, someParentRouteData };
  },
  ({ teamId, someParentRouteData }) =>
    section({ class: example.stack }, [
      header({ class: example.hero }, [
        span('Inherited parent bindings'),
        heading({ class: example.title }, 'Parent route values inside a lazy feature'),
        p('This lazy route displays inherited params and data as SFC inputs.'),
      ]),
      headingSection(
      div({ class: example.split }, [
        article({ class: example.stack }, [
          heading({ class: example.subtitle }, 'Layout component'),
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
