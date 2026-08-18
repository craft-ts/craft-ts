import {
  craftComponent,
  p,
} from '@craft-ts/component';

export const lazyMessage = craftComponent(
  'lazyMessage',
  {},
  () => ({}),
  () =>
    p(
      {
        class: 'component-demo__lazy-content',
        'data-testid': 'deferred-content',
      },
      'Le composant différé est chargé.',
    ),
);
