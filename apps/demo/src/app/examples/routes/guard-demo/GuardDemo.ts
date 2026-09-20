import { craftComponent, heading } from '@craft-ts/component';

export const GuardDemo = craftComponent('GuardDemo', {}, function* () {
  return [heading('Guard demo'), 'Should not be displayed'];
});
