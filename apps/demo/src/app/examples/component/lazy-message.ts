import {
  component,
  p,
} from '@craft-ng/component';

export const lazyMessage = component(
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
