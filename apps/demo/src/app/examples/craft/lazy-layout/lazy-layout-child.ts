import {
  craftService,
  craftExpose,
  type CraftServiceInput,
} from '@craft-ts/core';
import {
  article,
  craftComponent,
  h,
  p,
  span,
  withComponentProviders,
  type Input,
  heading,
} from '@craft-ts/component';
import { OtherComponent } from './other';
import { example } from '../../shared/example.style';

export const { LazyLayoutChildView, provideLazyLayoutChildView } = craftService(
  { name: 'lazyLayoutChildView', providedIn: 'toProvide' },
  function* (inputs: {
    readonly $provided: {
      readonly teamId: CraftServiceInput<string>;
      readonly someParentRouteData: CraftServiceInput<string>;
    };
  }) {
    const { teamId, someParentRouteData } = inputs.$provided;

    yield* craftExpose('teamId', teamId);
    yield* craftExpose('someParentRouteData', someParentRouteData);
  },
);

const LazyLayoutChildComponent = craftComponent(
  'LazyLayoutChildComponent',
  {},
  (inputs: {
    readonly teamId: Input<string>;
    readonly someParentRouteData: Input<string>;
  }) => [
    article({ class: example.tealCard }, [
      span('Child component'),
      heading(
        { class: example.subtitle },
        'Input binding inside a lazy feature',
      ),
      p('The inherited parent values are available as typed SFC inputs.'),
      h('dl', { class: example.definitions }, [
        h('dt', { class: example.term }, 'teamId'),
        h('dd', { class: example.definition }, inputs.teamId),
        h('dt', { class: example.term }, 'someParentRouteData'),
        h('dd', { class: example.definition }, inputs.someParentRouteData),
      ]),
    ]),
    OtherComponent({}),
  ],
).pipe(
  withComponentProviders(({ teamId, someParentRouteData }) => [
    provideLazyLayoutChildView({ teamId, someParentRouteData }),
  ]),
);

export default LazyLayoutChildComponent;
