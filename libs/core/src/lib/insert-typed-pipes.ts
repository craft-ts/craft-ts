/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any */
import { craftPipe } from './craft-pipe';
import type {
  InsertionsQueryParamsFactory,
  InsertionsResourcesFactory,
  InsertionsStateFactory,
  ResourceExceptionConstraints,
} from './query.core';
import type { CraftMachineInsertionContext } from './craft-state-machine';
import { DEEP_YIELDABLE_INSERTION } from './reactive-read';
import type { YieldableInsertionMethods } from './yieldable';

type QueryPipeFactory<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
  Yielded = never,
> = InsertionsResourcesFactory<
  GroupIdentifier,
  ResourceState,
  ResourceParams,
  Exceptions,
  InsertionsOutputs,
  PreviousInsertionsOutputs,
  Yielded
>;

type AnyInsertionFactory = (context: any) => any;

function createTypedInsertionPipe(...members: AnyInsertionFactory[]) {
  const pipe = (context: any) => {
    // The public overloads cap the member count at seven. The implementation
    // delegates to craftPipe so all runtime wrapping and generator handling
    // stays in one place.
    return (craftPipe as any)(context, ...members);
  };
  if (
    members.some(
      (member) =>
        typeof member === 'function' && DEEP_YIELDABLE_INSERTION in member,
    )
  ) {
    Object.defineProperty(pipe, DEEP_YIELDABLE_INSERTION, { value: true });
  }
  return pipe;
}

/**
 * Composes several state insertions without requiring an explicit context.
 * For the universal/context-explicit form, use {@link craftPipe}.
 */
export function insertStatePipe<
  State,
  Insertion1,
  Insertion2,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
>(
  insertion1: InsertionsStateFactory<State, Insertion1, {}, Insertion1Yielded>,
  insertion2: InsertionsStateFactory<
    State,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
): InsertionsStateFactory<
  State,
  Insertion1 & Insertion2,
  {},
  Insertion1Yielded | Insertion2Yielded
>;
export function insertStatePipe<
  State,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
>(
  insertion1: InsertionsStateFactory<State, Insertion1, {}, Insertion1Yielded>,
  insertion2: InsertionsStateFactory<
    State,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsStateFactory<
    State,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
): InsertionsStateFactory<
  State,
  Insertion1 & Insertion2 & Insertion3,
  {},
  Insertion1Yielded | Insertion2Yielded | Insertion3Yielded
>;
export function insertStatePipe<
  State,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
>(
  insertion1: InsertionsStateFactory<State, Insertion1, {}, Insertion1Yielded>,
  insertion2: InsertionsStateFactory<
    State,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsStateFactory<
    State,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsStateFactory<
    State,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
): InsertionsStateFactory<
  State,
  Insertion1 & Insertion2 & Insertion3 & Insertion4,
  {},
  Insertion1Yielded | Insertion2Yielded | Insertion3Yielded | Insertion4Yielded
>;
export function insertStatePipe<
  State,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
>(
  insertion1: InsertionsStateFactory<State, Insertion1, {}, Insertion1Yielded>,
  insertion2: InsertionsStateFactory<
    State,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsStateFactory<
    State,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsStateFactory<
    State,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: InsertionsStateFactory<
    State,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
): InsertionsStateFactory<
  State,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
  {},
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
>;
export function insertStatePipe<
  State,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
>(
  insertion1: InsertionsStateFactory<State, Insertion1, {}, Insertion1Yielded>,
  insertion2: InsertionsStateFactory<
    State,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsStateFactory<
    State,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsStateFactory<
    State,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: InsertionsStateFactory<
    State,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: InsertionsStateFactory<
    State,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
): InsertionsStateFactory<
  State,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
  {},
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
>;
export function insertStatePipe<
  State,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
  Insertion7Yielded = never,
>(
  insertion1: InsertionsStateFactory<State, Insertion1, {}, Insertion1Yielded>,
  insertion2: InsertionsStateFactory<
    State,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsStateFactory<
    State,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsStateFactory<
    State,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: InsertionsStateFactory<
    State,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: InsertionsStateFactory<
    State,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
  insertion7: InsertionsStateFactory<
    State,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
    Insertion7Yielded
  >,
): InsertionsStateFactory<
  State,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7,
  {},
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
  | Insertion7Yielded
>;
export function insertStatePipe(...members: any[]): any {
  return createTypedInsertionPipe(...members);
}

type StateMachinePipeContext<
  Context,
  Steps extends string,
  StepContexts,
  PreviousInsertions,
> = CraftMachineInsertionContext<Context, Steps, StepContexts> & {
  readonly insertions: keyof PreviousInsertions extends string
    ? YieldableInsertionMethods<PreviousInsertions>
    : never;
};

