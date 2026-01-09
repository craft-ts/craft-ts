import {
  inject,
  signal,
  ResourceOptions,
  ResourceRef,
  effect,
  untracked,
  Injector,
  InjectionToken,
  WritableSignal,
  computed,
  Signal,
  isSignal,
  linkedSignal,
} from '@angular/core';
import { preservedResource } from './preserved-resource';
import { Prettify } from './util/util.type';

export type ResourceByIdHandler<
  GroupIdentifier extends string,
  State,
  ResourceParams,
> = {
  /**
   * Reset all the ResourceRef instance stored in the ResourceByIdRef
   */
  reset: () => void;
  /**
   * Reset the ResourceRef instance associated with the provided id
   */
  resetResource: (id: GroupIdentifier) => void;
  /**
   * Add a new ResourceRef instance
   */
  add: (
    // todo pass params instead of id and create the id from the params using the identifier function
    params: ResourceParams,
    options?: {
      fallbackValue?: State;
    },
  ) => ResourceRef<State>;
  /**
   * ! The added resource may not load immediately if the global params do not match the identifier function.
   * Useful at the app initialization when the resource value is retrieved from a persister for example.
   */
  addById: (
    id: GroupIdentifier,
    options?: {
      defaultParam?: ResourceParams;
      fallbackValue?: State;
      paramsFromResourceById?: ResourceRef<unknown>;
    },
  ) => ResourceRef<State>;
};

export type Identifier<ResourceParams, GroupIdentifier> = (
  request: NonNullable<ResourceParams>,
) => GroupIdentifier;

export type ResourceByIdRef<
  GroupIdentifier extends string,
  State,
  ResourceParams,
> = WritableSignal<
  Prettify<Partial<Record<GroupIdentifier, ResourceRef<State>>>>
> &
  ResourceByIdHandler<GroupIdentifier, State, ResourceParams>;

export type EqualParams<ResourceParams, GroupIdentifier extends string> =
  | 'default'
  | 'useIdentifier'
  | ((
      a: ResourceParams,
      b: ResourceParams,
      identifierFn: (params: ResourceParams) => GroupIdentifier,
    ) => boolean);

type ResourceByIdConfig<
  State,
  ResourceParams,
  GroupIdentifier extends string,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
> = Omit<ResourceOptions<State, ResourceParams>, 'params'> &
  (
    | {
        fromResourceById?: never;
        params: () => ResourceParams;
        identifier: Identifier<NoInfer<ResourceParams>, GroupIdentifier>;
        equalParams?: EqualParams<ResourceParams, GroupIdentifier>;
      }
    | {
        /**
         * Use it, when you need to bind a ResourceByIdRef to another ResourceByIdRef.
         * It will kill the fromObject keys syncing when the fromObject resource change.
         */
        fromResourceById: ResourceByIdRef<
          FromObjectGroupIdentifier,
          FromObjectState,
          FromObjectResourceParams
        >;
        params: (
          entity: ResourceRef<NoInfer<FromObjectState>>,
        ) => ResourceParams;
        identifier: Identifier<NoInfer<ResourceParams>, GroupIdentifier>;
        equalParams?: EqualParams<ResourceParams, GroupIdentifier>;
      }
  );

export function resourceById<
  State,
  ResourceParams,
  GroupIdentifier extends string,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
