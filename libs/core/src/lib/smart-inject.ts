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
import {
  FilterPrivateFields,
  FilterSource,
  Prettify,
  RemoveIndexSignature,
} from './util/util.type';
import { isSource } from './util/util';

type PublicServiceEntry<Entry> =
  Entry extends WritableSignal<any>
    ? Entry
    : Entry extends Signal<any>
      ? Entry
      : Entry extends (...args: infer Args) => infer Result
        ? (...args: Args) => Result
        : Entry;

type SmartInjectPublic<Service> = Prettify<
  RemoveIndexSignature<{
    [K in keyof Service]: PublicServiceEntry<Service[K]>;
  }>
>;

type SmartInjectEntryBinding<Entry> =
  Entry extends WritableSignal<infer Value>
    ? Signal<Value>
    : Entry extends { next(value: infer Value): unknown }
      ? SmartInjectSubscribable<Value>
      : Entry extends { emit(value: infer Value): unknown }
        ? SmartInjectSubscribable<Value>
        : never;

export type SmartInjectBindings<Service> = Prettify<{
  [K in keyof SmartInjectPublic<Service> as K extends `${string}Entry`
    ? K
    : never]: SmartInjectEntryBinding<SmartInjectPublic<Service>[K]>;
}>;

export type SmartInjectContext<Service, PreviousInsertions = {}> = Prettify<
  SmartInjectPublic<Service> & PreviousInsertions
>;

export type SmartInjectFactory<
  Service,
  Insertions,
  PreviousInsertions = {},
> = (
  context: SmartInjectContext<Service, PreviousInsertions>,
) => Insertions;

export type SmartInjectOutput<Insertions> = Prettify<
  FilterPrivateFields<FilterSource<Insertions>>
>;

type SmartInjectTokenWithoutEntries<Service> =
  keyof SmartInjectBindings<Service> extends never ? Type<Service> : never;

type SmartInjectSubscribable<Value> = {
  subscribe(
    callback: (value: Value) => unknown,
  ): { unsubscribe(): unknown } | void;
};

export function smartInject<Service, Insertion1>(
  token: SmartInjectTokenWithoutEntries<Service>,
  insertion1: SmartInjectFactory<Service, Insertion1>,
): SmartInjectOutput<Insertion1>;
export function smartInject<Service, Insertion1, Insertion2>(
  token: SmartInjectTokenWithoutEntries<Service>,
  insertion1: SmartInjectFactory<Service, Insertion1>,
  insertion2: SmartInjectFactory<Service, Insertion2, Insertion1>,
): SmartInjectOutput<Insertion1 & Insertion2>;
export function smartInject<Service, Insertion1, Insertion2, Insertion3>(
  token: SmartInjectTokenWithoutEntries<Service>,
  insertion1: SmartInjectFactory<Service, Insertion1>,
  insertion2: SmartInjectFactory<Service, Insertion2, Insertion1>,
  insertion3: SmartInjectFactory<
    Service,
    Insertion3,
    Insertion1 & Insertion2
  >,
): SmartInjectOutput<Insertion1 & Insertion2 & Insertion3>;
export function smartInject<
  Service,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
>(
  token: SmartInjectTokenWithoutEntries<Service>,
  insertion1: SmartInjectFactory<Service, Insertion1>,
  insertion2: SmartInjectFactory<Service, Insertion2, Insertion1>,
  insertion3: SmartInjectFactory<
    Service,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: SmartInjectFactory<
    Service,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): SmartInjectOutput<Insertion1 & Insertion2 & Insertion3 & Insertion4>;
export function smartInject<
  Service,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
>(
  token: SmartInjectTokenWithoutEntries<Service>,
  insertion1: SmartInjectFactory<Service, Insertion1>,
  insertion2: SmartInjectFactory<Service, Insertion2, Insertion1>,
  insertion3: SmartInjectFactory<
    Service,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: SmartInjectFactory<
    Service,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: SmartInjectFactory<
    Service,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): SmartInjectOutput<
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;
export function smartInject<Service, Insertion1>(
  token: Type<Service>,
  bindings: SmartInjectBindings<Service>,
  insertion1: SmartInjectFactory<Service, Insertion1>,
): SmartInjectOutput<Insertion1>;
export function smartInject<Service, Insertion1, Insertion2>(
  token: Type<Service>,
  bindings: SmartInjectBindings<Service>,
  insertion1: SmartInjectFactory<Service, Insertion1>,
  insertion2: SmartInjectFactory<Service, Insertion2, Insertion1>,
): SmartInjectOutput<Insertion1 & Insertion2>;
export function smartInject<Service, Insertion1, Insertion2, Insertion3>(
  token: Type<Service>,
  bindings: SmartInjectBindings<Service>,
  insertion1: SmartInjectFactory<Service, Insertion1>,
  insertion2: SmartInjectFactory<Service, Insertion2, Insertion1>,
  insertion3: SmartInjectFactory<
    Service,
    Insertion3,
    Insertion1 & Insertion2
  >,
): SmartInjectOutput<Insertion1 & Insertion2 & Insertion3>;
export function smartInject<
  Service,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
>(
  token: Type<Service>,
  bindings: SmartInjectBindings<Service>,
  insertion1: SmartInjectFactory<Service, Insertion1>,
  insertion2: SmartInjectFactory<Service, Insertion2, Insertion1>,
  insertion3: SmartInjectFactory<
    Service,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: SmartInjectFactory<
    Service,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): SmartInjectOutput<Insertion1 & Insertion2 & Insertion3 & Insertion4>;
