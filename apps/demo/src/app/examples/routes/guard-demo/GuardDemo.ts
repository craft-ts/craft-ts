import { component } from '@craft-ng/component';
import { provideHostName, type GetDeps } from '@craft-ng/core';

export const GuardDemo = component(
  { providers: [provideHostName('component:GuardDemo')] },
  () => ({}),
  () => 'Should not be displayed',
);

export type GenDeps_GuardDemo = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
}>;
