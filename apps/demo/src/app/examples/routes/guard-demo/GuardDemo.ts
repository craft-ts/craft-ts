import { craftComponent } from '@craft-ng/component';

export const GuardDemo = craftComponent(
  'GuardDemo',
  {},
  () => ({}),
  () => 'Should not be displayed',
);
