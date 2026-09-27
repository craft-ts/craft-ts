import { craftService } from '@craft-ts/core';
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
import { example } from '../../shared/example.style';

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
  },
  function* (inputs: {
    readonly teamId: Input<string>;
    readonly someParentRouteData: Input<string>;
  }) {
    const { teamId, someParentRouteData } = yield* LazyLayoutChildView(inputs);
    return [
      article({ class: example.tealCard }, [
        span('Child component'),
        heading(
          { class: example.subtitle },
          'Input binding inside a lazy feature',
        ),
        p('The inherited parent values are available as typed SFC inputs.'),
        h('dl', { class: example.definitions }, [
          h('dt', { class: example.term }, 'teamId'),
          h('dd', { class: example.definition }, teamId),
          h('dt', { class: example.term }, 'someParentRouteData'),
          h('dd', { class: example.definition }, someParentRouteData),
        ]),
      ]),
      OtherComponent({}),
    ];
  },
);

export default LazyLayoutChildComponent;
