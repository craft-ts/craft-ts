import { localStoragePersister } from './local-storage-persister';
import {
  InsertionByIdParams,
  InsertionResourceFactoryContext,
  InsertionParams,
  InsertionStateFactoryContext,
} from './query.core';
import { ResourceByIdRef } from './resource-by-id';
import { ResourceRef } from '@angular/core';

/**
 * Creates an insertion function that persists resource or state data to localStorage with automatic cache management.
 *
 * This insertion enables automatic persistence and restoration of data across browser sessions, providing:
 * - Automatic saving of query/mutation/state data to localStorage
 * - Restoration of cached data when the application loads
 * - Cache expiration with configurable time-to-live (TTL)
 * - Automatic garbage collection of expired cache entries
 * - Support for both single resources and resources grouped by identifier
 * - Optional waiting for params to stabilize before persisting
 *
 * @remarks
 * **Use Cases:**
 * - **Offline-first applications**: Keep data available when the user goes offline
 * - **Performance optimization**: Show cached data instantly while fetching fresh data
 * - **User experience**: Preserve user's view state across page refreshes
 * - **Reduce server load**: Serve data from cache when it's still fresh
 *
 * **Cache Management:**
 * - Data is stored with a timestamp in localStorage
 * - Expired entries are automatically removed during garbage collection
 * - Each store maintains its own namespace to avoid key collisions
 * - Supports both primitive and complex object serialization
 *
 * **Compatibility:**
 * Works with: `query()`, `mutation()`, `AsyncProcess()`, and `state()`
 *
 * @template GroupIdentifier - The type of identifier for grouped resources (string)
 * @template ResourceState - The type of the resource state (object or undefined)
 * @template ResourceParams - The type of the resource parameters
 * @template PreviousInsertionsOutputs - The accumulated outputs from previous insertions
 * @template StateType - The type of the state (for state() usage)
 * @template CacheTime - The cache time in milliseconds (defaults to 300000 = 5 minutes)
 *
 * @param config - Configuration object:
 *   - `storeName`: Prefix for localStorage keys to namespace this store
 *   - `key`: Specific key to identify this data within the store
 *   - `waitForParamsSrcToBeEqualToPreviousValue` (optional): If true, waits for params to stabilize before persisting.
 *     Useful when params can be undefined initially. Default: true
 *   - `cacheTime` (optional): Time in milliseconds before cached data is considered stale. Default: 300000 (5 minutes)
 *
 * @returns An insertion function that adds a `persister` property to the resource/state, enabling manual control if needed
 *
 * @example
 * Basic query with localStorage persistence
 * ```ts
 * const userQuery = query(
 *   {
 *     params: () => ({ userId: currentUserId() }),
 *     loader: async ({ params }) => {
 *       const response = await fetch(`/api/users/${params.userId}`);
 *       return response.json();
 *     },
 *   },
 *   insertLocalStoragePersister({
 *     storeName: 'myApp',
 *     key: 'currentUser',
 *     cacheTime: 600000, // 10 minutes
 *   })
 * );
 *
 * // On first load, data is fetched from server and cached
 * // On subsequent loads, cached data is shown immediately while fresh data loads in background
 * console.log(userQuery.value()); // Cached data available instantly
 * ```
 *
 * @example
 * Query with identifier for multiple cached instances
 * ```ts
 * const postsQuery = query(
 *   {
 *     params: () => currentPostId(),
 *     identifier: (postId) => postId,
 *     loader: async ({ params }) => {
 *       const response = await fetch(`/api/posts/${params}`);
 *       return response.json();
 *     },
 *   },
 *   insertLocalStoragePersister({
 *     storeName: 'blogApp',
 *     key: 'posts',
 *     cacheTime: 900000, // 15 minutes
 *   })
 * );
 *
 * // Each post is cached individually by its identifier
 * // Cache keys: blogApp:posts:post-123, blogApp:posts:post-456, etc.
 * const post1 = postsQuery.select('post-123');
 * const post2 = postsQuery.select('post-456');
 * ```
 *
 * @example
 * Mutation with persistence for optimistic updates
 * ```ts
 * const updateSettingsMutation = mutation(
 *   {
 *     method: (settings: UserSettings) => settings,
 *     loader: async ({ params }) => {
 *       const response = await fetch('/api/settings', {
 *         method: 'PATCH',
 *         body: JSON.stringify(params),
 *       });
 *       return response.json();
 *     },
 *   },
 *   insertLocalStoragePersister({
 *     storeName: 'myApp',
 *     key: 'userSettings',
 *     cacheTime: 86400000, // 24 hours
 *   })
 * );
 *
 * // Settings are persisted across sessions
 * // User's preferences survive page refreshes and browser restarts
 * ```
 *
 * @example
 * State persistence for UI preferences
 * ```ts
 * const themeState = state(
 *   { mode: 'light', fontSize: 14 } as const,
 *   insertLocalStoragePersister({
 *     storeName: 'myApp',
 *     key: 'theme',
 *     cacheTime: Number.POSITIVE_INFINITY, // Never expire
 *   })
 * );
 *
 * // Theme preferences are automatically saved and restored
 * themeState.set({ mode: 'dark', fontSize: 16 });
 * // On next visit, the dark theme is automatically applied
 * ```
 *
 * @example
 * Short-lived cache for frequently changing data
 * ```ts
 * const searchResultsQuery = query(
 *   {
 *     params: () => ({ query: searchTerm() }),
 *     loader: async ({ params }) => {
 *       const response = await fetch(`/api/search?q=${params.query}`);
 *       return response.json();
 *     },
 *   },
 *   insertLocalStoragePersister({
 *     storeName: 'searchApp',
 *     key: 'results',
 *     cacheTime: 60000, // 1 minute - short cache for fresh results
 *   })
 * );
 *
 * // Search results are cached briefly to improve UX during navigation
 * // Old results are quickly expired to avoid showing stale data
 * ```
 *
 * @example
 * Waiting for params to stabilize
 * ```ts
 * const userIdSignal = signal<string | undefined>(undefined);
 *
 * const userQuery = query(
 *   {
 *     params: () => userIdSignal(),
 *     loader: async ({ params }) => {
 *       if (!params) return undefined;
 *       const response = await fetch(`/api/users/${params}`);
 *       return response.json();
 *     },
 *   },
 *   insertLocalStoragePersister({
 *     storeName: 'myApp',
 *     key: 'user',
 *     waitForParamsSrcToBeEqualToPreviousValue: true, // Wait for userId to be set
 *   })
 * );
 *
 * // Persistence waits until userIdSignal has a stable value
 * // Prevents caching with undefined params
 * setTimeout(() => userIdSignal.set('user-123'), 100);
 * ```
 *
 * @example
 * Manual cache control via persister
 * ```ts
 * const dataQuery = query(
 *   {
 *     params: () => ({}),
 *     loader: async () => {
 *       const response = await fetch('/api/data');
 *       return response.json();
 *     },
 *   },
 *   insertLocalStoragePersister({
 *     storeName: 'myApp',
 *     key: 'data',
 *   })
 * );
 *
 * // Access the persister for manual control
 * // Clear this specific cache entry
 * dataQuery.persister.clearCache('data');
 *
 * // Clear all cache entries for this store
 * dataQuery.persister.clearAllCache();
 *
 * // Manually trigger garbage collection
 * dataQuery.persister.runGarbageCollection();
 * ```
 */
