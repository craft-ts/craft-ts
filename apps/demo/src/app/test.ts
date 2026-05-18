import { Component, computed } from '@angular/core';
import {
  craftMethod,
  craftService,
  insertSelect,
  MaybeSignal,
  provideHostName,
  state,
  toValue,
  type ExtractDeps,
  type GetDeps,
  type GetPublicComponentProperties,
} from '@craft-ng/core';

const { BToYield } = craftService({ name: 'B', scope: 'function' }, () => {
  return {
    getValue: () => 'test service value',
  };
});

const { injectCounter } = craftService(
  { name: 'Counter', scope: 'function' },
  function* (inputs: { initialValue: MaybeSignal<number> }) {
    const b = yield* BToYield();
    // eslint-disable-next-line craft-ng/prefer-browser-boundaries
    console.log('Value from service B:', b.getValue());
    return state(toValue(inputs.initialValue), ({ update }) => ({
      increment: () => update((c) => c + 1),
    }));
  },
);

@Component({
  selector: 'app-test',
  template: `Counter {{ counter() }} / isOdd:
    <button (click)="shouldFailed()">Should fail</button> `,
  providers: [provideHostName('component:TestComponent')],
})
export default class TestComponent {
  counter = state(
    {
      value: 0,
      nestedValue: 'hello',
    },
    insertSelect('value', ({ state }) => ({
      isOdd: computed(() => state() % 2 === 1),
    })),
    insertSelect('nestedValue', ({ state }) => ({
      value: computed(() => state()),
      totalLength: computed(() => state().length),
    })),
  );

  shouldFailed = craftMethod('shouldFailed', this, () => {
    throw new Error('This method should not be called');
  });
}

export type GenDeps_TestComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    counter: ExtractDeps<TestComponent['counter']>;
    shouldFailed: ExtractDeps<TestComponent['shouldFailed']>;
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<TestComponent>;
}>;
