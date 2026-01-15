import {
  ContextConstraints,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  PartialContext,
  partialContext,
  StoreConfigConstraints,
} from './craft';
import { UnionToTuple, Prettify } from './util/util.type';
import { capitalize } from './util/util';
import { FilterMethodsBoundToSources } from './util/util.type';
import { MutationRef } from './mutation';

type SpecificCraftMutationsOutputs<Mutations extends {}> = PartialContext<{
  props: {
    [key in keyof Mutations]: Prettify<Omit<Mutations[key], 'mutate'>>;
  };
  methods: FilterMethodsBoundToSources<
    Mutations,
    UnionToTuple<keyof Mutations>,
    'mutate',
    'mutate'
  >;
  _mutation: {
    [key in keyof Mutations]: Mutations[key];
  };
}>;

type CraftMutationsOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Mutations extends {},
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftMutationsOutputs<Mutations>
>;

/**
 * Creates mutation definitions for use within a craft store, enabling reactive management of server-side data modifications.
 *
 * This function integrates multiple `mutation()` instances into a craft store by:
 * - Registering mutations as a group with automatic state tracking
 * - Generating prefixed `mutate` methods for each mutation (e.g., `mutateMutationName`)
 * - Exposing mutation state signals (value, status, error, isLoading)
 * - Enabling queries to react to mutation changes via `insertReactOnMutation()`
 * - Supporting both method-based and source-based mutation triggering
 * - Managing mutations with identifiers for parallel execution
 *
 * @remarks
 * **Naming Convention:**
 * - Mutations are accessible as: `store.mutationName` (returns signals and state)
 * - Trigger methods are prefixed: `store.mutateMutationName(args)`
 * - Source-based mutations (bound to sources) don't expose `mutate` methods
 *
 * **Use Cases:**
 * - **Data modification**: Create, update, delete operations on server data
 * - **Optimistic updates**: Update UI immediately while mutation executes
 * - **Cache invalidation**: Trigger query reloads after mutations complete
 * - **Batch operations**: Execute multiple mutations with individual state tracking
 * - **Form submissions**: Handle form data submission with loading/error states
 *
 * **Context Access:**
 * The mutations factory receives full access to the craft context:
 * - Sources: Bind mutations to sources for automatic execution
 * - Queries: Access query state for conditional mutation logic
 * - Other mutations: Coordinate between multiple mutations
 * - Injections: Access Angular services and dependencies
 *
 * **Integration with Queries:**
 * - Queries can react to mutations via `insertReactOnMutation()`
 * - Supports optimistic updates, patches, full updates, and reloads
 * - Filtered reactions based on mutation identifiers
 *
 * **Store Integration:**
 * - Mutation state accessible as: `store.mutationName.value()`, `store.mutationName.status()`
 * - Trigger mutations: `store.mutateMutationName(args)`
 * - With identifier: `store.mutationName.select(id)` for individual instances
 * - Context access: Other craft entries can access mutations for coordination
 *
 * @template Context - The craft store context type
 * @template StoreConfig - The craft store configuration type
 * @template Mutations - Record of mutation names to mutation instances
 *
 * @param mutationsFactory - Factory function that receives the craft context and returns a record of mutations.
 *   Has access to all other craft entries (sources, queries, inputs, injections) defined before it.
 *
 * @returns A craft factory utility that integrates mutations into the store with:
 *   - `store.mutationName`: Mutation state and signals
 *   - `store.mutateMutationName(args)`: Method to trigger the mutation (for method-based mutations)
 *   - Full type safety for mutation parameters and results
 *
 * @example
 * Basic mutations for CRUD operations
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'TodoStore', providedIn: 'root' },
 *   craftMutations(() => ({
 *     createTodo: mutation({
 *       method: (data: { text: string }) => data,
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/todos', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     }),
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
 *     deleteTodo: mutation({
 *       method: (todoId: string) => ({ todoId }),
 *       loader: async ({ params }) => {
 *         await fetch(`/api/todos/${params.todoId}`, { method: 'DELETE' });
 *         return { deleted: true };
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Create a new todo
 * store.mutateCreateTodo({ text: 'Buy milk' });
 * console.log(store.createTodo.status()); // 'loading'
 *
 * // After completion
 * console.log(store.createTodo.status()); // 'resolved'
 * console.log(store.createTodo.value()); // { id: '1', text: 'Buy milk', ... }
 *
 * // Update an existing todo
 * store.mutateUpdateTodo({ id: '1', text: 'Buy milk and eggs', done: false });
 *
 * // Delete a todo
 * store.mutateDeleteTodo('1');
 * ```
 *
 * @example
 * Mutations with identifiers for parallel execution
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'UserStore', providedIn: 'root' },
 *   craftMutations(() => ({
 *     updateUser: mutation({
 *       method: (user: User) => user,
 *       identifier: (user) => user.id,
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/users/${params.id}`, {
 *           method: 'PATCH',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Trigger multiple mutations in parallel
 * store.mutateUpdateUser({ id: 'user-1', name: 'Alice' });
 * store.mutateUpdateUser({ id: 'user-2', name: 'Bob' });
 * store.mutateUpdateUser({ id: 'user-3', name: 'Charlie' });
 *
 * // Access individual mutation states
 * const user1Mutation = store.updateUser.select('user-1');
 * console.log(user1Mutation?.status()); // 'loading' or 'resolved'
 * console.log(user1Mutation?.value()); // { id: 'user-1', name: 'Alice', ... }
 *
 * const user2Mutation = store.updateUser.select('user-2');
 * console.log(user2Mutation?.status()); // Independent state
 * ```
 *
 * @example
 * Mutations coordinated with queries via insertReactOnMutation
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
 *   })),
 *   craftQuery('posts', ({ createPost }) =>
 *     query(
 *       {
 *         params: () => ({}),
 *         loader: async () => {
 *           const response = await fetch('/api/posts');
 *           return response.json();
 *         },
 *       },
 *       insertReactOnMutation(createPost, {
 *         // Reload posts list when create completes
 *         reload: { onMutationResolved: true },
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Create a post - posts query reloads automatically
 * store.mutateCreatePost({ title: 'New Post', content: 'Content...' });
 * // -> createPost mutation executes
 * // -> posts query automatically reloads when mutation resolves
 * ```
 *
 * @example
 * Source-based mutations (automatic execution)
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'FormStore', providedIn: 'root' },
 *   craftSources({
 *     submitForm: source<FormData>(),
 *   }),
 *   craftMutations(({ submitForm }) => ({
 *     submit: mutation({
 *       method: afterRecomputation(submitForm, (data) => data),
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/submit', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Mutation executes automatically when source emits
 * store.setSubmitForm({ name: 'John', email: 'john@example.com' });
 * // -> submit mutation executes automatically
 * // Note: No mutateSubmit method exposed (source-based)
 *
 * // Access mutation state
 * console.log(store.submit.status()); // 'loading'
 * console.log(store.submit.value()); // Result after completion
 * ```
 *
 * @example
 * Mutations accessing other context entries
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'AppStore', providedIn: 'root' },
 *   craftQuery('currentUser', () =>
 *     query({
 *       params: () => currentUserId(),
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/users/${params}`);
 *         return response.json();
 *       },
 *     })
 *   ),
 *   craftMutations(({ currentUser }) => ({
 *     updateProfile: mutation({
 *       method: (data: ProfileData) => data,
 *       loader: async ({ params }) => {
 *         // Access current user from query
 *         const userId = currentUser.value()?.id;
 *         if (!userId) throw new Error('User not loaded');
 *
 *         const response = await fetch(`/api/users/${userId}/profile`, {
 *           method: 'PATCH',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Mutation uses current user from query
 * store.mutateUpdateProfile({ bio: 'New bio', avatar: 'avatar.jpg' });
 * ```
 *
 * @example
 * Multiple mutations with different trigger patterns
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'DataStore', providedIn: 'root' },
 *   craftSources({
 *     autoSave: source<SaveData>(),
 *   }),
 *   craftMutations(({ autoSave }) => ({
 *     // Manual mutation
 *     manualSave: mutation({
 *       method: (data: SaveData) => data,
 *       loader: async ({ params }) => {
 *         await fetch('/api/save', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return { saved: true };
 *       },
 *     }),
 *     // Auto mutation (source-based)
 *     autoSave: mutation({
 *       method: afterRecomputation(autoSave, (data) => data),
 *       loader: async ({ params }) => {
 *         await fetch('/api/autosave', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return { autoSaved: true };
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Manual save - explicit call
 * store.mutateManualSave({ content: 'My data' });
 *
 * // Auto save - triggered by source
 * store.setAutoSave({ content: 'Auto saved data' });
 * // No store.mutateAutoSave available (source-based)
 * ```
 *
 * @example
 * Error handling and status tracking
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'UploadStore', providedIn: 'root' },
 *   craftMutations(() => ({
 *     uploadFile: mutation({
 *       method: (file: File) => file,
 *       loader: async ({ params }) => {
 *         const formData = new FormData();
 *         formData.append('file', params);
 *
 *         const response = await fetch('/api/upload', {
 *           method: 'POST',
 *           body: formData,
 *         });
 *
 *         if (!response.ok) {
 *           throw new Error('Upload failed');
 *         }
 *
 *         return response.json();
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Handle upload with status tracking
 * store.mutateUploadFile(selectedFile);
 *
 * // Track upload status
 * effect(() => {
 *   const status = store.uploadFile.status();
 *   const error = store.uploadFile.error();
 *
 *   if (status === 'loading') {
 *     console.log('Uploading...');
 *   } else if (status === 'resolved') {
 *     console.log('Upload complete:', store.uploadFile.value());
 *   } else if (status === 'error') {
 *     console.error('Upload failed:', error?.message);
 *   }
 * });
 * ```
 */
