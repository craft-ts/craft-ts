import {
  inject,
  signal,
  ResourceOptions,
  effect,
  untracked,
  Injector,
  InjectionToken,
  WritableSignal,
  computed,
  Signal,
} from './host/craft-compat';
import { craftLinkedSignal as linkedSignal } from './host/craft-linked-signal';
import { preservedResource } from './preserved-resource';
import { Prettify } from './util/util.type';
import { CraftResourceRef } from './util/craft-resource-ref';
import {
  resourceByIdChangesTracker,
  resourceByIdChangesTrackerResult,
} from './util/resource-by-id-changes-tracker.util';

export type ResourceByIdHandler<
  GroupIdentifier extends string,
  State,
  ResourceParams,
> = {
  /**
   * Reset all the CraftResourceRef instance stored in the ResourceByIdRef
   */
  reset: () => void;
  /**
   * Reset the CraftResourceRef instance associated with the provided id
   */
  resetResource: (id: GroupIdentifier) => void;
  /**
   * Add a new CraftResourceRef instance
   */
  add: (
    // todo pass params instead of id and create the id from the params using the identifier function
    params: ResourceParams,
    options?: {
      defaultValue?: State;
    },
  ) => CraftResourceRef<State, ResourceParams>;
  /**
   * ! The added resource may not load immediately if the global params do not match the identifier function.
   * Useful at the app initialization when the resource value is retrieved from a persister for example.
   */
  addById: (
    id: GroupIdentifier,
    options?: {
      defaultParam?: ResourceParams;
      defaultValue?: State;
      paramsFromResourceById?: CraftResourceRef<unknown, unknown>;
    },
  ) => CraftResourceRef<State, ResourceParams>;
  /**
   * Set the values of multiple resources. If a resource doesn't exist, it will be created.
   */
  set: (payload: Partial<Record<GroupIdentifier, State>>) => void;
  /**
   * Update values of multiple resources without removing existing ones.
   * If a resource doesn't exist, it will be created.
   */
  update: (
    payload: (
      state: Partial<Record<GroupIdentifier, State>>,
    ) => Partial<Record<GroupIdentifier, State>>,
  ) => void;
  /**
   * Tracks the status and value changes of resources.
   * Provides signals for hasChange, ids, resolved, loading, reloading, error, and onlyValueChange.
   */
  changes: resourceByIdChangesTrackerResult<GroupIdentifier>;
  /**
   * A computed signal that returns a record of all resource states by their group identifier.
   */
  state: Signal<Partial<Record<GroupIdentifier, State>>>;
};

export type Identifier<ResourceParams, GroupIdentifier> = (
  request: NonNullable<ResourceParams>,
) => GroupIdentifier;

export type ResourceByIdRef<
  GroupIdentifier extends string,
  State,
  ResourceParams,
