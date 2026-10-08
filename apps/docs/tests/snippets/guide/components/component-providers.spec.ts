// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderCraftComponent } from '@craft-ts/component/testing';

// #region component-providers
import {
  craftComputed,
  craftService,
  type CraftServiceInput,
} from '@craft-ts/core';
import {
  craftComponent,
  p,
  withComponentProviders,
  type Input,
} from '@craft-ts/component';

const { ProfileContext, provideProfileContext } = craftService(
  { name: 'ProfileContext', providedIn: 'toProvide' },
  function* (inputs: { $provided: { profileId: CraftServiceInput<string> } }) {
    yield* craftComputed('label', function* () {
      return `Profile: ${yield* inputs.$provided.profileId()}`;
    });
  },
);

const Profile = craftComponent(
  'Profile',
  {},
  (_inputs: { profileId: Input<string> }) => p(ProfileContext.label),
).pipe(
  withComponentProviders(({ profileId }) => [
    provideProfileContext({ profileId }),
  ]),
);
// #endregion component-providers

it('updates the documented provider configuration through its input reader', async () => {
  const rendered = await renderCraftComponent(Profile, {
    props: {
      profileId: function* () {
        return 'ada';
      },
    },
  });
  expect(rendered.element.textContent).toBe('Profile: ada');
  rendered.mounted.updateProps({
    profileId: function* () {
      return 'grace';
    },
  });
  await rendered.flush();
  expect(rendered.element.textContent).toBe('Profile: grace');
  rendered.destroy();
});
