import { CommonModule } from '@angular/common';
import { Component, linkedSignal } from '@angular/core';
import {
  afterRecomputation,
  craft,
  craftInputs,
  craftSources,
  craftState,
  source,
  state,
} from '@ng-craft/core';

const { craftSharedFeature } = craft(
  {
    name: 'sharedFeature',
    providedIn: 'feature',
  },
  craftInputs({
    defaultNumber: undefined as number | undefined,
  }),
  craftState('numberList', ({ defaultNumber }) =>
    state(
      linkedSignal(() => {
        return [defaultNumber() ?? 1];
      }),
      ({ state, set }) => ({
        addNumber: () => {
          return set([...state(), defaultNumber() ?? 1]);
        },
        reset: () => {
          set([]);
        },
      }),
    ),
  ),
);

const { injectHost1Craft } = craft(
  {
    name: 'host1',
    providedIn: 'root',
  },
  craftSources({
    increment: source<{}>(),
    decrement: source<{}>(),
    reset: source<{}>(),
  }),
  craftState('counter', ({ increment, decrement }) =>
    state(10, ({ state, set }) => ({
      increment: afterRecomputation(increment, () => set(state() + 1)),
      decrement: afterRecomputation(decrement, () => set(state() - 1)),
      reset: () => set(0),
    })),
  ),
  craftSharedFeature(({ reset, counter }) => ({
    inputs: {
      defaultNumber: counter,
    },
    methods: {
      numberListReset: reset,
    },
  })),
);

const { injectHost2Craft } = craft(
  {
    name: 'host2',
    providedIn: 'root',
  },
  craftSources({
    increment: source<{}>(),
    decrement: source<{}>(),
    reset: source<{}>(),
  }),
  craftState('counter', ({ decrement }) =>
    state(200, ({ state, set }) => ({
      increment: () => set(state() + 1),
      decrement: afterRecomputation(decrement, () => set(state() - 1)),
      reset: () => set(0),
    })),
  ),
  craftSharedFeature(({ reset, counter }) => ({
    inputs: {
      defaultNumber: counter,
    },
    methods: {
      numberListReset: reset,
    },
  })),
);

@Component({
  selector: 'app-test',
  standalone: true,
  imports: [CommonModule],
  template: `store1
    <div>{{ store1.counter() }} / {{ store1.numberList() }}</div>
    store2
    <div>{{ store2.counter() }} / {{ store2.numberList() }}</div>`,
})
export default class TestComponent {
  store1 = injectHost1Craft();
  store2 = injectHost2Craft();
}