export function craftMutations<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Mutations extends {
    [key: string]: {
      kind: 'mutation';
    };
  },
>(
  mutationsFactory: (context: CraftFactoryEntries<Context>) => Mutations,
): CraftMutationsOutputs<Context, StoreConfig, Mutations> {
  return (_cloudProxy) => (contextData) => {
    const mutations = mutationsFactory(
      craftFactoryEntries(contextData),
    ) as unknown as Record<
      string,
      MutationRef<unknown, unknown, unknown, unknown, unknown, unknown, unknown>
    >;

    const { methods, resourceRefs } = Object.entries(mutations ?? {}).reduce(
      (acc, [methodName, mutationRef]) => {
        const methodValue =
          'mutate' in mutationRef ? mutationRef.mutate : undefined;
        if (!methodValue) {
          acc.resourceRefs[methodName] = mutationRef;
          return acc;
        }
        acc.resourceRefs[methodName] = mutationRef;
        acc.methods[`mutate${capitalize(methodName)}`] =
          methodValue as Function;
        return acc;
      },
      {
        methods: {},
        resourceRefs: {},
      } as {
        resourceRefs: Record<
          string,
          Omit<
            MutationRef<
              unknown,
              unknown,
              unknown,
              unknown,
              unknown,
              unknown,
              unknown
            >,
            'mutate' | 'source'
          >
        >;
        methods: Record<string, Function>;
      },
    );

    return partialContext({
      props: resourceRefs,
      methods,
      _mutation: resourceRefs,
    }) as unknown as SpecificCraftMutationsOutputs<Mutations>;
  };
}
