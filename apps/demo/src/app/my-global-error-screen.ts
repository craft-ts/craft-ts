import { craftComponent, div, ifNode, p, heading } from '@craft-ts/component';
import { craftService, craftComputed, CraftGlobalError } from '@craft-ts/core';
import { example } from './examples/shared/example.style';

function isDisabledError(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    '_tag' in value &&
    value._tag === 'USER_DISABLED'
  );
}

export const { MyGlobalErrorScreenView, provideMyGlobalErrorScreenView } =
  craftService(
    { name: 'myGlobalErrorScreenView', providedIn: 'toProvide' },
    function* () {
      const error = yield* CraftGlobalError();
      yield* craftComputed('disabled', () => {
        return isDisabledError(error());
      });
    },
  );

export const MyGlobalErrorScreen = craftComponent(
  'MyGlobalErrorScreen',
  {
    providers: [provideMyGlobalErrorScreenView()],
  },
  () =>
    div({ class: example.alert, 'data-exampleAlert': 'danger' }, [
      heading({ class: example.subtitle }, [
        '⚠️ ',
        ifNode(
          'global-error-title-disabled',
          MyGlobalErrorScreenView.disabled,
          () => 'Account disabled',
          () => 'Something went wrong',
        ),
      ]),
      p(
        ifNode(
          'global-error-message-disabled',
          MyGlobalErrorScreenView.disabled,
          () =>
            'This account has been disabled. Contact support to restore access.',
          () => 'An unexpected error occurred while loading this page.',
        ),
      ),
    ]),
);
