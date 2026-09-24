import {
  craftComponent,
  p,
} from '@craft-ts/component';
import { componentUi } from './component-demos.style';

export const lazyMessage = craftComponent(
  'lazyMessage',
  {},
  () => ({}),
  () =>
    p(
      {
        class: componentUi.lazyContent,
        'data-testid': 'deferred-content',
      },
      'The deferred component is loaded.',
    ),
);
