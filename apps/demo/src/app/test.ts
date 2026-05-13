import { Component } from '@angular/core';
import {
    craftService,
    MaybeSignal,
    provideHostName,
    state,
    toValue,
    type ExtractDeps,
    type GetDeps,
    type GetPublicComponentProperties
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
  template: `
    <div>
      Counter 1: {{ counter1() }}
      <button (click)="counter1.increment()">Increment Counter 1</button>
    </div>

    <div>
      Counter 2: {{ counter2() }}
      <button (click)="counter2.increment()">Increment Counter 2</button>
    </div>
  `,
  providers: [provideHostName('TestComponent')]
})
export default class TestComponent {
  counter1 = injectCounter({ initialValue: 0 });
  counter2 = injectCounter({ initialValue: 200 });
}

export type GenDeps_TestComponent = GetDeps<{
      deps: {};
      propertiesDeps: {
        counter1: {
            Counter: ExtractDeps<typeof injectCounter>["Counter"];
          };
        counter2: {
            Counter: ExtractDeps<typeof injectCounter>["Counter"];
          };
      };
      provided: {
        HostName: ReturnType<typeof provideHostName>;
      };
      publicProperties: GetPublicComponentProperties<TestComponent>;
    }>;
