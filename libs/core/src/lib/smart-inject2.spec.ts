import '@angular/compiler';
import {
  computed,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { smartInject2 } from './smart-inject2';

@Injectable({
  providedIn: 'root',
})
class ServiceA {
  value = signal(0);
  double = computed(() => this.value() * 2);
  triple = computed(() => this.value() * 3);

  increment() {
    this.value.update((v) => v + 1);
  }

  reset() {
    this.value.set(0);
  }
}

describe('smartInject2', () => {
  beforeAll(() => {
    try {
      TestBed.initTestEnvironment(
        BrowserTestingModule,
        platformBrowserTesting(),
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes(
          'Cannot set base providers because it has already been called',
        )
      ) {
        throw error;
      }
    }
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1- Should expose only the declared properties and no insertions context', () => {
    TestBed.runInInjectionContext(() => {
      const serviceA = TestBed.inject(ServiceA);
      serviceA.reset();

      const smartInjectServiceA = smartInject2(ServiceA, (serviceA) => {
        type HasInsertions = 'insertions' extends keyof typeof serviceA
          ? true
          : false;

        expectTypeOf<HasInsertions>().toEqualTypeOf<false>();

        return {
          triple: computed(() => serviceA.value() * 3),
          value: serviceA.value,
        };
      });

      expectTypeOf(smartInjectServiceA).toEqualTypeOf<{
        triple: Signal<number>;
        value: WritableSignal<number>;
      }>();

      expect(smartInjectServiceA.triple()).toBe(0);
      expect(smartInjectServiceA.value()).toBe(0);
      expect('double' in smartInjectServiceA).toBe(false);

      smartInjectServiceA.value.set(2);

      expect(smartInjectServiceA.triple()).toBe(6);
    });
  });

  it('2- Should hide private properties while keeping their side effects', () => {
    TestBed.runInInjectionContext(() => {
      const serviceA = TestBed.inject(ServiceA);
      serviceA.reset();

      const onDecline$ = new Subject<void>();
      const smartInjectServiceA = smartInject2(ServiceA, (serviceA) => ({
        triple: computed(() => serviceA.value() * 3),
        _resetOnDecline: onDecline$
          .pipe(takeUntilDestroyed())
          .subscribe(() => serviceA.reset()),
      }));

      serviceA.increment();
      serviceA.increment();

      expectTypeOf(smartInjectServiceA).toEqualTypeOf<{
        triple: Signal<number>;
      }>();

      expect(smartInjectServiceA.triple()).toBe(6);
      expect('_resetOnDecline' in smartInjectServiceA).toBe(false);

      onDecline$.next();

      expect(serviceA.value()).toBe(0);
      expect(smartInjectServiceA.triple()).toBe(0);
    });
  });

  it('3- Should bind all service entries from the second parameter', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class MyService {
      myIdEntry = signal<string | undefined>(undefined);
      filterEntry = signal('all');
      obsEntry = new Subject<void>();
      ignored = signal(false);
    }

    await TestBed.runInInjectionContext(async () => {
      const rawService = TestBed.inject(MyService);
      const myId = signal('1');
      const myFilter = signal('other');
      const myObs = new Subject<void>();
      const obsSpy = vi.fn();

      rawService.obsEntry.subscribe(obsSpy);

      const myService = smartInject2(
        MyService,
        {
          myIdEntry: myId,
          filterEntry: myFilter,
          obsEntry: myObs,
        },
        ({ myIdEntry, filterEntry }) => ({
          currentSearch: computed(
            () => `id:${myIdEntry()} filter:${filterEntry()}`,
          ),
        }),
      );

      expectTypeOf(myService).toEqualTypeOf<{
        currentSearch: Signal<string>;
      }>();

      await vi.runAllTimersAsync();

      expect(rawService.myIdEntry()).toBe('1');
      expect(rawService.filterEntry()).toBe('other');
      expect(myService.currentSearch()).toBe('id:1 filter:other');

      myObs.next();

      expect(obsSpy).toHaveBeenCalledTimes(1);

      myId.set('2');
      myFilter.set('all');

      await vi.runAllTimersAsync();

      expect(rawService.myIdEntry()).toBe('2');
      expect(rawService.filterEntry()).toBe('all');
      expect(myService.currentSearch()).toBe('id:2 filter:all');
    });
  });

  it('4- Should support mandatory entry bindings with public methods and hidden subscriptions', async () => {
    @Injectable({ providedIn: 'root' })
    class MyCounter {
      readonly valueEntry = signal<number>(0);
      readonly double = computed(() => this.valueEntry() * 2);

      increment() {
        this.valueEntry.update((v) => v + 1);
      }

      reset() {
        this.valueEntry.set(0);
      }
    }

    await TestBed.runInInjectionContext(async () => {
      const valueEntry = signal(10);
      const globalReset$ = new Subject<void>();

      const myCounterRef = smartInject2(
        MyCounter,
        {
          valueEntry,
        },
        ({ double, valueEntry, increment, reset }) => ({
          double,
          triple: computed(() => valueEntry() * 3),
          increment,
          _reset: globalReset$
            .pipe(takeUntilDestroyed())
            .subscribe(() => reset()),
        }),
      );

      expectTypeOf(myCounterRef).toEqualTypeOf<{
        double: Signal<number>;
        triple: Signal<number>;
        increment: () => void;
      }>();

      await vi.runAllTimersAsync();

      expect(myCounterRef.double()).toBe(20);
      expect(myCounterRef.triple()).toBe(30);
      expect('_reset' in myCounterRef).toBe(false);

      myCounterRef.increment();

      expect(myCounterRef.double()).toBe(22);
      expect(myCounterRef.triple()).toBe(33);

      globalReset$.next();

      expect(myCounterRef.double()).toBe(0);
      expect(myCounterRef.triple()).toBe(0);

      valueEntry.set(4);
      await vi.runAllTimersAsync();

      expect(myCounterRef.double()).toBe(8);
      expect(myCounterRef.triple()).toBe(12);
    });
  });
});
