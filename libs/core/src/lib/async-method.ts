import {
  computed,
  effect,
  isSignal,
  resource,
  ResourceLoaderParams,
  ResourceOptions,
  ResourceStreamingLoader,
  signal,
  WritableSignal,
} from '@angular/core';
import { InsertionsResourcesFactory } from './query.core';
import { AsyncMethodRef } from './craft-async-methods';
import { ReadonlySource } from './util/source.type';
import { resourceById, ResourceByIdRef } from './resource-by-id';
import { isSource } from './util/util';

type AsyncMethodConfig<
  ResourceState,
  Params,
  ParamsArgs,
  SourceParams,
  GroupIdentifier
> =
  | Omit<ResourceOptions<NoInfer<ResourceState>, Params>, 'params' | 'loader'> &
      (
        | {
            /**
             * Used to generate a method in the store, when called will trigger the resource loader/stream.
             *
             * Only support one parameter which can be an object to pass multiple parameters.
             */
            method:
              | ((args: ParamsArgs) => Params)
              | ReadonlySource<SourceParams>;
            /**
             * A unique identifier for the resource, derived from the params.
             * It should be a string that uniquely identifies the resource based on the params.
             */
            identifier?: (
              params: NoInfer<NonNullable<Params>>
            ) => GroupIdentifier;
            loader: (
              param: ResourceLoaderParams<
                NonNullable<
                  [unknown] extends [Params]
                    ? NoInfer<SourceParams>
                    : NoInfer<Params>
                >
              >
            ) => Promise<ResourceState>;
            stream?: never;
            preservePreviousValue?: () => boolean;
          }
        | {
            method:
              | ((args: ParamsArgs) => Params)
              | ReadonlySource<SourceParams>;
            loader?: never;
            identifier?: (
              params: NoInfer<NonNullable<Params>>
            ) => GroupIdentifier;
            /**
             * Loading function which returns a `Promise` of a signal of the resource's value for a given
             * request, which can change over time as new values are received from a stream.
             */
            stream: ResourceStreamingLoader<
              ResourceState,
              ResourceLoaderParams<
                NonNullable<
                  [unknown] extends [Params]
                    ? NoInfer<SourceParams>
                    : NoInfer<Params>
                >
              >
            >;
            preservePreviousValue?: () => boolean;
          }
      );

export type AsyncMethodOutput<
  State extends object | undefined,
  Params,
  ArgParams,
  SourceParams,
  GroupIdentifier,
  Insertions
> = AsyncMethodRef<
  State,
  ArgParams,
  Params,
  Insertions,
  [unknown] extends [ArgParams] ? false : true, // ! force to method to have one arg minimum, we can not compare SourceParams type, because it also infer Params
  SourceParams,
  GroupIdentifier
>;

export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  {}
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion3,
    Insertion1 & Insertion2
  >
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
  insertion7: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
  >
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  ...insertions: any[]
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  {}
> {
  const asyncmethodResourceParamsFnSignal = signal<
    AsyncMethodParams | undefined
  >(undefined);

  const isConnectedToSource = isSource(asyncMethodConfig.method);

  const isUsingIdentifier = 'identifier' in asyncMethodConfig;

  const resourceParamsSrc = isConnectedToSource
    ? asyncMethodConfig.method
    : asyncmethodResourceParamsFnSignal;

  const resourceTarget = isUsingIdentifier
    ? resourceById<
        AsyncMethodState,
        AsyncMethodParams,
        GroupIdentifier & string,
        string,
        unknown,
        unknown
      >({
        ...asyncMethodConfig,
        params: resourceParamsSrc,
        identifier: asyncMethodConfig.identifier,
      } as any)
    : resource<AsyncMethodState, AsyncMethodParams>({
        ...asyncMethodConfig,
        params: resourceParamsSrc,
      } as ResourceOptions<any, any>);

  return Object.assign(
    resourceTarget,
    // byId is used to helps TS to correctly infer the resourceByGroup
    isUsingIdentifier
      ? {
          /**
           * Only added to help TS inference (TS cannot infer ResourceByIdHandler without erasing the signal getter, () => ResourceByIdRef<...>) )
           */
          _resourceById: resourceTarget as ResourceByIdRef<
            GroupIdentifier & string,
            AsyncMethodState,
            AsyncMethodParams
          >,
          select: (id: GroupIdentifier) => {
            return computed(() => {
              const list = (
                resourceTarget as ResourceByIdRef<
                  GroupIdentifier & string,
                  AsyncMethodState,
                  AsyncMethodParams
                >
              )();
              //@ts-expect-error GroupIdentifier & string is not recognized correctly
              return list[id];
            })();
          },
        }
      : {},
    {
      method: isSignal(asyncMethodConfig.method)
        ? undefined
        : (arg: AsyncMethodArgsParams) => {
            const result = asyncMethodConfig.method(arg);
            if (isUsingIdentifier) {
              const id = asyncMethodConfig.identifier?.(arg as any);
              (
                resourceTarget as ResourceByIdRef<
                  GroupIdentifier & string,
                  AsyncMethodState,
                  AsyncMethodParams
                >
              ).addById(id as GroupIdentifier & string);
            }
            asyncmethodResourceParamsFnSignal.set(result as AsyncMethodParams);
            return result;
          },
    },
    (
      insertions as InsertionsResourcesFactory<
        NoInfer<GroupIdentifier>,
        NoInfer<AsyncMethodState>,
        NoInfer<AsyncMethodParams>,
        {}
      >[]
    )?.reduce((acc, insert) => {
      return {
        ...acc,
        ...insert({
          ...(isUsingIdentifier
            ? { resourceById: resourceTarget }
            : { resource: resourceTarget }),
          resourceParamsSrc: resourceParamsSrc as WritableSignal<
            NoInfer<AsyncMethodParams>
          >,
          insertions: acc as {},
        } as any),
      };
    }, {} as Record<string, unknown>)
  ) as unknown as AsyncMethodOutput<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier,
    {}
  >;
}
