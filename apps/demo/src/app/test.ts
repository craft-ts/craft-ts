import { Component } from '@angular/core';
import {
  craftMethod,
  craftService,
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
  template: ` <button (click)="shouldFailed()">Should fail</button> `,
  providers: [provideHostName('TestComponent')],
})
export default class TestComponent {
  shouldFailed = craftMethod('shouldFailed', this, function* () {
    throw new Error('This method should not be called');
  });
}

export type GenDeps_TestComponent = GetDeps<{
  deps: {};
  propertiesDeps: {
    counter1: {
      Counter: ExtractDeps<typeof injectCounter>['Counter'];
    };
    counter2: {
      Counter: ExtractDeps<typeof injectCounter>['Counter'];
    };
  };
  provided: {
    HostName: ReturnType<typeof provideHostName>;
  };
  publicProperties: GetPublicComponentProperties<TestComponent>;
}>;