>(
  config: ResourceByIdConfig<
    State,
    ResourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
): ResourceByIdRef<GroupIdentifier, State, ResourceParams> {
  const injector = inject(Injector);
  const { identifier, params, loader, stream, equalParams } = config;
  const fromResourceById =
    'fromResourceById' in config ? config.fromResourceById : undefined;

  // maybe create a linkedSignal to enable to reset
  const resourceByGroup = signal<
    Partial<Record<GroupIdentifier, ResourceRef<State>>>
  >({});

  const resourceEqualParams =
    equalParams === 'useIdentifier'
      ? (a: NonNullable<ResourceParams>, b: NonNullable<ResourceParams>) =>
          a && b && identifier(a) === identifier(b)
      : equalParams;

  // this effect is used to create a mapped ResourceRef instance
  if (!fromResourceById) {
    effect(() => {
      //@ts-expect-error TypeScript misinterpreting, params here has no parameter
      const requestValue = params();
      if (!requestValue) {
        return;
      }
      const group = identifier(requestValue);

      // The effect should only trigger when the request change
      const resourceByGroupValue = untracked(() => resourceByGroup());
      const groupResourceRefExist = resourceByGroupValue[group];
      if (groupResourceRefExist) {
        // nothing to do, the resource is already bind with the request
        return;
      }

      const filteredRequestByGroup = linkedSignal({
        source: params as () => ResourceParams,
        computation: (incomingRequestValue, previousGroupRequestData) => {
          if (!incomingRequestValue) {
            return incomingRequestValue;
          }
          // filter the request push a value by comparing with the current group
          if (identifier(incomingRequestValue) !== group) {
            return previousGroupRequestData?.value;
          }
          // The request push a value that concerns the current group
          return incomingRequestValue;
        },
      });

      //@ts-expect-error TypeScript misinterpreting
      const paramsWithEqualRule = computed(() => filteredRequestByGroup(), {
        ...(equalParams !== 'default' && { equal: resourceEqualParams }),
      });

      const resourceRef = createDynamicResource(injector, {
        group,
        //@ts-expect-error stream and loader conflict
        resourceOptions: {
          loader,
          params: paramsWithEqualRule,
          stream,
        },
      });

      // attach a new instance of ResourceRef to the resourceByGroup
      resourceByGroup.update((state) => ({
        ...state,
        [group]: resourceRef,
      }));
    });
  }

  const resourcesHandler: ResourceByIdHandler<
    GroupIdentifier,
    State,
    ResourceParams
  > = {
    reset: () => {
      Object.values(resourceByGroup()).forEach((resource) =>
        (resource as ResourceRef<State>).destroy(),
      );
      resourceByGroup.set({});
    },
    resetResource: (id: GroupIdentifier) => {
      resourceByGroup.update((state) => {
        const newState = { ...state };
        newState[id]?.destroy();
        delete newState[id];
        return newState;
      });
    },
    add: (resourceParams, options?: { fallbackValue?: State }) => {
      const group = identifier(resourceParams as any);
      if (resourceByGroup()[group]) {
        console.warn(
          `[resourceById] - A resource with the id ${group} already exist.`,
        );
        return resourceByGroup()[group] as ResourceRef<State>;
      }

      //@ts-expect-error ! It does not handle the case when fromResourceById is provided
      const computedParam = computed(() => params() ?? resourceParams);
      const filteredGlobalParamsByGroup = linkedSignal({
        source: computedParam as () => ResourceParams,
        computation: (incomingParamsValue, previousGroupParamsData) => {
          if (!incomingParamsValue) {
            return incomingParamsValue;
          }
          // filter the request push a value by comparing with the current group
          if (identifier(incomingParamsValue) !== group) {
            return (
              (previousGroupParamsData?.value as ResourceParams) ??
              resourceParams
            );
          }
          // The request push a value that concerns the current group
          return incomingParamsValue;
        },
      });
      // ! without pulling the signal here, it is not possible to load multiples resources in the same cycle
      const _pull_filteredGlobalParamsByGroup = filteredGlobalParamsByGroup();
      const paramsWithEqualRule = computed(
        filteredGlobalParamsByGroup as Signal<NonNullable<ResourceParams>>,
        //@ts-expect-error TypeScript misinterpreting
        {
          ...(equalParams !== 'default' && {
            equal: resourceEqualParams,
          }),
        },
      );
      const resourceRef = createDynamicResource(injector, {
        group,
        resourceOptions: {
          loader,
          params: paramsWithEqualRule,
          stream,
          fallbackValue: options?.fallbackValue,
        } as ResourceOptions<State, ResourceParams>,
      });
      resourceByGroup.update((state) => ({
        ...state,
        [group]: resourceRef,
      }));
      return resourceRef;
    },
    addById: (
      group,
      options?: {
        fallbackValue?: State;
        defaultParam?: ResourceParams;
        paramsFromResourceById?: ResourceRef<unknown>;
      },
    ) => {
      const filteredGlobalParamsByGroup = linkedSignal({
        source: () =>
          params(
            options?.paramsFromResourceById as ResourceRef<FromObjectState>,
          ),
        computation: (incomingParamsValue, previousGroupParamsData) => {
          if (!incomingParamsValue) {
            return incomingParamsValue ?? options?.defaultParam;
          }
          // filter the request push a value by comparing with the current group
          if (identifier(incomingParamsValue) !== group) {
            return (
              (previousGroupParamsData?.value as ResourceParams) ??
              options?.defaultParam
            );
          }
          // The request push a value that concerns the current group
          return incomingParamsValue;
        },
      });

      // ! without pulling the signal here, it is not possible to load multiples resources in the same cycle
      const _pull_filteredGlobalParamsByGroup = filteredGlobalParamsByGroup();
      const paramsWithEqualRule = computed(
        filteredGlobalParamsByGroup as Signal<NonNullable<ResourceParams>>,
        //@ts-expect-error TypeScript misinterpreting
        {
          ...(equalParams !== 'default' && {
            equal: resourceEqualParams,
          }),
        },
      );
      const resourceRef = createDynamicResource(injector, {
        group,
        resourceOptions: {
          loader,
          params: paramsWithEqualRule,
          stream,
          fallbackValue: options?.fallbackValue,
        } as ResourceOptions<State, ResourceParams>,
      });
      resourceByGroup.update((state) => ({
        ...state,
        [group]: resourceRef,
      }));
      return resourceRef;
    },
  };

  effect(() => {
    const fromResourceByIdValue = fromResourceById?.();
    if (!fromResourceByIdValue) {
      return;
    }
    const resourceByGroupValue = resourceByGroup();
    Object.entries(fromResourceByIdValue).forEach(([key, resource]) => {
      const currentParams = params(resource as ResourceRef<FromObjectState>);
      if (!currentParams) {
        return;
      }

      untracked(() => {
        const group = identifier(currentParams as any);
        const existingResourceRef = resourceByGroupValue[group];
        if (existingResourceRef) {
          return;
        }
        resourcesHandler.addById(group, {
          paramsFromResourceById: resource as ResourceRef<FromObjectState>,
        });
      });
    });
  });

  return Object.assign(resourceByGroup, resourcesHandler);
}

const RESOURCE_INSTANCE_TOKEN = new InjectionToken<ResourceRef<unknown>>(
  'Injection token used to provide a dynamically created ResourceRef instance.',
);

interface DynamicResourceConfig<T, R, GroupIdentifier extends string> {
  resourceOptions: ResourceOptions<T, R>;
  group: GroupIdentifier;
}

/**
 * It is not possible to instantiate a resource from within an effect directly:
 * NG0602: effect() cannot be called from within a reactive context.
 *
 * The workaround is to create a dynamic injection token using a factory function,
 * which instantiates the resource using the provided configuration.
 *
 * Maybe their is a better way to instantiate a resource dynamically.
 */
function createDynamicResource<T, R, GroupIdentifier extends string>(
  parentInjector: Injector,
  resourceConfig: DynamicResourceConfig<T, R, GroupIdentifier>,
) {
  const injector = Injector.create({
    providers: [
      {
        provide: RESOURCE_INSTANCE_TOKEN,
        useFactory: () => preservedResource(resourceConfig.resourceOptions),
      },
    ],
    parent: parentInjector,
  });

  const resourceRef = injector.get(RESOURCE_INSTANCE_TOKEN);
  return resourceRef as ResourceRef<T>;
}
