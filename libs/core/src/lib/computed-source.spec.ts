import { computed } from '@angular/core';
import { ReadonlySource } from './util/source.type';
import { source } from './source';
import { computedSource } from './computed-source';

describe('computedSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should generate a computedSource', () => {
    const mySource = source<{ text: string }>();
    const myComputedSource = computedSource(
      mySource,
      (sourceValue) => sourceValue.text
    );

    expectTypeOf(myComputedSource).toEqualTypeOf<ReadonlySource<string>>();

    const myListener = computed(() => {
      const s = mySource();
      return s?.text;
    });

    expect(myListener()).toBe(undefined);
    mySource.set({ text: 'Hello World' });

    expect(myListener()).toBe('Hello World');
  });
});
