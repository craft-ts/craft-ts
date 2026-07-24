import {
  component,
  div,
  h2,
  p,
} from '@craft-ng/component';
import {
  injectCraftGlobalError,
  provideHostName,
  type GetDeps,
} from '@craft-ng/core';

export const MyGlobalErrorScreen = component(
  {
    providers: [provideHostName('component:MyGlobalErrorScreen')],
    styles:
      '.global-error{padding:2rem;border:1px solid #fca5a5;border-radius:8px;background:#fef2f2;color:#991b1b}',
  },
  () => ({ error: injectCraftGlobalError() }),
  ({ error }) => {
    const disabled = error()?.code === 'USER_DISABLED';
    return div({ class: 'global-error' }, [
      h2(`⚠️ ${disabled ? 'Account disabled' : 'Something went wrong'}`),
      p(
        disabled
          ? 'This account has been disabled. Contact support to restore access.'
          : 'An unexpected error occurred while loading this page.',
      ),
    ]);
  },
);

export type GenDeps_MyGlobalErrorScreen = GetDeps<{
  deps: Record<never, never>;
  propertiesDeps: Record<never, never>;
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: Record<never, never>;
  missingProvider: {
    CraftGlobalError: ReturnType<typeof injectCraftGlobalError>;
  };
}>;
