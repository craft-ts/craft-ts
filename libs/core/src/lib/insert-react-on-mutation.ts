import { WritableSignal } from '@angular/core';
import {
  ResourceByIdLikeMutationRef,
  ResourceLikeMutationRef,
} from './mutation';
import { ResourceByIdLikeQueryRef, ResourceLikeQueryRef } from './query';
import {
  InsertionParams,
  QueryDeclarativeEffect,
  ResourceExceptionConstraints,
} from './query.core';
import { ResourceByIdRef } from './resource-by-id';
import { reactOnMutationEffect } from './util/react-on-mutation-effect';
import { InternalType } from './util/types/util.type';

/**
 * Creates an insertion function that makes a query react to mutation state changes.
 *
 * This insertion enables declarative synchronization between queries and mutations, allowing you to:
 * - Optimistically update query data when a mutation starts (before server response)
 * - Update query data when a mutation completes successfully
 * - Patch specific fields in query data based on mutation parameters
 * - Reload queries when mutations complete
 * - Filter which query instances should react (when using identifiers)
 *
 * @remarks
 * This is particularly useful for:
 * - **Optimistic UI updates**: Show changes immediately while the mutation is processing
 * - **Cache synchronization**: Keep local query cache in sync with server state after mutations
 * - **Selective updates**: Update only relevant query instances based on identifiers
 * - **Complex state management**: Coordinate multiple queries reacting to the same mutation
 *
 * @param mutation - The mutation to react to. Can be either:
 *   - A standard mutation (ResourceLikeMutationRef)
 *   - A mutation with identifier for grouped instances (ResourceByIdLikeMutationRef)
 * @param mutationEffectOptions - Configuration for how the query should react:
 *   - `optimisticUpdate`: Function to update query state immediately when mutation starts (loading state)
 *   - `update`: Function to update query state when mutation completes (resolved state)
 *   - `optimisticPatch`: Object mapping query fields to mutation values for optimistic updates
 *   - `patch`: Object mapping query fields to mutation values for final updates
 *   - `reload`: Configuration to reload the query when mutation reaches specific states
 *   - `filter`: Function to determine which query instances should react (required when using identifiers)
 *
 * @returns An insertion function that can be passed to query() to enable the reactive behavior
 *
 * @example
 * Basic optimistic update with patch
 * ```ts
 * const updateUserMutation = mutation({
 *   method: (data: { id: string; name: string }) => data,
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params.id}`, {
 *       method: 'PATCH',
 *       body: JSON.stringify(params),
 *     });
 *     return response.json();
 *   },
 * });
 *
 * const userQuery = query(
 *   {
 *     params: () => ({ userId: currentUserId() }),
 *     loader: async ({ params }) => {
 *       const response = await fetch(`/api/users/${params.userId}`);
 *       return response.json();
 *     },
 *   },
 *   insertReactOnMutation(updateUserMutation, {
 *     // Optimistically update the name while mutation is loading
 *     optimisticPatch: {
 *       name: ({ mutationParams }) => mutationParams.name,
 *     },
 *     // Apply final update when mutation resolves
 *     patch: {
 *       name: ({ mutationParams }) => mutationParams.name,
 *     },
 *   })
 * );
 *
 * // When mutation is triggered, query updates immediately (optimistic)
 * updateUserMutation.mutate({ id: '123', name: 'New Name' });
 * // userQuery.value().name is now 'New Name' (optimistic)
 *
 * // When mutation completes, patch confirms the change
 * // userQuery.value().name remains 'New Name' (confirmed)
 * ```
 *
 * @example
 * Full state update on mutation completion
 * ```ts
 * const deleteTodoMutation = mutation({
 *   method: (todoId: string) => ({ todoId }),
 *   loader: async ({ params }) => {
 *     await fetch(`/api/todos/${params.todoId}`, { method: 'DELETE' });
 *     return { deleted: true };
 *   },
 * });
 *
 * const todosQuery = query(
 *   {
 *     params: () => ({}),
 *     loader: async () => {
 *       const response = await fetch('/api/todos');
 *       return response.json(); // Returns Todo[]
 *     },
 *   },
 *   insertReactOnMutation(deleteTodoMutation, {
 *     // Remove the deleted todo from the list optimistically
 *     optimisticUpdate: ({ queryResource, mutationParams }) => {
 *       const currentTodos = queryResource.value() ?? [];
 *       return currentTodos.filter(todo => todo.id !== mutationParams.todoId);
 *     },
 *     // Confirm the deletion when mutation resolves
 *     update: ({ queryResource, mutationParams }) => {
 *       const currentTodos = queryResource.value() ?? [];
 *       return currentTodos.filter(todo => todo.id !== mutationParams.todoId);
 *     },
 *   })
 * );
 * ```
 *
 * @example
 * Reload query after mutation
 * ```ts
 * const createPostMutation = mutation({
 *   method: (data: { title: string; content: string }) => data,
 *   loader: async ({ params }) => {
 *     const response = await fetch('/api/posts', {
 *       method: 'POST',
 *       body: JSON.stringify(params),
 *     });
 *     return response.json();
 *   },
 * });
 *
 * const postsQuery = query(
 *   {
 *     params: () => ({ page: 1 }),
 *     loader: async ({ params }) => {
 *       const response = await fetch(`/api/posts?page=${params.page}`);
 *       return response.json();
 *     },
 *   },
 *   insertReactOnMutation(createPostMutation, {
 *     // Reload the posts list when mutation completes
 *     reload: {
 *       onMutationResolved: true, // Reload on success
 *     },
 *   })
 * );
 *
 * // When mutation completes, postsQuery automatically reloads
 * createPostMutation.mutate({ title: 'New Post', content: 'Content' });
 * ```
 *
 * @example
 * Filtered updates with identifiers
 * ```ts
 * const updatePostMutation = mutation({
 *   method: (data: { postId: string; title: string }) => data,
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/posts/${params.postId}`, {
 *       method: 'PATCH',
 *       body: JSON.stringify(params),
 *     });
 *     return response.json();
 *   },
 * });
 *
 * const postsQuery = query(
 *   {
 *     params: () => currentPostId(),
 *     identifier: (params) => params, // params is the postId
 *     loader: async ({ params }) => {
 *       const response = await fetch(`/api/posts/${params}`);
 *       return response.json();
 *     },
 *   },
 *   insertReactOnMutation(updatePostMutation, {
 *     // Only update the query instance that matches the mutation's postId
 *     filter: ({ queryIdentifier, mutationParams }) =>
 *       queryIdentifier === mutationParams.postId,
 *     patch: {
 *       title: ({ mutationParams }) => mutationParams.title,
 *     },
 *   })
 * );
 *
 * // Only the query instance for post '123' will be updated
 * updatePostMutation.mutate({ postId: '123', title: 'Updated Title' });
 * console.log(postsQuery.select('123')?.value()?.title); // 'Updated Title'
 * console.log(postsQuery.select('456')?.value()?.title); // unchanged
 * ```
 *
 * @example
 * Complex nested field updates
 * ```ts
 * const updateUserProfileMutation = mutation({
 *   method: (data: { userId: string; profile: { bio: string; avatar: string } }) => data,
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params.userId}/profile`, {
 *       method: 'PATCH',
 *       body: JSON.stringify(params.profile),
 *     });
 *     return response.json();
 *   },
 * });
 *
 * const userQuery = query(
 *   {
 *     params: () => ({ userId: currentUserId() }),
 *     loader: async ({ params }) => {
 *       const response = await fetch(`/api/users/${params.userId}`);
 *       return response.json(); // Returns { id, name, profile: { bio, avatar, ... } }
 *     },
 *   },
 *   insertReactOnMutation(updateUserProfileMutation, {
 *     optimisticPatch: {
 *       'profile.bio': ({ mutationParams }) => mutationParams.profile.bio,
 *       'profile.avatar': ({ mutationParams }) => mutationParams.profile.avatar,
 *     },
 *   })
 * );
 *
 * // Nested fields are updated optimistically
 * updateUserProfileMutation.mutate({
 *   userId: '123',
 *   profile: { bio: 'New bio', avatar: 'new-avatar.jpg' }
 * });
 * ```
 */
