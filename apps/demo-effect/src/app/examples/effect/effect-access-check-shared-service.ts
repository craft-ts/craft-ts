import {
  button,
  craftComponent,
  div,
  heading,
  ifNode,
  p,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { queryEffect } from '@craft-ts/effect';
import { checkUserAccess } from '../../shared/access-domain';
import { example } from '../../effect-demo.style';

/**
 * Demonstrates a shared business operation whose service dependency is
 * provided by the application Layer, not resolved by the component.
 */
const EffectSharedServiceComponent = craftComponent(
  'EffectSharedServiceComponent',
  {},
  function* () {
    const accessQuery = yield* queryEffect(
      'accessQuery',
      {
        method: (userId: string) => userId,
        loader: ({ params }) => checkUserAccess(params),
      },
      ({ resource }) => ({
        hasDecision: craftComputed('hasDecision', () => resource.hasValue()),
        showUnknown: craftComputed('showUnknown', function* () {
          return !(yield* resource.isLoading()) && !resource.hasValue();
        }),
        userName: craftComputed('userName', function* () {
          return (yield* resource.value())?.user.name ?? '…';
        }),
        accessLabel: craftComputed('accessLabel', function* () {
          return (yield* resource.value())?.label ?? '…';
        }),
        accessReason: craftComputed('accessReason', function* () {
          return (yield* resource.value())?.reason ?? '…';
        }),
      }),
    );

    yield* accessQuery.call('user-ada'); // trigger first call

    return { accessQuery };
  },
  ({ accessQuery }) =>
    div({ class: example.card, 'data-exampleTint': 'blue' }, [
      heading({ class: example.title }, 'Check access rights'),
      p(
        { class: example.intro },
        'An operator wants to know what they can do with a member’s profile. The decision is computed by a shared business operation that uses a mocked access policy service.',
      ),
      div({ class: example.actions }, [
        button(
          'adaButton',
          {
            class: example.button,
            type: 'button',
            *click() {
              yield* accessQuery.call('user-ada');
            },
          },
          'Ada — administrator',
        ),
        button(
          'graceButton',
          {
            class: example.button,
            type: 'button',
            *click() {
              yield* accessQuery.call('user-grace');
            },
          },
          'Grace — member',
        ),
        button(
          'linusButton',
          {
            class: example.button,
            type: 'button',
            *click() {
              yield* accessQuery.call('user-linus');
            },
          },
          'Linus — suspended account',
        ),
      ]),
      div({ class: example.panel }, [
        p({ class: example.panelTitle }, 'Access decision'),
        ifNode(accessQuery.isLoading, () => p('Checking access…')),
        ifNode(accessQuery.hasDecision, () => [
          p({ class: example.row }, [strong('User: '), accessQuery.userName]),
          p({ class: example.row }, [
            strong('Level: '),
            accessQuery.accessLabel,
          ]),
          p({ class: example.row }, [
            strong('Why: '),
            accessQuery.accessReason,
          ]),
        ]),
        ifNode(accessQuery.showUnknown, () =>
          p({ class: example.row }, 'Unknown user.'),
        ),
      ]),
      p({ class: example.note }, [
        'The component calls ',
        span({ class: example.mono }, 'checkUserAccess(userId)'),
        '. It does not know about ',
        span({ class: example.mono }, 'AccessPolicyService'),
        ': the application Layer supplies this dependency to the Effect operation.',
      ]),
    ]),
);

export default EffectSharedServiceComponent;
