import {
  assertInInjectionContext,
  DestroyRef,
  effect,
  inject,
  Injector,
  isSignal,
  Signal,
  Type,
  untracked,
  WritableSignal,
} from '@angular/core';

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type RemoveIndexSignature<T> = {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K]: T[K];
};

type FilterPrivateFields<T> = {
  [K in keyof T as K extends `_${string}` ? never : K]: T[K];
};

type PublicServiceEntry<Entry> =
  Entry extends WritableSignal<any>
    ? Entry
    : Entry extends Signal<any>
      ? Entry
      : Entry extends (...args: infer Args) => infer Result
        ? (...args: Args) => Result
        : Entry;

type SmartInject2Public<Service> = Prettify<
  RemoveIndexSignature<{
    [K in keyof Service]: PublicServiceEntry<Service[K]>;
  }>
>;

type SmartInject2Subscribable<Value> = {
  subscribe(
    callback: (value: Value) => unknown,
  ): { unsubscribe(): unknown } | void;
};

type SmartInject2EntryBinding<Entry> =
  Entry extends WritableSignal<infer Value>
    ? Signal<Value>
    : Entry extends { next(value: infer Value): unknown }
      ? SmartInject2Subscribable<Value>
      : Entry extends { emit(value: infer Value): unknown }
        ? SmartInject2Subscribable<Value>
        : never;

export type SmartInject2Bindings<Service> = Prettify<{
  [K in keyof SmartInject2Public<Service> as K extends `${string}Entry`
    ? K
    : never]: SmartInject2EntryBinding<SmartInject2Public<Service>[K]>;
}>;

export type SmartInject2Factory<Service, Output> = (
  context: SmartInject2Public<Service>,
) => Output;

export type SmartInject2Output<Output> = Prettify<
  FilterPrivateFields<Output>
>;

type SmartInject2TokenWithoutEntries<Service> =
  keyof SmartInject2Bindings<Service> extends never ? Type<Service> : never;

export function smartInject2<Service, Output>(
  token: SmartInject2TokenWithoutEntries<Service>,
  factory: SmartInject2Factory<Service, Output>,
): SmartInject2Output<Output>;
export function smartInject2<Service, Output>(
  token: Type<Service>,
  bindings: SmartInject2Bindings<Service>,
  factory: SmartInject2Factory<Service, Output>,
): SmartInject2Output<Output>;
/**
 * Creates a typed facade over an injected Angular service without insertion chaining.
 *
 * `smartInject2` can:
 * - bind mandatory service entries ending with `Entry`
 * - expose only the properties returned by the callback
 * - hide private keys prefixed with `_`
 * - bind service methods to the injected service instance
 *
 * @example
 * ```ts
 * @Injectable({ providedIn: 'root' })
 * class MyCounter {
 *   readonly valueEntry = signal<number>(0); // Entry suffix means a mandatory input
 *   readonly double = computed(() => this.valueEntry() * 2);
 *
 *   increment() {
 *     this.valueEntry.update((v) => v + 1);
 *   }
 *
 *   reset() {
 *     this.valueEntry.set(0);
 *   }
 * }
 *
 * const globalReset$ = new Subject<void>();
 *
 * const myCounterRef = smartInject2(
 *   MyCounter,
 *   {
 *     // mandatory bindings
 *     valueEntry: signal(10),
 *   },
 *   ({ double, valueEntry, increment, reset }) => ({
 *     double,
 *     triple: computed(() => valueEntry() * 3),
 *     increment,
 *     _reset: globalReset$.pipe(takeUntilDestroyed()).subscribe(() => reset()),
 *   }),
 * );
 *
 * expectTypeOf(myCounterRef).toEqualTypeOf<{
 *   double: Signal<number>;
 *   triple: Signal<number>;
 *   increment: () => void;
 * }>();
 * ```
 */
export function smartInject2<Service>(...args: any[]): any {
  assertInInjectionContext(smartInject2);

  const [token, bindingsOrFactory, maybeFactory] = args as [
    Type<Service>,
    SmartInject2Bindings<Service> | SmartInject2Factory<Service, unknown>,
    SmartInject2Factory<Service, unknown> | undefined,
  ];
  const hasBindings = typeof bindingsOrFactory !== 'function';
  const bindings = hasBindings
    ? (bindingsOrFactory as SmartInject2Bindings<Service>)
    : undefined;
  const factory = (
    hasBindings ? maybeFactory : bindingsOrFactory
  ) as SmartInject2Factory<Service, unknown> | undefined;

  if (typeof factory !== 'function') {
    throw new Error(`smartInject2: an insertion callback is required.`);
  }

  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const service = inject(token);

  applyEntryBindings({
    token,
    service,
    bindings,
    injector,
    destroyRef,
  });

  const rawOutput = factory(
    createPublicServiceApi(service) as SmartInject2Public<Service>,
  );

  return Object.entries(rawOutput ?? {}).reduce(
    (acc, [key, value]) => {
      if (key.startsWith('_')) {
        return acc;
      }

      acc[key] = value;
      return acc;
    },
    {} as Record<string, unknown>,
  );
}

