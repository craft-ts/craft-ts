import { Observable } from 'rxjs';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  createEnvironmentInjector,
  DestroyRef,
  Injector,
  signal,
} from '../host/craft-compat';
import { TemporalCancelledError } from '../temporal-runtime';
import {
  EmptyStreamError,
  behaviorSubject,
  firstValueFrom,
  isObservableLike,
  lastValueFrom,
  replaySubject,
  signalChanges,
  subject,
  untilDestroyed,
  waitUntilTrue,
  type Subscribable,
  type SubscribableValue,
} from './index';

describe('subject', () => {
  it('multicasts to every subscriber and forgets past values', () => {
    const source = subject<number>();
    const a: number[] = [];
    const b: number[] = [];
    source.subscribe({ next: (value) => a.push(value) });
    source.next(1);
    source.subscribe({ next: (value) => b.push(value) });
    source.next(2);

    expect(a).toEqual([1, 2]);
    expect(b).toEqual([2]);
  });

  it('stops delivering after unsubscribe', () => {
    const source = subject<number>();
    const values: number[] = [];
    const subscription = source.subscribe({ next: (v) => values.push(v) });
    source.next(1);
    subscription.unsubscribe();
    source.next(2);

    expect(values).toEqual([1]);
  });

  it('routes a typed exception to `exception`, or to `error` as a fallback', () => {
    const source = subject<number, { _tag: 'Boom' }>();
    const typed = vi.fn();
    const fallback = vi.fn();
    source.subscribe({ exception: typed });
    source.subscribe({ error: fallback });
    source.exception({ _tag: 'Boom' });

    expect(typed).toHaveBeenCalledWith({ _tag: 'Boom' });
    expect(fallback).toHaveBeenCalledWith({ _tag: 'Boom' });
    expect(source.closed).toBe(true);
  });

  it('keeps defects on the error channel and ignores values once closed', () => {
    const source = subject<number>();
    const error = vi.fn();
    const next = vi.fn();
    source.subscribe({ error, next });
    source.error(new Error('defect'));
    source.next(1);

    expect(error).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it('replays the terminal to late subscribers', () => {
    const source = subject<number>();
    source.complete();
    const complete = vi.fn();
    source.subscribe({ complete });

    expect(complete).toHaveBeenCalledOnce();
  });

  it('hides the producer side through asSubscribable', () => {
    const view = subject<number>().asSubscribable();

    expect('next' in view).toBe(false);
  });
});

describe('replaySubject', () => {
  it('replays the last n values to a late subscriber', () => {
    const source = replaySubject<number>(2);
    source.next(1);
    source.next(2);
    source.next(3);
    const values: number[] = [];
    source.subscribe({ next: (v) => values.push(v) });
    source.next(4);

    expect(values).toEqual([2, 3, 4]);
  });

  it('drops entries older than the window', () => {
    let now = 0;
    const source = replaySubject<number>(10, { windowMs: 100, now: () => now });
    source.next(1);
    now = 150;
    source.next(2);
    const values: number[] = [];
    source.subscribe({ next: (v) => values.push(v) });

    expect(values).toEqual([2]);
  });

  it('replays the buffer and then the terminal once closed', () => {
    const source = replaySubject<number>(1);
    source.next(1);
    source.complete();
    const events: string[] = [];
    source.subscribe({
      next: (v) => events.push(`next:${v}`),
      complete: () => events.push('complete'),
    });

    expect(events).toEqual(['next:1', 'complete']);
  });
});

describe('behaviorSubject', () => {
  it('emits the current value on subscription and exposes value and signal', () => {
    const source = behaviorSubject(1);
    const values: number[] = [];
    source.subscribe({ next: (v) => values.push(v) });
    source.next(2);

    expect(values).toEqual([1, 2]);
    expect(source.value).toBe(2);
    expect(source.signal()).toBe(2);
  });
});

describe('isObservableLike', () => {
  it('recognises structural subscribables only', () => {
    expect(isObservableLike(subject())).toBe(true);
    expect(isObservableLike(new Observable<number>(() => undefined))).toBe(
      true,
    );
    expect(isObservableLike(Promise.resolve(1))).toBe(false);
    expect(isObservableLike(signal(1))).toBe(false);
    expect(isObservableLike(null)).toBe(false);
  });
});

describe('rxjs interop', () => {
  it('assigns an rxjs Observable to Subscribable without a cast', () => {
    const observable = new Observable<number>((subscriber) => {
      subscriber.next(1);
      subscriber.complete();
    });
    const subscribable: Subscribable<number> = observable;
    const values: number[] = [];
    subscribable.subscribe({ next: (v) => values.push(v) });

    expect(values).toEqual([1]);
  });

  it('infers the value type of an rxjs Observable', () => {
    expectTypeOf<
      SubscribableValue<Observable<number>>
    >().toEqualTypeOf<number>();
    expectTypeOf<
      SubscribableValue<Subscribable<string>>
    >().toEqualTypeOf<string>();
  });

  it('consumes an rxjs Observable through firstValueFrom', async () => {
    const observable = new Observable<number>((subscriber) => {
      subscriber.next(5);
    });

    await expect(firstValueFrom(observable)).resolves.toBe(5);
  });
});

describe('firstValueFrom', () => {
  it('resolves with the first value satisfying the predicate', async () => {
    const source = subject<number | undefined>();
    const result = firstValueFrom(source, (v) => v !== undefined);
    source.next(undefined);
    source.next(7);
    source.next(8);

    await expect(result).resolves.toBe(7);
  });

  it('resolves from a synchronous source and unsubscribes', async () => {
    const source = behaviorSubject(3);

    await expect(firstValueFrom(source)).resolves.toBe(3);
  });

  it('rejects with EmptyStreamError when the source completes empty', async () => {
    const source = subject<number>();
    const result = firstValueFrom(source);
    source.complete();

    await expect(result).rejects.toBeInstanceOf(EmptyStreamError);
  });

  it('rejects with the typed exception', async () => {
    const source = subject<number, { _tag: 'Boom' }>();
    const result = firstValueFrom(source);
    source.exception({ _tag: 'Boom' });

    await expect(result).rejects.toEqual({ _tag: 'Boom' });
  });
});

function completedEmpty() {
  const emitter = subject<number>();
  emitter.complete();
  return emitter;
}

describe('firstValueFrom / lastValueFrom defaults', () => {
  it('resolve the default of an empty subscribable instead of rejecting', async () => {
    await expect(
      firstValueFrom(completedEmpty(), { defaultValue: 'none' }),
    ).resolves.toBe('none');
    await expect(
      lastValueFrom(completedEmpty(), { defaultValue: 'none' }),
    ).resolves.toBe('none');
  });

  it('lastValueFrom waits for completion and resolves the last value', async () => {
    const emitter = subject<number>();
    const result = lastValueFrom(emitter);
    emitter.next(1);
    emitter.next(2);
    emitter.complete();

    await expect(result).resolves.toBe(2);
  });

  it('lastValueFrom rejects on empty, exception and defect', async () => {
    await expect(lastValueFrom(completedEmpty())).rejects.toBeInstanceOf(
      EmptyStreamError,
    );

    const typed = subject<number, { _tag: 'Boom' }>();
    const viaException = lastValueFrom(typed);
    typed.exception({ _tag: 'Boom' });
    await expect(viaException).rejects.toEqual({ _tag: 'Boom' });

    const failure = new Error('defect');
    const defect = subject<number>();
    const viaError = lastValueFrom(defect);
    defect.error(failure);
    await expect(viaError).rejects.toBe(failure);
  });
});

describe('signalChanges', () => {
  it('emits the initial value once, then every change', () => {
    const count = signal(7);
    const values: number[] = [];
    const sub = signalChanges(count).subscribe({
      next: (value) => values.push(value),
    });
    expect(values).toEqual([7]);
    count.set(8);
    expect(values).toEqual([7, 8]);
    sub.unsubscribe();
    count.set(9);
    expect(values).toEqual([7, 8]);
  });

  it('stops after the given injector is destroyed', () => {
    const count = signal(0);
    const injector = createEnvironmentInjector([], Injector.NULL);
    const values: number[] = [];
    signalChanges(count, { injector }).subscribe({
      next: (value) => values.push(value),
    });
    count.set(1);
    expect(values).toEqual([0, 1]);
    injector.destroy();
    count.set(2);
    expect(values).toEqual([0, 1]);
  });

  it('feeds firstValueFrom after a single initial emit', async () => {
    await expect(firstValueFrom(signalChanges(signal(true)))).resolves.toBe(
      true,
    );
  });
});

describe('waitUntilTrue', () => {
  it('resolves as soon as the signal turns true', async () => {
    const ready = signal(false);
    const injector = createEnvironmentInjector([], Injector.NULL);
    const waiting = waitUntilTrue(ready, injector);
    ready.set(true);

    await expect(waiting).resolves.toBeUndefined();
  });

  it('resolves immediately when already true', async () => {
    const injector = createEnvironmentInjector([], Injector.NULL);

    await expect(
      waitUntilTrue(signal(true), injector),
    ).resolves.toBeUndefined();
  });

  it('rejects with TemporalCancelledError when the injector is destroyed first', async () => {
    const injector = createEnvironmentInjector([], Injector.NULL);
    const waiting = waitUntilTrue(signal(false), injector);
    injector.destroy();

    await expect(waiting).rejects.toBeInstanceOf(TemporalCancelledError);
  });
});

describe('untilDestroyed', () => {
  it('unsubscribes from the source when the destroy ref fires', () => {
    const source = subject<number>();
    const injector = createEnvironmentInjector([], Injector.NULL);
    const values: number[] = [];
    untilDestroyed(source, injector.get(DestroyRef)).subscribe({
      next: (value) => values.push(value),
    });
    source.next(1);
    injector.destroy();
    source.next(2);

    expect(values).toEqual([1]);
  });
});
