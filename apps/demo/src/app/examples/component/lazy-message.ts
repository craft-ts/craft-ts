import { craftService } from '@craft-ts/core';
import { craftComponent, p } from '@craft-ts/component';

const { LazyMessageView, provideLazyMessageView } = craftService(
  { name: 'lazyMessageView', providedIn: 'toProvide' },
  () => ({}),
);

export const lazyMessage = craftComponent(
  'lazyMessage',
  { providers: [provideLazyMessageView()] },
  function* () {
    yield* LazyMessageView();
    return p(
      {
        class: 'component-demo__lazy-content',
        'data-testid': 'deferred-content',
      },
      'The deferred component is loaded.',
    );
  },
);