export function insertReactOnMutation<
  QueryResourceState extends object | undefined,
  QueryResourceParams,
  QueryResourceArgsParams,
  QueryIsMethod extends boolean,
  QuerySourceParams,
  QueryGroupIdentifier,
  QueryInsertions,
  MutationResourceState,
  MutationResourceParams,
  MutationResourceArgsParams,
  MutationIsMethod,
  MutationSourceParams,
  MutationGroupIdentifier,
  MutationInsertions,
  MutationExceptions extends ResourceExceptionConstraints,
  QueryExceptions extends ResourceExceptionConstraints,
>(
  mutation:
    | ResourceLikeMutationRef<
        MutationResourceState,
        MutationResourceParams,
        MutationIsMethod,
        MutationResourceArgsParams,
        MutationSourceParams,
        MutationInsertions,
        MutationExceptions
      >
    | ResourceByIdLikeMutationRef<
        MutationResourceState,
        MutationResourceParams,
        MutationIsMethod,
        MutationResourceArgsParams,
        MutationSourceParams,
        MutationInsertions,
        MutationGroupIdentifier,
        MutationExceptions
      >,
  mutationEffectOptions: QueryDeclarativeEffect<{
    query: InternalType<
      NoInfer<QueryResourceState>,
      NoInfer<QueryResourceParams>,
      NoInfer<QueryResourceArgsParams>,
      [unknown] extends [NoInfer<QueryGroupIdentifier>] ? false : true,
      NoInfer<QueryIsMethod>,
      NoInfer<QueryInsertions>,
      NoInfer<QueryGroupIdentifier>,
      NoInfer<QuerySourceParams>,
      NoInfer<QueryExceptions>
    >;
    mutation: InternalType<
      NoInfer<MutationResourceState>,
      NoInfer<MutationResourceParams>,
      NoInfer<MutationResourceArgsParams>,
      [unknown] extends [MutationGroupIdentifier] ? false : true,
      NoInfer<MutationIsMethod>,
      NoInfer<MutationInsertions>,
      NoInfer<MutationGroupIdentifier>,
      NoInfer<MutationSourceParams>,
      NoInfer<MutationExceptions>
    >;
  }>,
) {
  return (
    context:
      | InsertionParams<
          QueryResourceState,
          QueryResourceParams,
          QueryExceptions,
          QueryInsertions
        >
      | {
          // ! avoid to use InsertionByIdParams it is broking the typing inference
          resourceById: ResourceByIdRef<
            QueryGroupIdentifier & string,
            QueryResourceState,
            QueryResourceParams
          >;
          resourceParamsSrc: WritableSignal<QueryResourceParams | undefined>;
          identifier: (
            params: NonNullable<QueryResourceParams>,
          ) => QueryGroupIdentifier;
          insertions: keyof QueryInsertions extends string
            ? QueryInsertions
            : never;
        },
  ) => {
    return reactOnMutationEffect(
      {
        queryTargeted: ('resource' in context
          ? context.resource
          : context.resourceById) as unknown as
          | ResourceLikeQueryRef<
              QueryResourceState,
              QueryResourceParams,
              QueryIsMethod,
              QueryResourceArgsParams,
              QuerySourceParams,
              QueryInsertions,
              QueryExceptions
            >
          | ResourceByIdLikeQueryRef<
              QueryResourceState,
              QueryResourceParams,
              QueryIsMethod,
              QueryResourceArgsParams,
              QuerySourceParams,
              QueryInsertions,
              QueryGroupIdentifier,
              QueryExceptions
            >,
        mutationTargeted: mutation,
      },
      mutationEffectOptions,
    );
  };
}
