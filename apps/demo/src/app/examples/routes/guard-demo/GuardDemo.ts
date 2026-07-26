import { craftComponent } from '@craft-ng/component';
import { provideHostName } from '@craft-ng/core';

export const GuardDemo = craftComponent(
  'GuardDemo',
  { providers: [provideHostName('component:GuardDemo')] },
  () => ({}),
  () => 'Should not be displayed',
);
