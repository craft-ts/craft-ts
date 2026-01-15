import { MergeObject, MergeObjects } from './util/util.type';
import {
  ContextConstraints,
  CraftFactoryUtility,
  StoreConfigConstraints,
  PartialContext,
  craftFactoryEntries,
  partialContext,
} from './craft';
import { ResourceByIdRef } from './resource-by-id';
import { QueryOutput, QueryRef } from './query';

type SpecificCraftQueryOutputs<
  ResourceName extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  ResourceArgsParams,
  IsMethod,
  SourceParams,
  GroupIdentifier,
  InsertionsOutputs,
> = PartialContext<{
  props: {
    [key in `${ResourceName & string}`]: QueryOutput<
      ResourceState,
      ResourceArgsParams,
      ResourceParams,
      SourceParams,
      GroupIdentifier,
      InsertionsOutputs
    >;
  };
  _query: {
    [key in ResourceName & string]: QueryOutput<
      ResourceState,
      ResourceArgsParams,
      ResourceParams,
      SourceParams,
      GroupIdentifier,
      InsertionsOutputs
    >;
  };
}>;

type CraftQueryOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  ResourceName extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  ResourceArgsParams,
  IsMethod,
  SourceParams,
  GroupIdentifier,
  InsertionsOutputs,
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftQueryOutputs<
    ResourceName,
    ResourceState,
    ResourceParams,
    ResourceArgsParams,
    IsMethod,
    SourceParams,
    GroupIdentifier,
    InsertionsOutputs
  >
>;

type ContextQueryEntries<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  ResourceName extends string,
> = Context['_inputs'] &
  Context['_injections'] &
  Context['_sources'] &
  Omit<Context['props'], keyof Context['_mutation']> &
  Context['_asyncMethods'] &
  Context['_mutation'] & {
    INSERT_CONFIG: {
      storeName: StoreConfig['name'];
      key: NoInfer<ResourceName>;
    };
  };