function applyEntryBindings<Service>({
  token,
  service,
  bindings,
  injector,
  destroyRef,
}: {
  token: Type<Service>;
  service: Service;
  bindings: SmartInject2Bindings<Service> | undefined;
  injector: Injector;
  destroyRef: DestroyRef;
}) {
  const entryKeys = Object.keys(service as object).filter((key) =>
    key.endsWith('Entry'),
  );

  if (!entryKeys.length) {
    return;
  }

  if (!bindings) {
    throw new Error(
      `smartInject2: bindings are required for ${token.name} entries: ${entryKeys.join(', ')}.`,
    );
  }

  const missingBindings = entryKeys.filter(
    (entryKey) => !(entryKey in (bindings as Record<string, unknown>)),
  );

  if (missingBindings.length) {
    throw new Error(
      `smartInject2: missing bindings for ${token.name} entries: ${missingBindings.join(', ')}.`,
    );
  }

  const unknownBindings = Object.keys(bindings as object).filter(
    (bindingKey) => !entryKeys.includes(bindingKey),
  );

  if (unknownBindings.length) {
    throw new Error(
      `smartInject2: unknown bindings for ${token.name}: ${unknownBindings.join(', ')}.`,
    );
  }

  entryKeys.forEach((entryKey) => {
    const bindingSource = (bindings as Record<string, unknown>)[entryKey];
    const serviceEntry = (service as Record<string, unknown>)[entryKey];

    if (isWritableSignal(serviceEntry)) {
      if (!isSignal(bindingSource)) {
        throw new Error(
          `smartInject2: "${entryKey}" must be bound to an Angular signal.`,
        );
      }

      serviceEntry.set(bindingSource());

      effect(
        () => {
          const nextValue = bindingSource();
          untracked(() => {
            serviceEntry.set(nextValue);
          });
        },
        { injector },
      );

      return;
    }

    if (isSubjectLike(serviceEntry)) {
      if (!isSubscribable(bindingSource)) {
        throw new Error(
          `smartInject2: "${entryKey}" must be bound to a subscribable source.`,
        );
      }

      const bindingSubscription = bindingSource.subscribe((value) => {
        if ('next' in serviceEntry && typeof serviceEntry.next === 'function') {
          serviceEntry.next(value);
          return;
        }

        if ('emit' in serviceEntry && typeof serviceEntry.emit === 'function') {
          serviceEntry.emit(value);
          return;
        }

        throw new Error(
          `smartInject2: "${entryKey}" must expose a "next" or "emit" method.`,
        );
      });

      if (bindingSubscription?.unsubscribe) {
        destroyRef.onDestroy(() => bindingSubscription.unsubscribe());
      }

      return;
    }

    throw new Error(
      `smartInject2: "${entryKey}" must be a WritableSignal or a subscribable sink on ${token.name}.`,
    );
  });
}

function createPublicServiceApi(service: unknown) {
  const boundMethods = new Map<string | symbol, unknown>();

  return new Proxy({} as Record<PropertyKey, unknown>, {
    get: (_target, propertyKey) => {
      const serviceEntry = (service as Record<PropertyKey, unknown>)[
        propertyKey
      ];

      if (typeof serviceEntry === 'function' && !isSignal(serviceEntry)) {
        if (!boundMethods.has(propertyKey)) {
          boundMethods.set(propertyKey, (...args: unknown[]) =>
            untracked(() => serviceEntry.apply(service, args)),
          );
        }

        return boundMethods.get(propertyKey);
      }

      return serviceEntry;
    },
  });
}

function isWritableSignal(value: unknown): value is WritableSignal<unknown> {
  return (
    typeof value === 'function' &&
    'set' in value &&
    typeof value.set === 'function'
  );
}

function isSubscribable(
  value: unknown,
): value is SmartInject2Subscribable<unknown> {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    'subscribe' in value &&
    typeof value.subscribe === 'function'
  );
}

function isSubjectLike(
  value: unknown,
): value is
  | {
      next(value: unknown): unknown;
    }
  | {
      emit(value: unknown): unknown;
    } {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    (('next' in value && typeof value.next === 'function') ||
      ('emit' in value && typeof value.emit === 'function'))
  );
}
