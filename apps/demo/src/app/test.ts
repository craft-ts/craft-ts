import { afterEveryRender, Component, computed } from '@angular/core';
import {
  asyncProcess,
  BrowserNavigator,
  componentMonitoring,
  craftMethod,
  craftPipe,
  insertSelect,
  provideHostName,
  state,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';

function _render() {
  afterEveryRender(() => console.log('rendered Test'));
}

@Component({
  selector: 'app-test',
  template: `Counter {{ counter().value }} / isOdd:
    {{ counter.selectValue().isOdd() }}/
    <button (click)="counter.selectValue().increment()">Increment</button>
    <button (click)="shouldFailed()">Should fail</button> `,
  providers: [provideHostName('component:TestComponent')],
})
export default class TestComponent {
  private readonly _monitoring = componentMonitoring();

  _ = _render();
  counter = state(
    {
      value: 0,
      nestedValue: 'hello',
    },
    (context) =>
      craftPipe(
        context,
        insertSelect('value', ({ state, update }) => ({
          increment: () => update((c) => c + 1),
          isOdd: computed(() => state() % 2 === 1),
        })),
        insertSelect('nestedValue', ({ state }) => ({
          value: computed(() => state()),
          totalLength: computed(() => state().length),
        })),
      ),
  );

  a = asyncProcess(
    {
      method: (payload: { title: string; url: string }) => payload,
      loader: function* ({ params }) {
        return (yield* BrowserNavigator.share(params)) as Promise<undefined>;
      },
    },
    ({ resource }) => ({
      isMenuOpen: computed(() => resource.status() === 'loading'),
    }),
  );

  shouldFailed = craftMethod('shouldFailed', this, () => {
    throw new Error('This method should not be called');
  });
}

export type GenDeps_TestComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    _monitoring: ExtractDeps<TestComponent['_monitoring']>;
    _: ExtractDeps<TestComponent['_']>;
    counter: ExtractDeps<TestComponent['counter']>;
    a: ExtractDeps<TestComponent['a']>;
    shouldFailed: ExtractDeps<TestComponent['shouldFailed']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<TestComponent>;
}>;