export function insertLocalStoragePersister<
  GroupIdentifier extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  PreviousInsertionsOutputs,
  StateType,
  QueryExceptions,
  const CacheTime = 300000, // Default cache time in milliseconds (5 minutes)
>(config: {
  /** Name of your current store, it is mainly used as a prefix for localStorage keys */
  storeName: string;
  /** Key used to identify the specific data within the store */
  key: string;
  /** Whether to wait for the params source to be equal to its previous value before persisting.
   * Mainly useful when params can be undefined at the beginning. (And for single resource).
   * Default is true.
   */
  waitForParamsSrcToBeEqualToPreviousValue?: boolean;
  /**
   * Default cache time in milliseconds.
   * This is the time after which the cached data will be considered stale and eligible for garbage collection.
   * If not specified, the default is 5 minutes (300000 ms).
   */
  cacheTime?: CacheTime;
}) {
  return (
    context:
      | InsertionResourceFactoryContext<
          GroupIdentifier,
          ResourceState,
          ResourceParams,
          QueryExceptions,
          PreviousInsertionsOutputs
        >
      | InsertionStateFactoryContext<StateType, PreviousInsertionsOutputs>,
  ) => {
    type ResourceByIdContext = InsertionByIdParams<
      GroupIdentifier,
      ResourceState,
      ResourceParams,
      PreviousInsertionsOutputs
    >;
    type ResourceContext = InsertionParams<
      ResourceState,
      ResourceParams,
      QueryExceptions,
      PreviousInsertionsOutputs
    >;
    const persister = localStoragePersister(config.storeName);
    const hasResourceById = 'resourceById' in context;
    const hasState = 'state' in context && !('resource' in context);
    const isUsingIdentifier =
      hasResourceById ||
      ('identifier' in context &&
        typeof (context as unknown as ResourceByIdContext).identifier ===
          'function');
    const stateContext = hasState
      ? (context as InsertionStateFactoryContext<
          StateType,
          PreviousInsertionsOutputs
        >)
      : undefined;
    const resourceTarget = hasResourceById
      ? context.resourceById
      : hasState
        ? ({
            status: () => 'local',
            value: () => stateContext!.state(),
            set: (value: unknown) => stateContext!.set(value as StateType),
          } as unknown as ResourceRef<unknown>)
        : (context as unknown as ResourceContext).resource;
    const resourceParamsSrc: () => unknown = hasState
      ? () => undefined
      : (context as unknown as ResourceByIdContext | ResourceContext)
          .resourceParamsSrc;

    if (isUsingIdentifier) {
      persister.addQueryByIdToPersist({
        key: config.key,
        cacheTime: (config?.cacheTime as number | undefined) ?? 300000,
        queryByIdResource: resourceTarget as unknown as ResourceByIdRef<
          string,
          unknown,
          unknown
        >,
        queryResourceParamsSrc: resourceParamsSrc as any,
      });
    } else {
      persister.addQueryToPersist({
        key: config.key,
        cacheTime: (config?.cacheTime as number | undefined) ?? 300000,
        queryResource: resourceTarget as unknown as ResourceRef<unknown>,
        queryResourceParamsSrc: resourceParamsSrc as any,
        waitForParamsSrcToBeEqualToPreviousValue: hasState
          ? false
          : (config.waitForParamsSrcToBeEqualToPreviousValue ?? true),
      });
    }

    return {
      persister,
    };
  };
}
