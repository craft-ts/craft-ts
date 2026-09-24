import {
  abstract,
  craftException,
  craftService,
  craftComputed,
  state,
} from '@craft-ts/core';
import {
  button,
  catchTag,
  craftComponent,
  p,
  section,
  withProviders,
  heading,
} from '@craft-ts/component';
import { componentUi } from './component-demos.style';

const noAccess = craftException({ _tag: 'NO_ACCESS' });
const { RestrictedData, provideRestrictedData } = craftService(
  { name: 'restrictedData', providedIn: 'abstract' },
  abstract<string | typeof noAccess>(),
);

const restrictedContent = craftComponent(
  'restrictedContent',
  {},
  function* () {
    return { value: yield* RestrictedData() };
  },
  ({ value }) =>
    p(
      { class: componentUi.restricted },
      `Private data: ${value}`,
    ),
);

export const componentCompositionDemo = craftComponent(
  'componentCompositionDemo',
  { host: { class: componentUi.host } },
  function* () {
    const canReadRestrictedData = yield* state(
      'canReadRestrictedData',
      false,
      ({ update, state }) => ({
        restriction: craftComputed('restriction', function* () {
          return (yield* state()) ? 'accessible' : noAccess;
        }),
        toggle: () => update((v) => !v),
      }),
    );

    const lastHandledException = yield* state(
      'lastHandledException',
      '',
      ({ set }) => ({
        showNoAccessText: () =>
          set(
            'NO_ACCESS handled by catchTag (the boundary renders no template).',
          ),
      }),
    );
    return {
      canReadRestrictedData,
      lastHandledException,
    };
  },
  ({ canReadRestrictedData, lastHandledException }) =>
    section({ class: componentUi.page }, [
      heading('Reactive composition with providers'),
      p(
        'The provider supplies data to the component. Click to go through the NO_ACCESS handler, then back to the template.',
      ),
      button('accessToggle',
        { type: 'button',
          class: componentUi.button,
          'data-componentButton': 'slate',
          click: canReadRestrictedData.toggle,
        },
        'Toggle access',
      ),
      p(lastHandledException),
      restrictedContent.pipe(
        withProviders([
          provideRestrictedData(canReadRestrictedData.restriction),
        ]),
        catchTag.exhaustive({
          NO_ACCESS: function* () {
            yield* lastHandledException.showNoAccessText();
            return;
          },
        }),
      )({}),
    ]),
);
