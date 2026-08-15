import {
  craftComponent,
  heading,
} from '@craft-ng/component';

export const GuardDemo = craftComponent(
  'GuardDemo',
  {},
  () => ({}),
  () => [heading('Guard demo'), 'Should not be displayed'],
);
