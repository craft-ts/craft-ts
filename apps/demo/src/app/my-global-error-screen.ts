/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  craftComponent,
  div,
  ifBlock,
  p,
  heading,
} from '@craft-ts/component';
import { craftComputed, CraftGlobalError } from '@craft-ts/core';

export const MyGlobalErrorScreen = craftComponent(
  'MyGlobalErrorScreen',
  {
    styles:
      ':scope{padding:2rem;border:1px solid #fca5a5;border-radius:8px;background:#fef2f2;color:#991b1b}',
  },
  function* () {
    const error = yield* CraftGlobalError();
    const disabled = craftComputed(
      'disabled',
      () => (error() as { code?: string } | null)?.code === 'USER_DISABLED',
    );
    return { error, disabled };
  },
  ({ disabled }) => {
    return div([
      heading([
        '⚠️ ',
        ifBlock(disabled, () => 'Account disabled', () => 'Something went wrong'),
      ]),
      p(
        ifBlock(
          disabled,
          () => 'This account has been disabled. Contact support to restore access.',
          () => 'An unexpected error occurred while loading this page.',
        ),
      ),
    ]);
  },
);
