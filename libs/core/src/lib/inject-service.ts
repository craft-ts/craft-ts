import {
  assertInInjectionContext,
  inject,
  Injector,
  isSignal,
  runInInjectionContext,
  Signal,
  Type,
  untracked,
  WritableSignal,
} from '@angular/core';
import {
  FilterSource,
  HasKeys,
  Prettify,
  RemoveIndexSignature,
} from './util/util.type';
import { isSource } from './util/util';
import type { SourceBranded } from './util/util';
import { ɵcreateHostTaggedInjector } from './craft-service';
import { injectFnWrapper } from './fn-wrapper';
import {
  createYieldableInsertionMethod,
  isNonYieldableInsertionMethod,
  type YieldableInsertionMethods,
} from './yieldable';

const INJECT_SERVICE_INSERTION_INVALID_YIELD_ERROR_MESSAGE =
  'injectService insertion method generators can only yield craftService dependencies or exposed dependency helpers.';
const INJECT_SERVICE_INSERTION_APP_START_ERROR_MESSAGE =
  'injectService insertion method generators do not support onAppStart(...).';

type PublicServiceEntry<Entry> =
  Entry extends WritableSignal<any>
    ? Entry
    : Entry extends Signal<any>
      ? Entry
      : Entry extends (...args: infer Args) => infer Result
        ? (...args: Args) => Result
        : Entry;

export type InjectService2Public<Service> = Prettify<
  RemoveIndexSignature<{
    [K in keyof Service]: PublicServiceEntry<Service[K]>;
  }>
>;

export type InjectService2Insertions<Service> = Prettify<
  Record<string, unknown> & {
    [K in keyof InjectService2Public<Service>]?:
      | InjectService2Public<Service>[K]
      | SourceBranded;
  }
>;

export type InjectService2InsertionContext<
  Service,
  PreviousInsertions = {},
> = InjectService2Public<Service> & {
  insertions: HasKeys<PreviousInsertions> extends true
    ? YieldableInsertionMethods<PreviousInsertions>
    : never;
};

export type InjectService2InsertionFactory<
  Service,
  Insertions,
  PreviousInsertions = {},
> = (
  context: InjectService2InsertionContext<Service, PreviousInsertions>,
) => InjectService2Insertions<Service> & Insertions;

export type InjectService2Output<Service, Insertions> = Prettify<
  YieldableInsertionMethods<FilterSource<Insertions>>
>;

export function injectService<Service, Insertion1>(
  token: Type<Service>,
  insertion1: InjectService2InsertionFactory<Service, Insertion1>,
): InjectService2Output<Service, Insertion1>;
export function injectService<Service, Insertion1, Insertion2>(
  token: Type<Service>,
  insertion1: InjectService2InsertionFactory<Service, Insertion1>,
  insertion2: InjectService2InsertionFactory<Service, Insertion2, Insertion1>,
): InjectService2Output<Service, Insertion1 & Insertion2>;
export function injectService<Service, Insertion1, Insertion2, Insertion3>(
  token: Type<Service>,
  insertion1: InjectService2InsertionFactory<Service, Insertion1>,
  insertion2: InjectService2InsertionFactory<Service, Insertion2, Insertion1>,
  insertion3: InjectService2InsertionFactory<
    Service,
    Insertion3,
    Insertion1 & Insertion2
  >,
): InjectService2Output<Service, Insertion1 & Insertion2 & Insertion3>;
export function injectService<
  Service,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
>(
  token: Type<Service>,
  insertion1: InjectService2InsertionFactory<Service, Insertion1>,
  insertion2: InjectService2InsertionFactory<Service, Insertion2, Insertion1>,
  insertion3: InjectService2InsertionFactory<
    Service,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InjectService2InsertionFactory<
    Service,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): InjectService2Output<
  Service,
  Insertion1 & Insertion2 & Insertion3 & Insertion4
>;
export function injectService<
  Service,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
>(
  token: Type<Service>,
  insertion1: InjectService2InsertionFactory<Service, Insertion1>,
  insertion2: InjectService2InsertionFactory<Service, Insertion2, Insertion1>,
  insertion3: InjectService2InsertionFactory<
    Service,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InjectService2InsertionFactory<
    Service,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InjectService2InsertionFactory<
    Service,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): InjectService2Output<
  Service,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;

