import {
  craftComponent,
  div,
  ifNode,
  p,
  heading,
} from '@craft-ts/component';
import { craftComputed, CraftGlobalError } from '@craft-ts/core';
import { example } from './examples/shared/example.style';

function isDisabledError(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_tag' in value &&
    value._tag === 'USER_DISABLED'
  );
}

export const MyGlobalErrorScreen = craftComponent(
  'MyGlobalErrorScreen',
  {},
  function* () {
    const error = yield* CraftGlobalError();
    const disabled = craftComputed(
      'disabled',
      () => {
        return isDisabledError(error());
      },
    );
    return { error, disabled };
  },
  ({ disabled }) => {
    return div({ class: example.alert, 'data-exampleAlert': 'danger' }, [
      heading({ class: example.subtitle }, [
        '⚠️ ',
        ifNode(disabled, () => 'Account disabled', () => 'Something went wrong'),
      ]),
      p(
        ifNode(
          disabled,
          () => 'This account has been disabled. Contact support to restore access.',
          () => 'An unexpected error occurred while loading this page.',
        ),
      ),
    ]);
  },
);
