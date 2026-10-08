import {
  abstract,
  craftException,
  craftService,
  craftComputed,
  state,
  craftExpose,
} from '@craft-ts/core';
import {
  button,
  catchTag,
  craftComponent,
  p,
  section,
  withProviders,
  heading,
  headingSection,
} from '@craft-ts/component';
import { componentUi } from './component-demos.style';
import { componentProvidersDemo } from './component-providers-demo';

const noAccess = craftException({ _tag: 'NO_ACCESS' });
const { RestrictedData, provideRestrictedData } = craftService(
  { name: 'restrictedData', providedIn: 'abstract' },
  abstract<string | typeof noAccess>(),
);

export const { RestrictedContentView, provideRestrictedContentView } =
  craftService(
    { name: 'restrictedContentView', providedIn: 'toProvide' },
    function* () {
      yield* craftExpose('value', yield* RestrictedData());
    },
  );

const restrictedContent = craftComponent(
  'restrictedContent',
  { providers: [provideRestrictedContentView()] },
  () =>
    p({ class: componentUi.restricted }, function* () {
      return `Private data: ${yield* RestrictedContentView.value()}`;
    }),
);

export const {
  ComponentCompositionDemoView,
  provideComponentCompositionDemoView,
} = craftService(
  { name: 'componentCompositionDemoView', providedIn: 'toProvide' },
  function* () {
    const canReadRestrictedData = yield* state(
      'canReadRestrictedData',
      false,
      ({ update }) => ({
        toggle: () => update((v) => !v),
      }),
    );
    yield* craftComputed('restriction', function* () {
      return (yield* canReadRestrictedData()) ? 'accessible' : noAccess;
    });

    yield* state('lastHandledException', '', ({ set }) => ({
      showNoAccessText: () =>
        set(
          'NO_ACCESS handled by catchTag (the boundary renders no template).',
        ),
    }));
  },
);

export const componentCompositionDemo = craftComponent(
  'componentCompositionDemo',
  {
    providers: [provideComponentCompositionDemoView()],
  },
  () =>
    section({ class: componentUi.page }, [
      heading('Reactive composition with providers'),
      p(
        'The provider supplies data to the component. Click to go through the NO_ACCESS handler, then back to the template.',
      ),
      button(
        'accessToggle',
        {
          type: 'button',
          class: componentUi.button,
          'data-componentButton': 'slate',
          click: ComponentCompositionDemoView.canReadRestrictedData.toggle,
        },
        'Toggle access',
      ),
      p(ComponentCompositionDemoView.lastHandledException),
      restrictedContent.pipe(
        withProviders([
          provideRestrictedData(function* () {
            return yield* ComponentCompositionDemoView.restriction();
          }),
        ]),
        catchTag.exhaustive({
          NO_ACCESS: function* () {
            yield* ComponentCompositionDemoView.lastHandledException.showNoAccessText();
          },
        }),
      )({}),
      headingSection([componentProvidersDemo()]),
    ]),
);
