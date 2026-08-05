import {
  article,
  craftComponent,
  h,
  h2,
  p,
  span,
  type Input,
} from '@craft-ng/component';
import { OtherComponent } from './other';

const LazyLayoutChildComponent = craftComponent(
  'LazyLayoutChildComponent',
  {
    styles:
      ':scope{display:grid;gap:.875rem;padding:1.5rem;border-radius:20px;background:#f0fdfa;border:1px solid #99f6e4}',
  },
  (teamId: Input<string>, someParentRouteData: Input<string>) => {
    return { teamId, someParentRouteData };
  },
  ({ teamId, someParentRouteData }) => [
    article([
      span('Child component'),
      h2('Input binding inside a lazy feature'),
      p('The inherited parent values are available as typed SFC inputs.'),
      h('dl', [
        h('dt', 'teamId'),
        h('dd', teamId()),
        h('dt', 'someParentRouteData'),
        h('dd', someParentRouteData()),
      ]),
    ]),
    OtherComponent({}),
  ],
);

export default LazyLayoutChildComponent;
