import { craftService } from '@craft-ts/core';
/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  article,
  craftComponent,
  h,
  p,
  span,
  type Input,
  heading,
} from '@craft-ts/component';
import { OtherComponent } from './other';

export const { LazyLayoutChildView, provideLazyLayoutChildView } = craftService(
  { name: 'lazyLayoutChildView', providedIn: 'toProvide' },
  (inputs: {
    readonly teamId: Input<string>;
    readonly someParentRouteData: Input<string>;
  }) => {
    const { teamId, someParentRouteData } = inputs;

    return { teamId, someParentRouteData };
  },
);

const LazyLayoutChildComponent = craftComponent(
  'LazyLayoutChildComponent',
  {
    providers: [provideLazyLayoutChildView()],
    styles:
      ':scope{display:grid;gap:.875rem;padding:1.5rem;border-radius:20px;background:#f0fdfa;border:1px solid #99f6e4}',
  },
  function* (inputs: {
    readonly teamId: Input<string>;
    readonly someParentRouteData: Input<string>;
  }) {
    const { teamId, someParentRouteData } = yield* LazyLayoutChildView(inputs);
    return [
      article([
        span('Child component'),
        heading('Input binding inside a lazy feature'),
        p('The inherited parent values are available as typed SFC inputs.'),
        h('dl', [
          h('dt', 'teamId'),
          h('dd', teamId),
          h('dt', 'someParentRouteData'),
          h('dd', someParentRouteData),
        ]),
      ]),
      OtherComponent({}),
    ];
  },
);

export default LazyLayoutChildComponent;
