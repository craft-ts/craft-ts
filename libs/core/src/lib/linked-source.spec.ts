import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SignalSource, signalSource } from './signal-source';
import { linkedSource } from './linked-source';

describe('linkedSource', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
  it('should generate a linkedSource', () => {
    TestBed.runInInjectionContext(() => {
      const mySource = signalSource<{ text: string }>('mySource');
      const myLinkedSource = linkedSource(
        mySource,
        (sourceValue) => sourceValue.text,
      );

      expectTypeOf(myLinkedSource).toEqualTypeOf<SignalSource<string>>();

      const myListener = computed(() => {
        const s = myLinkedSource();
        return s;
      });

      expect(myListener()).toBe(undefined);
      console.log('myLinkedSource set');
      // todo create a linked source ?
      myLinkedSource.set('Hello World');

      expect(myListener()).toBe('Hello World');

      myLinkedSource.set('Hello Ng-Craft');
      expect(myListener()).toBe('Hello Ng-Craft');
      console.log('mySource set');
      mySource.set({ text: 'Hello Angular' });
      console.log('myListener()', myListener());
      expect(myListener()).toBe('Hello Angular');
    });
  });
});