/**
 * Creates a query definition for use within a craft store, enabling reactive data fetching with automatic state management.
 *
 * This function integrates a `query()` instance into a craft store by:
 * - Registering the query under a specific name in the store
 * - Providing automatic execution when params change
 * - Exposing query state signals (value, status, error, isLoading)
 * - Enabling reactive connections to mutations, sources, and other store entries
 * - Supporting insertions for extended functionality (optimistic updates, persistence, etc.)
 * - Providing type-safe access to query results and methods
 *
 * @remarks
 * **Use Cases:**
 * - **Server state management**: Fetch and cache data from APIs
 * - **Automatic refetching**: Re-fetch when params change reactively
 * - **Optimistic updates**: Update UI instantly while mutations execute
 * - **Cache synchronization**: Keep local cache in sync with server state after mutations
 * - **Data persistence**: Cache query results across sessions
 * - **Loading states**: Track and display loading/error states automatically
 *
 * **Context Access:**
 * The query factory receives full access to the craft context:
 * - Sources: React to user events and triggers
 * - Mutations: Coordinate with mutation state and results
 * - Other queries: Derive data from other queries
 * - Injections: Access Angular services and dependencies
 * - INSERT_CONFIG: Store name and query key for insertions
 *
 * **Reactive Patterns:**
 * - Use `insertReactOnMutation()` to synchronize with mutation results
 * - Bind to sources for manual refetch triggers
 * - Use with identifier for parallel query execution
 * - Combine with `preservePreviousValue` to prevent flickering
 *
 * **Store Integration:**
 * - Query accessible as: `store.queryName`
 * - Returns signals: `store.queryName.value()`, `store.queryName.status()`
 * - With identifier: `store.queryName.select(id)` for individual instances
 * - Custom insertions add methods: `store.queryName.customMethod()`
 *
 * @template Context - The craft store context type
 * @template StoreConfig - The craft store configuration type
 * @template ResourceName - The name of the query (must be a literal string)
 * @template ResourceState - The type of the query result data
 * @template ResourceParams - The type of the query parameters
 * @template ResourceArgsParams - The type of method arguments (for method-based queries)
 * @template InsertionsOutputs - The accumulated outputs from query insertions
 * @template IsMethod - Whether the query uses method-based triggering
 * @template SourceParams - The type of source params (for source-based queries)
 * @template GroupIdentifier - The identifier type (for queries with identifier)
 *
 * @param resourceName - The name under which this query will be registered in the store.
 *   Used to access the query: `store.resourceName`
 * @param queryFactory - Factory function that receives the craft context and returns a query() instance.
 *   Has access to all other craft entries (sources, mutations, queries, states) defined before it.
 *
 * @returns A craft factory utility that integrates the query into the store with:
 *   - `store.queryName`: The query instance with all its signals and methods
 *   - Full type safety for query state and operations
 *
 * @example
 * Basic query with automatic execution
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'UserStore', providedIn: 'root' },
 *   craftQuery('currentUser', () =>
 *     query({
 *       params: () => currentUserId(),
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/users/${params}`);
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Access query state
 * console.log(store.currentUser.status()); // 'loading'
 * console.log(store.currentUser.value()); // undefined initially
 *
 * // After loading completes
 * console.log(store.currentUser.status()); // 'resolved'
 * console.log(store.currentUser.value()); // { id: '123', name: 'John', ... }
 * console.log(store.currentUser.isLoading()); // false
 * console.log(store.currentUser.hasValue()); // true
 * ```
 *
 * @example
 * Query with optimistic updates from mutations
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'TodoStore', providedIn: 'root' },
 *   craftMutations(() => ({
 *     updateTodo: mutation({
 *       method: (todo: Todo) => todo,
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/todos/${params.id}`, {
 *           method: 'PATCH',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     }),
 *   })),
 *   craftQuery('todos', ({ updateTodo }) =>
 *     query(
 *       {
 *         params: () => ({}),
 *         loader: async () => {
 *           const response = await fetch('/api/todos');
 *           return response.json();
 *         },
 *       },
 *       insertReactOnMutation(updateTodo, {
 *         // Update UI instantly while mutation is loading
 *         optimisticUpdate: ({ queryResource, mutationParams }) => {
 *           const todos = queryResource.value() ?? [];
 *           return todos.map(todo =>
 *             todo.id === mutationParams.id ? mutationParams : todo
 *           );
 *         },
 *         // Confirm update when mutation resolves
 *         update: ({ queryResource, mutationParams }) => {
 *           const todos = queryResource.value() ?? [];
 *           return todos.map(todo =>
 *             todo.id === mutationParams.id ? mutationParams : todo
 *           );
 *         },
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Update a todo - UI updates immediately (optimistic)
 * store.mutateUpdateTodo({ id: '1', text: 'Updated', done: true });
 * // store.todos.value() already reflects the change
 * ```
 *
 * @example
 * Query with patch-based updates
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'UserStore', providedIn: 'root' },
 *   craftMutations(() => ({
 *     updateEmail: mutation({
 *       method: (data: { userId: string; email: string }) => data,
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/users/${params.userId}/email`, {
 *           method: 'PATCH',
 *           body: JSON.stringify({ email: params.email }),
 *         });
 *         return response.json();
 *       },
 *     }),
 *   })),
 *   craftQuery('user', ({ updateEmail }) =>
 *     query(
 *       {
 *         params: () => currentUserId(),
 *         loader: async ({ params }) => {
 *           const response = await fetch(`/api/users/${params}`);
 *           return response.json();
 *         },
 *       },
 *       insertReactOnMutation(updateEmail, {
 *         // Patch only the email field
 *         optimisticPatch: {
 *           email: ({ mutationParams }) => mutationParams.email,
 *         },
 *         patch: {
 *           email: ({ mutationParams }) => mutationParams.email,
 *         },
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Only email field is updated, rest of user data unchanged
 * store.mutateUpdateEmail({ userId: '123', email: 'new@example.com' });
 * ```
 *
 * @example
 * Query with reload on mutation events
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'PostStore', providedIn: 'root' },
 *   craftMutations(() => ({
 *     createPost: mutation({
 *       method: (data: CreatePostData) => data,
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/posts', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     }),
 *     deletePost: mutation({
 *       method: (postId: string) => ({ postId }),
 *       loader: async ({ params }) => {
 *         await fetch(`/api/posts/${params.postId}`, { method: 'DELETE' });
 *         return { deleted: true };
 *       },
 *     }),
 *   })),
 *   craftQuery('posts', ({ createPost, deletePost }) =>
 *     query(
 *       {
 *         params: () => ({ page: 1 }),
 *         loader: async ({ params }) => {
 *           const response = await fetch(`/api/posts?page=${params.page}`);
 *           return response.json();
 *         },
 *       },
 *       insertReactOnMutation(createPost, {
 *         reload: { onMutationResolved: true }, // Reload after create
 *       }),
 *       insertReactOnMutation(deletePost, {
 *         reload: { onMutationResolved: true }, // Reload after delete
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Posts list automatically reloads after create/delete
 * store.mutateCreatePost({ title: 'New Post', content: '...' });
 * // -> posts query reloads automatically when mutation completes
 * ```
 *
 * @example
 * Query with identifier for parallel execution
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'UserStore', providedIn: 'root' },
 *   craftQuery('userDetails', () =>
 *     query({
 *       params: () => selectedUserId(),
 *       identifier: (userId) => userId,
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/users/${params}`);
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Access specific user instances
 * const user1 = store.userDetails.select('user-1');
 * const user2 = store.userDetails.select('user-2');
 *
 * console.log(user1?.status()); // 'resolved'
 * console.log(user1?.value()); // { id: 'user-1', name: '...' }
 * console.log(user2?.status()); // 'loading'
 * ```
 *
 * @example
 * Query with streaming data
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'LiveDataStore', providedIn: 'root' },
 *   craftQuery('liveCount', () =>
 *     query({
 *       params: () => ({}),
 *       stream: async () => {
 *         const resultSignal = signal({ count: 0 });
 *
 *         // Simulate streaming updates
 *         const interval = setInterval(() => {
 *           resultSignal.update(v => ({ count: v.count + 1 }));
 *         }, 1000);
 *
 *         return resultSignal;
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Value updates continuously as stream emits
 * console.log(store.liveCount.value()); // { count: 5 }
 * // ... after 1 second
 * console.log(store.liveCount.value()); // { count: 6 }
 * ```
 *
 * @example
 * Query with persistence
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'ProductStore', providedIn: 'root' },
 *   craftQuery('products', () =>
 *     query(
 *       {
 *         params: () => ({ category: currentCategory() }),
 *         loader: async ({ params }) => {
 *           const response = await fetch(`/api/products?category=${params.category}`);
 *           return response.json();
 *         },
 *       },
 *       insertLocalStoragePersister({
 *         storeName: 'ProductStore',
 *         key: 'products',
 *         cacheTime: 600000, // 10 minutes
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Products are cached in localStorage
 * // On next visit, cached data loads instantly while fresh data fetches
 * console.log(store.products.value()); // Cached data available immediately
 * ```
 *
 * @example
 * Query reacting to sources
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'DataStore', providedIn: 'root' },
 *   craftSources({
 *     refresh: source<void>(),
 *   }),
 *   craftQuery('data', ({ refresh }) =>
 *     query({
 *       method: afterRecomputation(refresh, () => ({})),
 *       loader: async () => {
 *         const response = await fetch('/api/data');
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Query executes automatically when source emits
 * store.setRefresh();
 * // -> data query executes
 * ```
 *
 * @example
 * Complex coordination with multiple mutations and conditional reloads
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'ArticleStore', providedIn: 'root' },
 *   craftMutations(() => ({
 *     updateArticle: mutation({
 *       method: (data: Article) => data,
 *       identifier: (data) => data.id,
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/articles/${params.id}`, {
 *           method: 'PATCH',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     }),
 *   })),
 *   craftQuery('articles', ({ updateArticle }) =>
 *     query(
 *       {
 *         params: () => ({ status: 'published' }),
 *         loader: async ({ params }) => {
 *           const response = await fetch(`/api/articles?status=${params.status}`);
 *           return response.json();
 *         },
 *       },
 *       insertReactOnMutation(updateArticle, {
 *         // Only reload if the update affects published articles
 *         reload: {
 *           onMutationResolved: ({ mutationParams }) =>
 *             mutationParams.status === 'published',
 *         },
 *         // Patch the article in the list optimistically
 *         optimisticUpdate: ({ queryResource, mutationParams }) => {
 *           const articles = queryResource.value() ?? [];
 *           return articles.map(article =>
 *             article.id === mutationParams.id ? mutationParams : article
 *           );
 *         },
 *       })
 *     )
 *   )
 * );
 * ```
 */