/**
 * Creates a typed facade over an injected Angular service.
 *
 * `injectService` exposes nothing by default. Each insertion callback receives the
 * public entries of the injected service and must explicitly return the API that
 * should be exposed.
 *
 * Returned entries can be:
 * - service signals or writable signals
 * - bound service methods
 * - renamed service entries
 * - derived values such as `computed(...)`
 * - hidden bindings created with utilities like `on$` or `afterRecomputation`
 *
 * Bindings returning a branded source are applied but filtered out of the final
 * result, which makes `injectService` useful for wiring internal reactions without
 * leaking implementation details in the public API.
 *
 * Multiple insertion callbacks can be chained. Each later insertion receives the
 * previous outputs through `context.insertions`, which is useful to progressively
 * build higher-level computed values.
 *
 * Service methods are exposed already bound to the service instance.
 *
 * @example
 * Build a small navigation facade from `Router`
 * ```ts
 * import { Component, computed } from '@angular/core';
 * import { Router } from '@angular/router';
 * import { injectService, on$, source$ } from '@craft-ng/core';
 *
 * @Component({
 *   selector: 'app-terms-page',
 *   template: '',
 *   standalone: true,
 * })
 * export class TermsPageComponent {
 *   private readonly userAccept = source$<void>('userAccept');
 *
 *   readonly navigation = injectService(
 *     Router,
 *     ({ navigateByUrl, currentNavigation }) => ({
 *       decline: () => navigateByUrl('/terms/declined'),
 *       navigateOnAccept: on$(this.userAccept, () =>
 *         navigateByUrl('/checkout/shipping', { replaceUrl: true }),
 *       ),
 *       isNavigating: computed(() => currentNavigation() !== null),
 *     }),
 *   );
 * }
 * ```
 *
 * @example
 * Build a checkout-oriented facade from a broader service
 * ```ts
 * import { Component, computed, Injectable, signal } from '@angular/core';
 * import { injectService } from '@craft-ng/core';
 *
 * @Injectable({ providedIn: 'root' })
 * class CheckoutService {
 *   cart = signal([{ sku: 'starter', quantity: 1, price: 20 }]);
 *   coupon = signal<string | null>(null);
 *   status = signal<'editing' | 'submitting' | 'submitted'>('editing');
 *   total = computed(() =>
 *     this.cart().reduce(
 *       (sum, item) => sum + item.quantity * item.price,
 *       0,
 *     ),
 *   );
 *
 *   submitOrder() {
 *     this.status.set('submitting');
 *   }
 *
 *   resetOrder() {
 *     this.cart.set([]);
 *     this.coupon.set(null);
 *     this.status.set('editing');
 *   }
 * }
 *
 * @Component({
 *   selector: 'app-checkout-summary',
 *   template: '',
 *   standalone: true,
 * })
 * export class CheckoutSummaryComponent {
 *   readonly checkout = injectService(
 *     CheckoutService,
 *     ({ cart, coupon, status, total, submitOrder, resetOrder }) => ({
 *       total,
 *       status,
 *       itemCount: computed(() =>
 *         cart().reduce((count, item) => count + item.quantity, 0),
 *       ),
 *       hasCoupon: computed(() => coupon() !== null),
 *       clear: resetOrder,
 *       submit: submitOrder,
 *     }),
 *     ({ insertions }) => ({
 *       canSubmit: computed(
 *         () =>
 *           insertions.itemCount() > 0 && insertions.status() === 'editing',
 *       ),
 *       summaryLabel: computed(
 *         () => `${insertions.itemCount()} items - ${insertions.total()} EUR`,
 *       ),
 *     }),
 *   );
 * }
 * ```
 */
export function injectService<Service>(...args: any[]): any {
  assertInInjectionContext(injectService);

  const [token, ...insertions] = args as [
    Type<unknown>,
    ...((
      context: InjectService2InsertionContext<unknown, Record<string, unknown>>,
    ) => Record<string, unknown>)[],
  ];

  const service = inject(token);
  const injector = inject(Injector);
  const allPublic = createPublicServiceApi(
    service,
  ) as InjectService2Public<Service>;
  const outputs = insertions.reduce(
    (acc, insertion) => {
      const nextRawInsertions =
        insertion(
          createInsertionContext({
            allPublic,
            insertions: acc.exposedInsertionsOutput,
          }) as InjectService2InsertionContext<
            Service,
            Record<string, unknown>
          >,
        ) ?? {};

      const nextExposedInsertions = Object.entries(nextRawInsertions).reduce(
        (exposedAcc, [key, value]) => {
          if (isSource(value)) {
            return exposedAcc;
          }

          if (
            typeof value === 'function' &&
            !isSignal(value) &&
            !isNonYieldableInsertionMethod(value)
          ) {
            const methodInjector = ɵcreateHostTaggedInjector(
              injector,
              `method:${key}`,
            );
            const wrappedFn = runInInjectionContext(methodInjector, () =>
              injectFnWrapper()(value as (...args: unknown[]) => unknown),
            );
            exposedAcc[key] = createYieldableInsertionMethod(wrappedFn, {
              injector: methodInjector,
              invalidYieldErrorMessage:
                INJECT_SERVICE_INSERTION_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage:
                INJECT_SERVICE_INSERTION_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage:
                INJECT_SERVICE_INSERTION_APP_START_ERROR_MESSAGE,
            });
          } else {
            exposedAcc[key] = value;
          }
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

function createInsertionContext({
  allPublic,
  insertions,
}: {
  allPublic: InjectService2Public<unknown>;
  insertions: Record<string, unknown>;
}) {
  return new Proxy({} as Record<PropertyKey, unknown>, {
    get: (_target, propertyKey) => {
      if (propertyKey === 'insertions') {
        return insertions;
      }

      return (allPublic as Record<PropertyKey, unknown>)[propertyKey];
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
