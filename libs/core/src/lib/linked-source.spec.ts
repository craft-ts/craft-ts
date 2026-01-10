import { computed } from '@angular/core';
import { Source, source } from './source';
import { linkedSource } from './linked-source';

describe('linkedSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should generate a linkedSource', () => {
    const mySource = source<{ text: string }>();
    const myLinkedSource = linkedSource(
      mySource,
      (sourceValue) => sourceValue.text
    );

    expectTypeOf(myLinkedSource).toEqualTypeOf<Source<string>>();

    const myListener = computed(() => {
      const s = mySource();
      console.log('mySource', s);
      return s;
    });

    expect(myListener()).toBe(undefined);
    console.log('myLinkedSource set');
    // todo create a linked source ?
    myLinkedSource.set('Hello World');

    expect(myListener()).toBe('Hello World');

    myLinkedSource.set('Hello Ng-Craft');
    expect(myListener()).toBe('Hello Ng-Craft');
  });
});
