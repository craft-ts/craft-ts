import { craftSignal, type CraftSignal } from '../host/craft-signal';
import {
  notifyException,
  type Observer,
  type StreamObserver,
  type Subscribable,
  type Unsubscribable,
} from './subscribable';

/**
 * A hot, multicast push source. `T` is the value type and `E` the **declared
 * set of typed failures** the producer may raise through {@link Subject.exception}
 * (a union of `{ _tag: ... }` shapes, `never` by default). Defects go through
 * {@link Subject.error} and are never typed.
 */
export interface Subject<T, E = never> extends Subscribable<T> {
  subscribe(observer: Partial<StreamObserver<T, E>>): Unsubscribable;
  next(value: T): void;
  /** Terminates the subject with a typed exception. */
  exception(exception: E): void;
  /** Terminates the subject with a defect. */
  error(error: unknown): void;
  complete(): void;
  readonly closed: boolean;
  /** Hides the producer side: only the read contract is exposed. */
  asSubscribable(): Subscribable<T>;
}

export interface BehaviorSubject<T, E = never> extends Subject<T, E> {
  /** Latest value. */
  readonly value: T;
  /** Reactive read of the latest value. */
  readonly signal: CraftSignal<T>;
}

export interface ReplaySubjectOptions {
  /** Entries older than `windowMs` are not replayed to late subscribers. */
  windowMs?: number;
  /** Clock used for the replay window (defaults to `Date.now`). */
  now?: () => number;
}

type Terminal =
  | { readonly kind: 'complete' }
  | { readonly kind: 'exception'; readonly exception: unknown }
  | { readonly kind: 'error'; readonly error: unknown };

type Entry<T> = { readonly at: number; readonly value: T };

class SubjectImpl<T, E> implements Subject<T, E> {
  private observers: Array<Partial<StreamObserver<T, E>>> = [];
  private terminal: Terminal | undefined;
  private readonly buffer: Array<Entry<T>> = [];
  private readonly capacity: number;
  private readonly options: ReplaySubjectOptions;

  constructor(capacity: number, options: ReplaySubjectOptions = {}) {
    this.capacity = capacity;
    this.options = options;
  }

  get closed(): boolean {
    return this.terminal !== undefined;
  }

  subscribe(observer: Partial<StreamObserver<T, E>>): Unsubscribable {
    for (const entry of this.replayable()) {
      observer.next?.(entry.value);
    }

    if (this.terminal) {
      this.deliverTerminal(observer, this.terminal);
      return { unsubscribe: () => undefined };
    }

    this.observers.push(observer);

    return {
      unsubscribe: () => {
        this.observers = this.observers.filter((item) => item !== observer);
      },
    };
  }

  next(value: T): void {
    if (this.terminal) return;
    this.record(value);
    for (const observer of this.observers.slice()) {
      observer.next?.(value);
    }
  }

  exception(exception: E): void {
    this.close({ kind: 'exception', exception });
  }

  error(error: unknown): void {
    this.close({ kind: 'error', error });
  }

  complete(): void {
    this.close({ kind: 'complete' });
  }

  asSubscribable(): Subscribable<T> {
    return {
      subscribe: (observer: Partial<Observer<T>>) => this.subscribe(observer),
    };
  }

  protected record(value: T): void {
    if (this.capacity <= 0) return;
    this.buffer.push({ at: this.now(), value });
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private replayable(): readonly Entry<T>[] {
    const windowMs = this.options.windowMs;
    if (windowMs === undefined) return this.buffer.slice();
    const threshold = this.now() - windowMs;
    return this.buffer.filter((entry) => entry.at >= threshold);
  }

  private close(terminal: Terminal): void {
    if (this.terminal) return;
    this.terminal = terminal;
    const observers = this.observers;
    this.observers = [];
    for (const observer of observers) {
      this.deliverTerminal(observer, terminal);
    }
  }

  private deliverTerminal(
    observer: Partial<StreamObserver<T, E>>,
    terminal: Terminal,
  ): void {
    if (terminal.kind === 'complete') {
      observer.complete?.();
    } else if (terminal.kind === 'exception') {
      notifyException(observer, terminal.exception as E);
    } else {
      observer.error?.(terminal.error);
    }
  }
}

class BehaviorSubjectImpl<T, E>
  extends SubjectImpl<T, E>
  implements BehaviorSubject<T, E>
{
  private latest: T;
  private readonly latestSignal;

  constructor(initial: T) {
    super(1);
    this.latest = initial;
    this.latestSignal = craftSignal(initial);
    this.record(initial);
  }

  get value(): T {
    return this.latest;
  }

  get signal(): CraftSignal<T> {
    return this.latestSignal;
  }

  override next(value: T): void {
    if (this.closed) return;
    this.latest = value;
    this.latestSignal.set(value);
    super.next(value);
  }
}

/** A hot subject with no memory: late subscribers only see what comes next. */
export function subject<T, E = never>(): Subject<T, E> {
  return new SubjectImpl<T, E>(0);
}

/** A hot subject replaying its last `count` values (optionally time-windowed). */
export function replaySubject<T, E = never>(
  count: number,
  options?: ReplaySubjectOptions,
): Subject<T, E> {
  return new SubjectImpl<T, E>(count, options);
}

/** A hot subject that always holds, and replays, its latest value. */
export function behaviorSubject<T, E = never>(
  initial: T,
): BehaviorSubject<T, E> {
  return new BehaviorSubjectImpl<T, E>(initial);
}
