import { craftService } from '@craft-ts/core';
import { craftComponent, heading } from '@craft-ts/component';

const { GuardDemoView, provideGuardDemoView } = craftService(
  { name: 'guardDemoView', providedIn: 'toProvide' },
  () => ({}),
);

export const GuardDemo = craftComponent(
  'GuardDemo',
  { providers: [provideGuardDemoView()] },
  function* () {
    yield* GuardDemoView();
    return [heading('Guard demo'), 'Should not be displayed'];
  },
);
