import { computed, signal } from '@angular/core';
import { craft } from './craft';
import { craftComputedStates } from './craft-computed';
import { TestBed } from '@angular/core/testing';
import { craftState } from './craft-state';
import { state } from './state';

describe('craftComputed', () => {
  it('should enable to defined computed states', () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftComputedStates(() => ({
        fullName: signal('John Doe'),
      }))
    );

    TestBed.runInInjectionContext(() => {
      const store = injectCraft();
      expect(store.fullName()).toBe('John Doe');
      expectTypeOf(store.fullName()).toEqualTypeOf<string>();
    });
  });

  it('should enable to defined computed states based on store states', () => {
    const { injectCraft } = craft(
      {
        name: '',
        providedIn: 'root',
      },
      craftState('firstName', () => state('John')),
      craftComputedStates(({ firstName }) => {
        return {
          fullName: computed(() => `${firstName()} Doe`),
          nameLength: computed(() => firstName().length),
        };
      })
    );

    TestBed.runInInjectionContext(() => {
      const store = injectCraft();
      expect(store.fullName()).toBe('John Doe');
      expectTypeOf(store.fullName()).toEqualTypeOf<string>();
      expect(store.nameLength()).toBe(4);
      expectTypeOf(store.nameLength()).toEqualTypeOf<number>();
    });
  });
});
