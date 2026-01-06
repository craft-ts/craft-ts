import { WritableSignal } from '@angular/core';
import {
  ContextConstraints,
  EmptyContext,
  CraftFactoryUtility,
  StoreConfigConstraints,
  partialContext,
  CloudProxySource,
} from './craft';
import { Prettify } from './util/util.type';
import { FlatRecord, STORE_CONFIG_TOKEN } from './util/util.type';
import { capitalize } from './util/util';

type InferQueryParamsState<T> = T extends WritableSignal<infer U> ? U : never;

type SpecificCraftSetAllQueriesParamsStandaloneOutputs<
  Context extends ContextConstraints
> = {
  [K in `setAll${Capitalize<
    (typeof STORE_CONFIG_TOKEN)['NAME']
  >}QueryParams`]: <
    AllQueriesParamsState extends {
      [K in keyof Context['_queryParams']]: 'state' extends keyof Context['_queryParams'][K]
        ? InferQueryParamsState<Context['_queryParams'][K]['state']>
        : 'STORE_CONFIG_ERROR: When using craftSetAllQueriesParamsStandalone, each query param configuration must define a state';
    }
  >(
    params: Prettify<AllQueriesParamsState>
  ) => {
    [K in keyof FlatRecord<AllQueriesParamsState>]: string;
  };
};

type CraftSetAllQueriesParamsStandaloneOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  EmptyContext,
  SpecificCraftSetAllQueriesParamsStandaloneOutputs<Context>
>;

/**
 * Order matters: this function must be declared after `craftQueryParams` to ensure types are properly inferred.
 */
export function craftSetAllQueriesParamsStandalone<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints
>(): CraftSetAllQueriesParamsStandaloneOutputs<Context, StoreConfig> {
  return (_cloudProxy: CloudProxySource, storeConfig) => {
    return Object.assign(() => partialContext({}), {
      [`setAll${capitalize(storeConfig.name)}QueryParams`]: (allQueryParams: {
        [queryParamsName: string]: unknown;
      }) => {
        const { flatParams, queryStringParts } = Object.entries(
          allQueryParams
        ).reduce(
          (acc, [queryParamsName, params]) => {
            console.log(`Setting query params for ${queryParamsName}:`, params);
            const queryParams = (
              _cloudProxy[
                `set${capitalize(queryParamsName)}QueryParams`
              ] as Function
            )(params as Record<string, unknown>);
            Object.entries(queryParams).forEach(([key, value]) => {
              acc.flatParams[key] = value;
            });
            // Keep the string representation for later
            acc.queryStringParts.push(
              // If queryParams is already something like URLSearchParams-like:
              queryParams.toString()
            );

            return acc;
          },
          {
            flatParams: {} as Record<string, unknown>,
            queryStringParts: [] as string[],
          }
        );

        // Define toString only once, after the reduce
        const result = Object.defineProperty(flatParams, 'toString', {
          value() {
            // Join all partial query strings with "&"
            return queryStringParts
              .filter((part) => part && part.length > 0)
              .join('&');
          },
          enumerable: false,
          configurable: true,
          writable: true,
        });

        return result;
      },
    });
  };
}