type StateMachinePipeFactory<
  Context,
  Steps extends string,
  StepContexts,
  Insertions,
  PreviousInsertions = {},
  Yielded = never,
> = (
  context: StateMachinePipeContext<
    Context,
    Steps,
    StepContexts,
    PreviousInsertions
  >,
) => Insertions | Generator<Yielded, Insertions, unknown>;

type StateMachinePipeReturn<
  Context,
  Steps extends string,
  StepContexts,
  Insertions,
  Yielded,
> = (
  context: CraftMachineInsertionContext<Context, Steps, StepContexts>,
) => Generator<Yielded, Insertions, unknown>;

/**
 * Composes several `craftStateMachine` insertions without requiring an
 * explicit context. Each member sees the outputs of the members before it
 * through `insertions`, just like the typed pipes for the other primitives.
 */
export function insertStateMachinePipe<
  Context,
  Steps extends string,
  StepContexts,
  Insertion1,
  Insertion2,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
>(
  insertion1: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
): StateMachinePipeReturn<
  Context,
  Steps,
  StepContexts,
  Insertion1 & Insertion2,
  Insertion1Yielded | Insertion2Yielded
>;
export function insertStateMachinePipe<
  Context,
  Steps extends string,
  StepContexts,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
>(
  insertion1: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
): StateMachinePipeReturn<
  Context,
  Steps,
  StepContexts,
  Insertion1 & Insertion2 & Insertion3,
  Insertion1Yielded | Insertion2Yielded | Insertion3Yielded
>;
export function insertStateMachinePipe<
  Context,
  Steps extends string,
  StepContexts,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
>(
  insertion1: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
): StateMachinePipeReturn<
  Context,
  Steps,
  StepContexts,
  Insertion1 & Insertion2 & Insertion3 & Insertion4,
  Insertion1Yielded | Insertion2Yielded | Insertion3Yielded | Insertion4Yielded
>;
export function insertStateMachinePipe<
  Context,
  Steps extends string,
  StepContexts,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
>(
  insertion1: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
): StateMachinePipeReturn<
  Context,
  Steps,
  StepContexts,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
>;
export function insertStateMachinePipe<
  Context,
  Steps extends string,
  StepContexts,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
>(
  insertion1: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
): StateMachinePipeReturn<
  Context,
  Steps,
  StepContexts,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
>;
export function insertStateMachinePipe<
  Context,
  Steps extends string,
  StepContexts,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
  Insertion7Yielded = never,
>(
  insertion1: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
  insertion7: StateMachinePipeFactory<
    Context,
    Steps,
    StepContexts,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
    Insertion7Yielded
  >,
): StateMachinePipeReturn<
  Context,
  Steps,
  StepContexts,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7,
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
  | Insertion7Yielded
>;
export function insertStateMachinePipe(...members: any[]): any {
  return createTypedInsertionPipe(...members);
}

type QueryPipeArgs<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion,
  PreviousInsertions = {},
  Yielded = never,
> = QueryPipeFactory<
  GroupIdentifier,
  NoInfer<ResourceState>,
  NoInfer<ResourceParams>,
  NoInfer<Exceptions>,
  Insertion,
  PreviousInsertions,
  Yielded
>;

type QueryPipeReturn<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertions,
  Yielded,
> = QueryPipeFactory<
  GroupIdentifier,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertions,
  {},
  Yielded
>;

/**
 * Composes several query, mutation, or asyncProcess insertions without an
 * explicit context. For the universal/context-explicit form, use
 * {@link craftPipe}.
 */
export function insertQueryPipe<
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3 = {},
  Insertion4 = {},
  Insertion5 = {},
  Insertion6 = {},
  Insertion7 = {},
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
  Insertion7Yielded = never,
>(
  insertion1: QueryPipeArgs<
    unknown,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    unknown,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3?: QueryPipeArgs<
    unknown,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4?: QueryPipeArgs<
    unknown,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5?: QueryPipeArgs<
    unknown,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6?: QueryPipeArgs<
    unknown,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
  insertion7?: QueryPipeArgs<
    unknown,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
    Insertion7Yielded
  >,
): QueryPipeReturn<
  unknown,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7,
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
  | Insertion7Yielded
>;
export function insertQueryPipe<
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
>(
  insertion1: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
): QueryPipeReturn<
  string,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 & Insertion2,
  Insertion1Yielded | Insertion2Yielded
>;
export function insertQueryPipe<
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
>(
  insertion1: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
): QueryPipeReturn<
  string,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 & Insertion2 & Insertion3,
  Insertion1Yielded | Insertion2Yielded | Insertion3Yielded
