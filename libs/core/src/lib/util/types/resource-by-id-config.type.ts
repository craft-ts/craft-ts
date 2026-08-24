import {
  ResourceLoaderParams,
  ResourceOptions,
  ResourceRef,
  ResourceStreamingLoader,
} from '../../host/craft-compat';
import { ResourceMethod } from './shared.type';
import { ResourceByIdRef } from '../../resource-by-id';

export type ResourceByIdConfig<
  ResourceState,
  Params,
  ParamsArgs,
  GroupIdentifier extends string,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams
> =
  | Omit<ResourceOptions<NoInfer<ResourceState>, Params>, 'params' | 'loader'> &
      (
        | {
            /**
             * A reactive function which determines the request to be made. Whenever the request changes, the
             * loader will be triggered to fetch a new value for the resource.
             *
             * If a request function isn't provided, the loader won't rerun unless the resource is reloaded.
             */
            params: () => Params;
            loader: (
              param: NoInfer<ResourceLoaderParams<Params>>
            ) => Promise<ResourceState>;
            method?: never;
            fromResourceById?: never;
            stream?: never;
            /**
             * Each the query load, the value will return undefined.
             * To avoid flickering display and also enable to the data to be retrieved from cache, use () => true
             * default value: false
             */
            preservePreviousValue?: () => boolean;
          }
        | {
            /**
             * Used to generate a method in the store, when called will trigger the resource loader/stream.
             *
             * Only support one parameter which can be an object to pass multiple parameters.
             */
            method: (args: ParamsArgs) => Params;
            loader: (
              param: NoInfer<ResourceLoaderParams<Params>>
            ) => Promise<ResourceState>;
            params?: never;
            fromResourceById?: never;
            stream?: never;
            preservePreviousValue?: () => boolean;
          }
        | {
            method?: never;
            loader?: never;
            params?: () => Params;
            fromResourceById?: never;
            /**
             * Loading function which returns a `Promise` of a signal of the resource's value for a given
             * request, which can change over time as new values are received from a stream.
             */
            stream: ResourceStreamingLoader<ResourceState, Params>;
            preservePreviousValue?: () => boolean;
          }
        | {
            method: ResourceMethod<ParamsArgs, Params>;
            loader?: never;
            params?: never;
            fromResourceById?: never;
            /**
             * Loading function which returns a `Promise` of a signal of the resource's value for a given
             * request, which can change over time as new values are received from a stream.
             */
            stream: ResourceStreamingLoader<ResourceState, Params>;
            preservePreviousValue?: () => boolean;
          }
        | {
            /**
             * Use it, when you need to bind a ResourceByIdRef to another ResourceByIdRef.
             * It will enforce the fromObject keys syncing when the fromObject resource change.
             */
            fromResourceById: ResourceByIdRef<
              FromObjectGroupIdentifier,
              FromObjectState,
              FromObjectResourceParams
            >;
            /**
             * A reactive function which determines the request to be made. Whenever the request changes, the
             * loader will be triggered to fetch a new value for the resource.
             *
             * If a request function isn't provided, the loader won't rerun unless the resource is reloaded.
             */
            params: (entity: ResourceRef<NoInfer<FromObjectState>>) => Params;
            loader: (
              param: NoInfer<ResourceLoaderParams<Params>>
            ) => Promise<ResourceState>;
            method?: never;
            stream?: never;
            /**
             * Each the query load, the value will return undefined.
             * To avoid flickering display and also enable to the data to be retrieved from cache, use () => true
             * default value: false
             */
            preservePreviousValue?: () => boolean;
          }
        | {
            method?: never;
            loader?: never;
            params?: () => Params;
            fromResourceById?: never;
            /**
             * Loading function which returns a `Promise` of a signal of the resource's value for a given
             * request, which can change over time as new values are received from a stream.
             */
            stream: ResourceStreamingLoader<ResourceState, Params>;
            preservePreviousValue?: () => boolean;
          }
      ) & {
        /**
         * A unique identifier for the resource, derived from the params.
         * It should be a string that uniquely identifies the resource based on the params.
         */
        identifier: (params: NoInfer<NonNullable<Params>>) => GroupIdentifier;
        /**
         * Under the hood, a resource is generated for each new identifier generated when the params source change.
         *
         * If the source change, and their is an existing resource with the same identifier, it will be re-used.
         *
         * In this case, when the source is an object, an existing resource can be retrieved by the matching his record key with identifier function, but as the reference change it will trigger the loading of the resource again.
         *
         * To avoid this, you can use this option to tell how to compare the incoming params with the existing params of the resource.
         * - 'useIdentifier': will use the identifier function to compare the previous params and the incoming params. This very useful when using pagination.
         * - 'default' (default value): will use a strict equality check (===) between the previous params and the incoming params.
         * - (a: Params, b: Params) => boolean: you can provide your own comparison function to compare the previous params and the incoming params. This is useful when you want to compare specific fields of the params.
         *
         * Note: if your params is a primitive (string, number, boolean, etc.), you don't need to use this option since the strict equality check will work as expected.
         *
         * For **queries** the default value is 'useIdentifier'
         *
         * For **mutations** the default value is 'default'
         */
        equalParams?: Params extends object
          ?
              | 'default'
              | 'useIdentifier'
              | ((
                  a: Params,
                  b: Params,
                  identifierFn: (params: Params) => GroupIdentifier
                ) => boolean)
          : never;
      };
