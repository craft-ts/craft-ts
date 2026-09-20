import { craftComponent, p } from '@craft-ts/component';

export const lazyMessage = craftComponent('lazyMessage', {}, function* () {
  return p(
    {
      class: 'component-demo__lazy-content',
      'data-testid': 'deferred-content',
    },
    'The deferred component is loaded.',
  );
});