> = Signal<
  // expose a signal instead of a writableSignal to avoid typing conflicts
  Prettify<
    Partial<Record<GroupIdentifier, CraftResourceRef<State, ResourceParams>>>
  >
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
> = Omit<ResourceOptions<State, ResourceParams>, 'params'> & {
  /** @internal Shared source name used by the server policy gate. */
  ssrSourceName?: string;
} & (
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
          entity: CraftResourceRef<
            NoInfer<FromObjectState>,
            NoInfer<FromObjectResourceParams>
          >,
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
  const { identifier, params, loader, stream, equalParams, ssrSourceName } =
    config;
  const fromResourceById =
    'fromResourceById' in config ? config.fromResourceById : undefined;

  // maybe create a linkedSignal to enable to reset
  const resourceByGroup = signal<
    Partial<Record<GroupIdentifier, CraftResourceRef<State, ResourceParams>>>
  >({});
  const linkedParamsByGroup = new Map<GroupIdentifier, { destroy(): void }>();
  const rememberLinkedParams = (
    group: GroupIdentifier,
    linked: { destroy(): void },
  ): void => {
    linkedParamsByGroup.get(group)?.destroy();
    linkedParamsByGroup.set(group, linked);
  };
  const destroyLinkedParams = (group: GroupIdentifier): void => {
    linkedParamsByGroup.get(group)?.destroy();
    linkedParamsByGroup.delete(group);
  };
  const destroyAllLinkedParams = (): void => {
    linkedParamsByGroup.forEach((linked) => linked.destroy());
    linkedParamsByGroup.clear();
  };

  const resourceEqualParams =
    equalParams === 'useIdentifier'
      ? (a: NonNullable<ResourceParams>, b: NonNullable<ResourceParams>) =>
          a && b && identifier(a) === identifier(b)
      : equalParams;

  // this effect is used to create a mapped CraftResourceRef instance
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
      const groupCraftResourceRefExist = resourceByGroupValue[group];
      if (groupCraftResourceRefExist) {
        // nothing to do, the resource is already bind with the request
        return;
      }

      const filteredRequestByGroup = linkedSignal({
        source: params as () => ResourceParams,
        injector,
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
      rememberLinkedParams(group, filteredRequestByGroup);

      const paramsWithEqualRule = computed(() => filteredRequestByGroup(), {
        ...(equalParams !== 'default' && {
          equal: resourceEqualParams as (
            a: ReturnType<typeof filteredRequestByGroup>,
            b: ReturnType<typeof filteredRequestByGroup>,
          ) => boolean,
        }),
      });

      const CraftResourceRef = createDynamicResource(injector, {
        group,
        resourceOptions: {
          loader,
          params: paramsWithEqualRule as () => ResourceParams,
          stream,
          ssrSourceName,
        },
      });

      // attach a new instance of CraftResourceRef to the resourceByGroup
      resourceByGroup.update((state) => ({
        ...state,
        [group]: CraftResourceRef,
      }));
    });
  }

  const changesTracker = resourceByIdChangesTracker(resourceByGroup);

  const stateSignal = computed(() => {
    const resources = resourceByGroup();
    const stateRecord: Partial<Record<GroupIdentifier, State>> = {};
    for (const [key, resource] of Object.entries(resources)) {
      if (resource) {
        const craftResource = resource as CraftResourceRef<
          State,
          ResourceParams
        >;
        if (craftResource.hasValue()) {
          stateRecord[key as GroupIdentifier] = craftResource.value();
        }
      }
    }
    return stateRecord;
  });

  const resourcesHandler: ResourceByIdHandler<
    GroupIdentifier,
    State,
    ResourceParams
  > = {
    changes: changesTracker,
    state: stateSignal,
    reset: () => {
      destroyAllLinkedParams();
      Object.values(resourceByGroup()).forEach((resource) =>
        (resource as CraftResourceRef<State, ResourceParams>).destroy(),
      );
      resourceByGroup.set({});
    },
    resetResource: (id: GroupIdentifier) => {
      destroyLinkedParams(id);
      resourceByGroup.update((state) => {
        const newState = { ...state };
        newState[id]?.destroy();
        delete newState[id];
        return newState;
      });
    },
    set: (payload: Partial<Record<GroupIdentifier, State>>) => {
      // Remove existing keys that are not in the payload
      const currentResources = resourceByGroup();
      Object.keys(currentResources).forEach((id) => {
        if (!(id in payload)) {
          resourcesHandler.resetResource(id as GroupIdentifier);
        }
      });

      // Set or create resources from the payload
      Object.entries(payload).forEach(([id, value]) => {
        const existingResource = resourceByGroup()[id as GroupIdentifier];
        if (existingResource) {
          existingResource.set(value as State);
        } else {
          // If the resource doesn't exist, create it with the provided value as default
          resourcesHandler.addById(id as GroupIdentifier, {
            defaultValue: value as State,
          });
        }
      });
    },
    update: (
      payload: (
        state: Partial<Record<GroupIdentifier, State>>,
      ) => Partial<Record<GroupIdentifier, State>>,
    ) => {
      const nextState = payload(stateSignal());
      resourcesHandler.set(nextState);
    },
    add: (resourceParams, options?: { defaultValue?: State }) => {
      const group = identifier(resourceParams as any);
      if (resourceByGroup()[group]) {
        return resourceByGroup()[group] as CraftResourceRef<
          State,
          ResourceParams
        >;
      }

      //@ts-expect-error ! It does not handle the case when fromResourceById is provided
      const computedParam = computed(() => params() ?? resourceParams);
      const filteredGlobalParamsByGroup = linkedSignal({
        source: computedParam as () => ResourceParams,
        injector,
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
      rememberLinkedParams(group, filteredGlobalParamsByGroup);
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
      const CraftResourceRef = createDynamicResource(injector, {
        group,
        resourceOptions: {
          loader,
          params: paramsWithEqualRule,
          stream,
          defaultValue: options?.defaultValue,
        } as ResourceOptions<State, ResourceParams>,
      });
      resourceByGroup.update((state) => ({
        ...state,
        [group]: CraftResourceRef,
      }));
      return CraftResourceRef;
    },
    addById: (
      group,
      options?: {
        defaultValue?: State;
        defaultParam?: ResourceParams;
        paramsFromResourceById?: CraftResourceRef<unknown, unknown>;
      },
    ) => {
      // Check if the resource already exist
      const existing = resourceByGroup()[group];
      if (existing) {
        // A global params watch may have created this entry just before a
        // persister restores its cached value. Apply that value to the
        // existing ref as well; otherwise the restore is silently discarded
        // and the in-flight request wins with a loading status.
        if (options?.defaultValue !== undefined && !existing.hasValue()) {
          existing.set(options.defaultValue);
        }
        return existing as CraftResourceRef<State, ResourceParams>;
      }
      const filteredGlobalParamsByGroup = linkedSignal({
        source: () =>
          params(
            options?.paramsFromResourceById as CraftResourceRef<
              FromObjectState,
              FromObjectResourceParams
            >,
          ),
        injector,
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
      rememberLinkedParams(group, filteredGlobalParamsByGroup);

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
      const CraftResourceRef = createDynamicResource(injector, {
        group,
        resourceOptions: {
          loader,
          params: paramsWithEqualRule,
          stream,
          defaultValue: options?.defaultValue,
        } as ResourceOptions<State, ResourceParams>,
      });
      if (options?.defaultValue !== undefined) {
        CraftResourceRef.set(options.defaultValue);
      }
      resourceByGroup.update((state) => ({
        ...state,
        [group]: CraftResourceRef,
      }));
      return CraftResourceRef;
    },
  };

  if (!fromResourceById) {
    return Object.assign(resourceByGroup.asReadonly(), resourcesHandler);
  }

  effect(() => {
    const fromResourceByIdValue = fromResourceById?.();
    if (!fromResourceByIdValue) {
      return;
    }
    const resourceByGroupValue = resourceByGroup();
    Object.entries(fromResourceByIdValue).forEach(([key, resource]) => {
      const currentParams = params(
        resource as CraftResourceRef<FromObjectState, FromObjectResourceParams>,
      );
      if (!currentParams) {
        return;
      }

      untracked(() => {
        const group = identifier(currentParams as any);
        const existingCraftResourceRef = resourceByGroupValue[group];
        if (existingCraftResourceRef) {
          return;
        }
        resourcesHandler.addById(group, {
          paramsFromResourceById: resource as CraftResourceRef<
            FromObjectState,
            FromObjectResourceParams
          >,
        });
      });
    });
  });

  return Object.assign(resourceByGroup.asReadonly(), resourcesHandler);
}

const RESOURCE_INSTANCE_TOKEN = new InjectionToken<
  CraftResourceRef<unknown, unknown>
>(
  'Injection token used to provide a dynamically created CraftResourceRef instance.',
);

interface DynamicResourceConfig<T, R, GroupIdentifier extends string> {
  resourceOptions: ResourceOptions<T, R> & { ssrSourceName?: string };
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

  const CraftResourceRef = injector.get(RESOURCE_INSTANCE_TOKEN);
  return CraftResourceRef as CraftResourceRef<T, R>;
}
