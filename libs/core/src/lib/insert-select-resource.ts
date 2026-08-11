/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any */
import type {
  InsertionStateFactoryContext,
  InsertionsStateFactory,
} from './query.core';
import {
  insertSelect,
  type InsertSelectOutput,
  type SelectedTarget,
} from './insert-select';

type ResourceSelectAutoCompleteName<StateType> =
  NoInfer<StateType> extends readonly object[]
    ? string
    : keyof NoInfer<StateType>;

type ResolveResourceState<StateType> = StateType extends readonly unknown[]
  ? StateType
  : StateType extends object
    ? { [Key in keyof StateType]: StateType[Key] }
    : StateType;

type ResourceSelectInsertionReturn<
  ResourceState extends object | undefined,
  Name extends string,
  Insertion,
  PreviousInsertionsOutputs = {},
  Yielded = never,
> = ResourceSelectInsertionFactorySignature<
  ResourceState,
  ResourceState,
  Name,
  Insertion,
  PreviousInsertionsOutputs,
  Yielded
> &
  ResourceSelectInsertionFactorySignature<
    object | undefined,
    ResourceState,
    Name,
    Insertion,
    PreviousInsertionsOutputs,
    Yielded
  >;

type ResourceSelectInsertionFactorySignature<
  ContextState extends object | undefined,
  OutputState extends object | undefined,
  Name extends string,
  Insertion,
  PreviousInsertionsOutputs,
  Yielded,
> = (
  context: Pick<
    InsertionStateFactoryContext<ContextState, PreviousInsertionsOutputs>,
    'state' | 'insertions'
  >,
) =>
  | InsertSelectOutput<ResolveResourceState<OutputState>, Name, [Insertion]>
  | Generator<
      Yielded,
      InsertSelectOutput<ResolveResourceState<OutputState>, Name, [Insertion]>,
      unknown
    >;

/**
 * Selects a nested property or an item in an array returned by a resource
 * primitive and attaches state-style insertions to that selection.
 *
 * The resource must be non-grouped. Grouped resources expose a collection of
 * resource refs through `resourceById`; selecting inside that collection needs
 * to happen after `select(id)` and is intentionally rejected here rather than
 * receiving an ambiguous state shape.
 *
 * The selected insertion deliberately receives the same context as
 * `insertSelect`: `state`, `set`, `update`, `patch`, and previous insertions.
 * The outer resource still keeps its query/mutation/asyncProcess runtime kind
 * for method wrappers.
 */
export function insertSelectResource<
  ResourceState extends object | undefined,
  const Name extends ResourceSelectAutoCompleteName<ResourceState> & string,
  Insertion,
  PreviousInsertionsOutputs = {},
  Yielded = never,
>(
  name: Name,
  insertion: InsertionsStateFactory<
    SelectedTarget<ResourceState, Name>,
    Insertion,
    PreviousInsertionsOutputs,
    Yielded
  >,
): ResourceSelectInsertionReturn<
  ResourceState,
  Name,
  Insertion,
  PreviousInsertionsOutputs,
  Yielded
>;

export function insertSelectResource(name: string, insertion: any): any {
  return (context: any) => {
    if (context.resourceById) {
      throw new Error(
        'insertSelectResource does not support grouped resources; select the resource instance first.',
      );
    }

    return (insertSelect as any)(
      name,
      insertion,
    )({
      state: context.state,
      set: context.set,
      update: context.update,
      patch:
        context.patch ??
        ((patchFn: (current: unknown) => object) =>
          context.update((current: any) => ({
            ...(current as object),
            ...patchFn(current),
          }))),
      insertions: context.insertions,
      __primitiveKind: context.__primitiveKind,
    } as any);
  };
}

/** Alias semantically scoped to query resources. */
export const insertQuerySelect = insertSelectResource;

/** Alias semantically scoped to mutation resources. */
export const insertMutationSelect = insertSelectResource;

/** Alias semantically scoped to asyncProcess resources. */
export const insertAsyncProcessSelect = insertSelectResource;