export function smartInject<
  Service,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
>(
  token: Type<Service>,
  bindings: SmartInjectBindings<Service>,
  insertion1: SmartInjectFactory<Service, Insertion1>,
  insertion2: SmartInjectFactory<Service, Insertion2, Insertion1>,
  insertion3: SmartInjectFactory<
    Service,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: SmartInjectFactory<
    Service,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: SmartInjectFactory<
    Service,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): SmartInjectOutput<
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;
/**
 * Creates a typed facade over an injected Angular service.
 *
 * `smartInject` can:
 * - bind mandatory service entries ending with `Entry`
 * - expose only the properties returned by the insertion callbacks
 * - hide private keys prefixed with `_`
 * - chain multiple callbacks while keeping previous insertions accessible
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
 * const myCounterRef = smartInject(
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
export function smartInject<Service>(...args: any[]): any {
  assertInInjectionContext(smartInject);

  const [token, bindingsOrInsertion1, ...rest] = args as [
    Type<Service>,
    SmartInjectBindings<Service> | SmartInjectFactory<Service, unknown>,
    ...SmartInjectFactory<Service, unknown>[],
  ];
  const injector = inject(Injector);
  const destroyRef = inject(DestroyRef);
  const service = inject(token);
  const hasBindings = typeof bindingsOrInsertion1 !== 'function';
  const bindings = hasBindings
    ? (bindingsOrInsertion1 as SmartInjectBindings<Service>)
    : undefined;
  const insertions = (
    hasBindings ? rest : [bindingsOrInsertion1, ...rest]
  ) as SmartInjectFactory<Service, unknown>[];

  if (!insertions.length) {
    throw new Error(`smartInject: at least one insertion callback is required.`);
  }

  applyEntryBindings({
    token,
    service,
    bindings,
    injector,
    destroyRef,
  });

  const allPublic = createPublicServiceApi(service) as SmartInjectPublic<Service>;

  const outputs = insertions.reduce(
    (acc, insertion) => {
      const nextRawInsertions =
        insertion(
          createInsertionContext({
            allPublic,
            insertions: acc.rawInsertionsOutput,
          }) as any,
        ) ?? {};

      const nextExposedInsertions = Object.entries(nextRawInsertions).reduce(
        (exposedAcc, [key, value]) => {
          if (key.startsWith('_') || isSource(value)) {
            return exposedAcc;
          }

          exposedAcc[key] = value;
          return exposedAcc;
        },
        {} as Record<string, unknown>,
      );

      return {
        rawInsertionsOutput: {
          ...acc.rawInsertionsOutput,
          ...nextRawInsertions,
        },
        exposedInsertionsOutput: {
          ...acc.exposedInsertionsOutput,
          ...nextExposedInsertions,
        },
      };
    },
    {
      rawInsertionsOutput: {} as Record<string, unknown>,
      exposedInsertionsOutput: {} as Record<string, unknown>,
    },
  );

  return outputs.exposedInsertionsOutput;
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
  bindings: SmartInjectBindings<Service> | undefined;
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
      `smartInject: bindings are required for ${token.name} entries: ${entryKeys.join(', ')}.`,
    );
  }

  const missingBindings = entryKeys.filter(
    (entryKey) => !(entryKey in (bindings as Record<string, unknown>)),
  );

  if (missingBindings.length) {
    throw new Error(
      `smartInject: missing bindings for ${token.name} entries: ${missingBindings.join(', ')}.`,
    );
  }

  const unknownBindings = Object.keys(bindings as object).filter(
    (bindingKey) => !entryKeys.includes(bindingKey),
  );

  if (unknownBindings.length) {
    throw new Error(
      `smartInject: unknown bindings for ${token.name}: ${unknownBindings.join(', ')}.`,
    );
  }

  entryKeys.forEach((entryKey) => {
    const bindingSource = (bindings as Record<string, unknown>)[entryKey];
    const serviceEntry = (service as Record<string, unknown>)[entryKey];

    if (isWritableSignal(serviceEntry)) {
      if (!isSignal(bindingSource)) {
        throw new Error(
          `smartInject: "${entryKey}" must be bound to an Angular signal.`,
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
          `smartInject: "${entryKey}" must be bound to a subscribable source.`,
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
          `smartInject: "${entryKey}" must expose a "next" or "emit" method.`,
        );
      });

      if (bindingSubscription?.unsubscribe) {
        destroyRef.onDestroy(() => bindingSubscription.unsubscribe());
      }

      return;
    }

    throw new Error(
      `smartInject: "${entryKey}" must be a WritableSignal or a subscribable sink on ${token.name}.`,
    );
  });
}

function createInsertionContext<Service, PreviousInsertions>({
  allPublic,
  insertions,
}: {
  allPublic: SmartInjectPublic<Service>;
  insertions: PreviousInsertions;
}) {
  const insertionsRecord = insertions as Record<PropertyKey, unknown>;
  const publicRecord = allPublic as Record<PropertyKey, unknown>;

  return new Proxy({} as SmartInjectContext<Service, PreviousInsertions>, {
    get: (_target, propertyKey) => {
      if (Object.prototype.hasOwnProperty.call(insertionsRecord, propertyKey)) {
        return insertionsRecord[propertyKey];
      }

      return publicRecord[propertyKey];
    },
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
): value is SmartInjectSubscribable<unknown> {
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
