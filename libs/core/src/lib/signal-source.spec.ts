import { computed } from '@angular/core';
import { SignalSource, signalSource } from './signal-source';

describe('source', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should generate a source that enable to emit a value, and the listener to receive it', () => {
    const mySource = signalSource<string>();

    expectTypeOf(mySource).toEqualTypeOf<SignalSource<string>>();

    const myListener = computed(() => {
      const s = mySource();
      return s;
    });

    expect(myListener()).toBe(undefined);

    mySource.set('Hello World');

    expect(myListener()).toBe('Hello World');

    mySource.set('Hello Ng-Craft');
    expect(myListener()).toBe('Hello Ng-Craft');
  });

  it('A listener at n+1 should not get the value when listened and get data for the first time', () => {
    const mySource = signalSource<string>();

    mySource.set('Hello World');

    const myListener = computed(() => mySource());
    expect(myListener()).toBe(undefined);

    mySource.set('Hello Ng-Craft v2');
    expect(myListener()).toBe('Hello Ng-Craft v2');
  });

  it('A listener at n+1 should get the last value when using "preserveLastValue" config and listened and get data for the first time ', () => {
    const mySource = signalSource<string>();

    mySource.set('Hello World');

    const myListener = computed(() => mySource.preserveLastValue());
    expect(myListener()).toBe('Hello World');

    mySource.set('Hello Ng-Craft v2');
    expect(myListener()).toBe('Hello Ng-Craft v2');
  });
});
