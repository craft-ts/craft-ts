import {
  button,
  craftComponent,
  div,
  heading,
  headingSection,
  p,
  section,
  span,
  withComponentProviders,
  type Input,
} from '@craft-ts/component';
import {
  craftComputed,
  craftService,
  state,
  type CraftServiceInput,
} from '@craft-ts/core';
import { componentUi, projectionDemo } from './component-demos.style';

const { ComponentProfileContext, provideComponentProfileContext } =
  craftService(
    { name: 'ComponentProfileContext', providedIn: 'toProvide' },
    function* (inputs: {
      $provided: { profileId: CraftServiceInput<string> };
    }) {
      // Keep the input reader: this computed follows the parent without
      // recreating the service or its local counter.
      yield* craftComputed('profileId', function* () {
        return yield* inputs.$provided.profileId();
      });
      yield* state('clicks', 0, ({ update }) => ({
        increment: () => update((count) => count + 1),
      }));
    },
  );

// Ex: passage des inputs d'un composant pour créer un provider d'un service basé dessus
// C'est type-safe sinon c'est 💩
const profileWithComponentProviders = craftComponent(
  'profileWithComponentProviders',
  {},
  (inputs: { instanceName: Input<string>; profileId: Input<string> }) =>
    section({ class: projectionDemo.card }, [
      heading(inputs.instanceName),
      p([
        'Current profile: ',
        span(
          { 'data-testid': 'profile-id' },
          ComponentProfileContext.profileId,
        ),
      ]),
      p([
        'Local counter: ',
        span(
          { 'data-testid': 'profile-counter' },
          ComponentProfileContext.clicks,
        ),
      ]),
      button(
        'incrementProfileCounter',
        {
          type: 'button',
          class: componentUi.button,
          click: ComponentProfileContext.clicks.increment,
        },
        'Increment local counter',
      ),
    ]),
).pipe(
  // The list is fixed; only the value read through profileId changes.
  withComponentProviders(({ profileId }) => [
    provideComponentProfileContext({ profileId }),
  ]),
);

const { ComponentProvidersDemoView, provideComponentProvidersDemoView } =
  craftService(
    { name: 'ComponentProvidersDemoView', providedIn: 'toProvide' },
    function* () {
      yield* state('firstProfileId', 'ada', ({ update }) => ({
        change: () => update((id) => (id === 'ada' ? 'grace' : 'ada')),
      }));
      yield* state('secondProfileId', 'katherine', ({ update }) => ({
        change: () =>
          update((id) => (id === 'katherine' ? 'margaret' : 'katherine')),
      }));
    },
  );

export const componentProvidersDemo = craftComponent(
  'componentProvidersDemo',
  { providers: [provideComponentProvidersDemoView()] },
  () =>
    section({ class: componentUi.list }, [
      heading('withComponentProviders: inputs and a stable service scope'),
      p(
        'Both cards render the same component. Each provides its own service, configured with its profileId input.',
      ),
      p(
        'Increment the counters, then change a profile. The profile updates, each counter keeps its value, and the other card stays independent.',
      ),
      div({ class: projectionDemo.toolbar }, [
        button(
          'changeFirstProfile',
          {
            type: 'button',
            class: componentUi.button,
            click: ComponentProvidersDemoView.firstProfileId.change,
          },
          'Change profile A',
        ),
        button(
          'changeSecondProfile',
          {
            type: 'button',
            class: componentUi.button,
            click: ComponentProvidersDemoView.secondProfileId.change,
          },
          'Change profile B',
        ),
      ]),
      headingSection([
        profileWithComponentProviders({
          'data-profile-instance': 'A',
          instanceName: function* () {
            return 'Instance A';
          },
          profileId: function* () {
            return yield* ComponentProvidersDemoView.firstProfileId();
          },
        }),
        profileWithComponentProviders({
          'data-profile-instance': 'B',
          instanceName: function* () {
            return 'Instance B';
          },
          profileId: function* () {
            return yield* ComponentProvidersDemoView.secondProfileId();
          },
        }),
      ]),
    ]),
);
