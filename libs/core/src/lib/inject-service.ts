import {
  assertInInjectionContext,
  inject,
  isSignal,
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
    ? PreviousInsertions
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
  FilterSource<Insertions>
>;

export function injectService2<Service, Insertion1>(
  token: Type<Service>,
  insertion1: InjectService2InsertionFactory<Service, Insertion1>,
): InjectService2Output<Service, Insertion1>;
export function injectService2<Service, Insertion1, Insertion2>(
  token: Type<Service>,
  insertion1: InjectService2InsertionFactory<Service, Insertion1>,
  insertion2: InjectService2InsertionFactory<Service, Insertion2, Insertion1>,
): InjectService2Output<Service, Insertion1 & Insertion2>;
export function injectService2<Service, Insertion1, Insertion2, Insertion3>(
  token: Type<Service>,
  insertion1: InjectService2InsertionFactory<Service, Insertion1>,
  insertion2: InjectService2InsertionFactory<Service, Insertion2, Insertion1>,
  insertion3: InjectService2InsertionFactory<
    Service,
    Insertion3,
    Insertion1 & Insertion2
  >,
): InjectService2Output<Service, Insertion1 & Insertion2 & Insertion3>;
export function injectService2<
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
export function injectService2<
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
 * Alternative API to expose or bind service public entries through insertions.
 *
 * Nothing is exposed by default. The callback receives all public service entries
 * and must explicitly return what should be exposed. Returned bindings targeting
 * public connectable entries are applied but hidden from the final result.
 */
export function injectService2<Service>(args: any): any {
  assertInInjectionContext(injectService2);

  const [token, ...insertions] = args as [
    Type<unknown>,
    ...((
      context: InjectService2InsertionContext<unknown, Record<string, unknown>>,
    ) => Record<string, unknown>)[],
  ];

  const service = inject(token);
  const allPublic = createPublicServiceApi(
    service,
  ) as InjectService2Public<Service>;
  const outputs = insertions.reduce(
    (acc, insertion) => {
      const nextRawInsertions =
        insertion(
          createInsertionContext({
            allPublic,
            insertions: acc.rawInsertionsOutput,
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