export function craftQuery<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  const ResourceName extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  ResourceArgsParams,
  InsertionsOutputs,
  IsMethod,
  SourceParams,
  GroupIdentifier,
>(
  resourceName: ResourceName,
  queryFactory: (
    context: ContextQueryEntries<Context, StoreConfig, ResourceName>,
  ) => QueryOutput<
    ResourceState,
    ResourceArgsParams,
    ResourceParams,
    SourceParams,
    GroupIdentifier,
    InsertionsOutputs
  >,
): CraftQueryOutputs<
  Context,
  StoreConfig,
  ResourceName,
  NoInfer<ResourceState>,
  ResourceParams,
  ResourceArgsParams,
  IsMethod,
  SourceParams,
  GroupIdentifier,
  InsertionsOutputs
> {
  return () => (contextData, injector, storeConfig) => {
    const queryFactoryContext = craftFactoryEntries(contextData);
    const queryRef = queryFactory({
      ...queryFactoryContext,
      INSERT_CONFIG: {
        storeName: storeConfig.name,
        key: resourceName,
      },
    } as ContextQueryEntries<Context, StoreConfig, ResourceName>) as QueryRef<
      ResourceState,
      ResourceArgsParams,
      ResourceParams,
      InsertionsOutputs,
      IsMethod,
      SourceParams,
      GroupIdentifier
    >;

    return partialContext({
      props: {
        [`${resourceName as ResourceName}`]: Object.assign(
          queryRef,
        ) as MergeObject<
          ResourceByIdRef<
            GroupIdentifier & string,
            ResourceState,
            ResourceParams
          >,
          InsertionsOutputs
        >,
      },
      _query: {
        [resourceName as ResourceName]: queryRef,
      },
    }) as SpecificCraftQueryOutputs<
      ResourceName,
      ResourceState,
      ResourceParams,
      ResourceArgsParams,
      IsMethod,
      SourceParams,
      GroupIdentifier,
      InsertionsOutputs
    >;
  };
}
