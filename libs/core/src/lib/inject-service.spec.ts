import {
  computed,
  Signal,
  signal,
  takeUntilDestroyed,
  WritableSignal,
} from './host/craft-compat';
import { TestBed } from './host/craft-test-bed';
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { afterRecomputation } from './after-recomputation';
import { ɵinjectService as injectService } from './inject-service';
import { on$ } from './on$';
import { source$ } from './source$';
import { signalSource } from './signal-source';

describe('Service2', () => {
    beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1- Should only expose the public entries returned by the insertion callback', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class MyService {
      total = computed(() => 10);
      resetCalls = signal(0);

      reset() {
        this.resetCalls.update((current) => current + 1);
      }
    }

    await TestBed.runInInjectionContext(async () => {
      const result = injectService(
        MyService,
        ({ total, reset, resetCalls }) => ({
          total,
          reset,
          resetCalls,
        }),
      );

      await vi.runAllTimersAsync();

      expect(result.total()).toBe(10);
      expect(result.resetCalls()).toBe(0);

      result.reset();
      expect(result.resetCalls()).toBe(1);
    });
  });

  it('2- Should apply bindings from insertions without exposing the bound properties', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class MyService {
      idInput = signal<string | undefined>(undefined);
      total = signal(0);
      events = new Subject<number>();
      receivedEvents: number[] = [];
      resetCalls = 0;

      constructor() {
        this.events.pipe(takeUntilDestroyed()).subscribe((value) => {
          this.receivedEvents.push(value);
        });
      }

      reset() {
        this.resetCalls += 1;
        this.total.set(0);
      }

      add(value: number) {
        this.total.update((current) => current + value);
      }
    }

    await TestBed.runInInjectionContext(async () => {
      const reset$ = source$<void>('reset$');
      const addValue = signalSource<number>('addValue');
      const replaceTotal = signalSource<number>('replaceTotal');
      const pushEvent$ = new Subject<number>();

      const result = injectService(
        MyService,
        ({ reset, total, idInput, receivedEvents, add, events }) => ({
          reset: on$(reset$, () => reset()),
          add: afterRecomputation(addValue, (value) => add(value)),
          total: afterRecomputation(replaceTotal, (value) => total.set(value)),
          events: on$(pushEvent$, (value) => events.next(value)),
          currentTotal: total,
          currentId: idInput,
          receivedEvents,
        }),
      );

      await vi.runAllTimersAsync();

      expect('reset' in result).toBe(false);
      expect('add' in result).toBe(false);
      expect('total' in result).toBe(false);
      expect('events' in result).toBe(false);

      expect(result.currentTotal()).toBe(0);
      result.currentTotal.set(1);
      expect(result.currentTotal()).toBe(1);
      result.currentTotal.set(0);
      expect(result.currentId()).toBeUndefined();

      addValue.set(3);
      await vi.runAllTimersAsync();
      expect(result.currentTotal()).toBe(3);

      replaceTotal.set(10);
      await vi.runAllTimersAsync();
      expect(result.currentTotal()).toBe(10);

      reset$.emit();
      await vi.runAllTimersAsync();
      expect(result.currentTotal()).toBe(0);

      pushEvent$.next(7);
      await vi.runAllTimersAsync();
      expect(result.receivedEvents).toEqual([7]);
    });
  });

  it('3- Should infer only opt-in exposed outputs and hide bound insertions from the result type', () => {
    @Injectable({
      providedIn: 'root',
    })
    class MyService {
      idInput = signal<string | undefined>(undefined);
      total = computed(() => 10);
      editableTotal = signal(0);
      events = new Subject<number>();

      reset() {
        return;
      }

      add(value: number) {
        return value;
      }
    }

    TestBed.runInInjectionContext(() => {
      const result = injectService(
        MyService,
        ({ total, reset, editableTotal, events, idInput, add }) => {
          expectTypeOf(total).toEqualTypeOf<Signal<number>>();
          expectTypeOf(reset).toEqualTypeOf<() => void>();
          expectTypeOf(add).toEqualTypeOf<(value: number) => number>();
          expectTypeOf(editableTotal).toEqualTypeOf<WritableSignal<number>>();
          expectTypeOf(events).toEqualTypeOf<Subject<number>>();
          expectTypeOf(idInput).toEqualTypeOf<
            WritableSignal<string | undefined>
          >();
          return {
            total,
            reset: on$(source$<void>('reset'), () => reset()),
            editableTotal: afterRecomputation(signalSource<number>('editableTotal'), (value) =>
              editableTotal.set(value),
            ),
            events: on$(new Subject<number>(), (value) => events.next(value)),
            currentId: idInput,
            doubleTotal: computed(() => total() * 2),
            addValue: computed(() => add(1)),
          };
        },
      );

      expectTypeOf(result).toEqualTypeOf<{
        currentId: WritableSignal<string | undefined>;
        total: Signal<number>;
        doubleTotal: Signal<number>;
        addValue: Signal<number>;
      }>();
    });
  });

  it('4- Should expose writable signals as WritableSignal in the callback and outputs', () => {
    @Injectable({
      providedIn: 'root',
    })
    class MyWritableService {
      total = signal(0);
    }

    TestBed.runInInjectionContext(() => {
      const result = injectService(MyWritableService, ({ total }) => {
        expectTypeOf(total).toMatchTypeOf<WritableSignal<number>>();

        return {
          currentTotal: total,
        };
      });

      expectTypeOf(result).toEqualTypeOf<{
        currentTotal: WritableSignal<number>;
      }>();
    });
  });

  it('5- Should chain up to 5 insertions with typed previous insertions access', async () => {
    @Injectable({
      providedIn: 'root',
    })
    class MyService {
      total = signal(2);
    }

    await TestBed.runInInjectionContext(async () => {
      const result = injectService(
        MyService,
        ({ total }) => ({
          total,
          doubled: computed(() => total() * 2),
        }),
        ({ insertions }) => ({
          tripled: computed(() => insertions.doubled() + insertions.total()),
        }),
        ({ insertions }) => ({
          quadrupled: computed(() => insertions.tripled() + insertions.total()),
        }),
        ({ insertions }) => ({
          quintupled: computed(
            () => insertions.quadrupled() + insertions.total(),
          ),
        }),
        ({ insertions }) => ({
          summary: computed(
            () =>
              `${insertions.doubled()}-${insertions.tripled()}-${insertions.quadrupled()}-${insertions.quintupled()}`,
          ),
        }),
      );

      await vi.runAllTimersAsync();

      expect(result.total()).toBe(2);
      expect(result.summary()).toBe('4-6-8-10');
    });

    TestBed.runInInjectionContext(() => {
      injectService(
        MyService,
        ({ total }) => ({
          total,
          doubled: computed(() => total() * 2),
        }),
        ({ insertions }) => {
          expectTypeOf(insertions).toEqualTypeOf<{
            total: WritableSignal<number>;
            doubled: Signal<number>;
          }>();

          return {
            tripled: computed(() => insertions.doubled() + insertions.total()),
          };
        },
        ({ insertions }) => {
          expectTypeOf(insertions).branded.toEqualTypeOf<{
            total: WritableSignal<number>;
            doubled: Signal<number>;
            tripled: Signal<number>;
          }>();

          return {
            quadrupled: computed(
              () => insertions.tripled() + insertions.total(),
            ),
          };
        },
        ({ insertions }) => {
          expectTypeOf(insertions).branded.toEqualTypeOf<{
            total: WritableSignal<number>;
            doubled: Signal<number>;
            tripled: Signal<number>;
            quadrupled: Signal<number>;
          }>();

          return {
            quintupled: computed(
              () => insertions.quadrupled() + insertions.total(),
            ),
          };
        },
        ({ insertions }) => {
          expectTypeOf(insertions).branded.toEqualTypeOf<{
            total: WritableSignal<number>;
            doubled: Signal<number>;
            tripled: Signal<number>;
            quadrupled: Signal<number>;
            quintupled: Signal<number>;
          }>();

          return {
            summary: computed(
              () =>
                `${insertions.doubled()}-${insertions.tripled()}-${insertions.quadrupled()}-${insertions.quintupled()}`,
            ),
          };
        },
      );
    });
  });
});
