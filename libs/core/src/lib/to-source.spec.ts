import { computed, signal } from '@angular/core';
import { toSource } from './to-source';
import { ReadonlySource } from './util/source.type';

describe('toSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should generate a source from a signal that enable to emit a value, and the listener to receive it', () => {
    const mySignal = signal('init');
    const mySource = toSource(mySignal);

    expectTypeOf(mySource).toEqualTypeOf<ReadonlySource<string>>();

    const myListener = computed(() => {
      const s = mySource();
      return s;
    });

    expect(myListener()).toBe(undefined);

    mySignal.set('Hello World');

    expect(myListener()).toBe('Hello World');

    mySignal.set('Hello Ng-Craft');
    expect(myListener()).toBe('Hello Ng-Craft');
  });

  it('A listener at n+1 should not get the value when listened and get data for the first time', () => {
    const mySignal = signal('init');
    const mySource = toSource(mySignal);

    mySignal.set('Hello World');

    const myListener = computed(() => mySource());
    expect(myListener()).toBe(undefined);

    mySignal.set('Hello Ng-Craft v2');
    expect(myListener()).toBe('Hello Ng-Craft v2');
  });

  it('A listener at n+1 should get the last value when using "preserveLastValue" config and listened and get data for the first time ', () => {
    const mySignal = signal('init');
    const mySource = toSource(mySignal);

    mySignal.set('Hello World');

    const myListener = computed(() => mySource.preserveLastValue());
    expect(myListener()).toBe('Hello World');

    mySignal.set('Hello Ng-Craft v2');
    expect(myListener()).toBe('Hello Ng-Craft v2');
  });

  it('should generate a source and accepts a computed parameters', () => {
    const mySignal = signal({ text: 'init' });
    const mySource = toSource(mySignal, {
      computed: (sourceValue) => sourceValue.text,
    });
    expectTypeOf(mySource).toEqualTypeOf<ReadonlySource<string>>();

    const myListener = computed(() => {
      const s = mySource();
      return s;
    });

    expect(myListener()).toBe(undefined);

    mySignal.set({ text: 'Hello World' });

    expect(myListener()).toBe('Hello World');

    mySignal.set({ text: 'Hello Ng-Craft' });
    expect(myListener()).toBe('Hello Ng-Craft');
  });
});