>;
export function insertQueryPipe<
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
>(
  insertion1: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
): QueryPipeReturn<
  string,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 & Insertion2 & Insertion3 & Insertion4,
  Insertion1Yielded | Insertion2Yielded | Insertion3Yielded | Insertion4Yielded
>;
export function insertQueryPipe<
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
>(
  insertion1: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
): QueryPipeReturn<
  string,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
>;
export function insertQueryPipe<
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
>(
  insertion1: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
): QueryPipeReturn<
  string,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
>;
export function insertQueryPipe<
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
  Insertion7Yielded = never,
>(
  insertion1: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
  insertion7: QueryPipeArgs<
    string,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
    Insertion7Yielded
  >,
): QueryPipeReturn<
  string,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7,
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
  | Insertion7Yielded
>;
export function insertQueryPipe<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
>(
  insertion1: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
): QueryPipeReturn<
  GroupIdentifier,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 & Insertion2,
  Insertion1Yielded | Insertion2Yielded
>;
export function insertQueryPipe<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
>(
  insertion1: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
): QueryPipeReturn<
  GroupIdentifier,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 & Insertion2 & Insertion3,
  Insertion1Yielded | Insertion2Yielded | Insertion3Yielded
>;
export function insertQueryPipe<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
>(
  insertion1: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
): QueryPipeReturn<
  GroupIdentifier,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 & Insertion2 & Insertion3 & Insertion4,
  Insertion1Yielded | Insertion2Yielded | Insertion3Yielded | Insertion4Yielded
>;
export function insertQueryPipe<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
>(
  insertion1: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
): QueryPipeReturn<
  GroupIdentifier,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
>;
export function insertQueryPipe<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
>(
  insertion1: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
): QueryPipeReturn<
  GroupIdentifier,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
>;
export function insertQueryPipe<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  Exceptions extends ResourceExceptionConstraints,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
  Insertion7Yielded = never,
>(
  insertion1: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
  insertion7: QueryPipeArgs<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    Exceptions,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
    Insertion7Yielded
  >,
): QueryPipeReturn<
  GroupIdentifier,
  ResourceState,
  ResourceParams,
  Exceptions,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7,
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
  | Insertion7Yielded
>;
export function insertQueryPipe(...members: any[]): any {
  return createTypedInsertionPipe(...members);
}

type QueryParamsPipeFactory<
  QueryParamsType,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
  Yielded = never,
> = InsertionsQueryParamsFactory<
  QueryParamsType,
  InsertionsOutputs,
  PreviousInsertionsOutputs,
  Yielded
>;

/** Composes several queryParams insertions without an explicit context. */
export function insertQueryParamsPipe<
  QueryParamsType,
  Insertion1,
  Insertion2,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
>(
  insertion1: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
): QueryParamsPipeFactory<
  QueryParamsType,
  Insertion1 & Insertion2,
  {},
  Insertion1Yielded | Insertion2Yielded
>;
export function insertQueryParamsPipe<
  QueryParamsType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
>(
  insertion1: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
): QueryParamsPipeFactory<
  QueryParamsType,
  Insertion1 & Insertion2 & Insertion3,
  {},
  Insertion1Yielded | Insertion2Yielded | Insertion3Yielded
>;
export function insertQueryParamsPipe<
  QueryParamsType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
>(
  insertion1: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
): QueryParamsPipeFactory<
  QueryParamsType,
  Insertion1 & Insertion2 & Insertion3 & Insertion4,
  {},
  Insertion1Yielded | Insertion2Yielded | Insertion3Yielded | Insertion4Yielded
>;
export function insertQueryParamsPipe<
  QueryParamsType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
>(
  insertion1: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
): QueryParamsPipeFactory<
  QueryParamsType,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
  {},
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
>;
export function insertQueryParamsPipe<
  QueryParamsType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
>(
  insertion1: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
): QueryParamsPipeFactory<
  QueryParamsType,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
  {},
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
>;
export function insertQueryParamsPipe<
  QueryParamsType,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
  Insertion7Yielded = never,
>(
  insertion1: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
  insertion7: QueryParamsPipeFactory<
    QueryParamsType,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
    Insertion7Yielded
  >,
): QueryParamsPipeFactory<
  QueryParamsType,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7,
  {},
  | Insertion1Yielded
  | Insertion2Yielded
  | Insertion3Yielded
  | Insertion4Yielded
  | Insertion5Yielded
  | Insertion6Yielded
  | Insertion7Yielded
>;
export function insertQueryParamsPipe(...members: any[]): any {
  return createTypedInsertionPipe(...members);
}

/** Composes several mutation insertions without requiring an explicit context. */
export const insertMutationPipe = insertQueryPipe;

/** Composes several asyncProcess insertions without requiring an explicit context. */
export const insertAsyncProcessPipe = insertQueryPipe;
