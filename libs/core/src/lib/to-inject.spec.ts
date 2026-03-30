import { Injectable, Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { toInject } from './to-inject';

describe('toInject', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1- Should sync provided signals with service entry signals', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class MyService {
      myIdEntry = signal<string | undefined>(undefined);
      filterEntry = signal('all');
      ignored = signal(false);
    }

    await TestBed.runInInjectionContext(async () => {
      const injectMyService = toInject(MyService);
      const myId = signal('1');
      const myService = injectMyService({ myId });

      await vi.runAllTimersAsync();
      expect(myService.myIdEntry()).toBe('1');
      expect(myService.filterEntry()).toBe('all');

      myId.set('2');
      await vi.runAllTimersAsync();

      expect(myService.myIdEntry()).toBe('2');
    });
  });

  it('2- Should infer bindings from service properties ending with Entry', () => {
    class MyService {
      myIdEntry = signal<string | undefined>(undefined);
      countEntry = signal(0);
      ignored = signal(false);
    }

    const injectMyService = toInject(MyService);

    expectTypeOf<Parameters<typeof injectMyService>[0]>().toEqualTypeOf<
      | {
          myId?: Signal<string | undefined>;
          count?: Signal<number>;
        }
      | undefined
    >();
  });
});
