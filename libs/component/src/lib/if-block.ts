import { YIELDABLE_VALUE, type NamedYieldableValue } from '@craft-ng/core';
import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  IfBlockNode,
} from './render/vnode';

type Condition<Name extends string> = NamedYieldableValue<
  Name,
  (() => boolean) | (() => Generator<unknown, boolean, unknown>)
>;

type BranchDependencies<Branch> = Branch extends (
  ...args: any[]
) => infer Output
  ? CraftNodeChildrenDependencies<Output>
  : {};

/** Creates a conditionally rendered Craft template block. */
export function ifBlock<
  Name extends string,
  TrueBranch extends () => CraftNodeChildren,
  FalseBranch extends (() => CraftNodeChildren) | undefined = undefined,
>(
  condition: Condition<Name>,
  whenTrue: TrueBranch,
  whenFalse?: FalseBranch,
): IfBlockNode<
  Name,
  BranchDependencies<TrueBranch> | BranchDependencies<FalseBranch>,
  ReturnType<TrueBranch>,
  FalseBranch extends (...args: any[]) => infer False ? False : never
> {
  const conditionName = (
    condition as unknown as {
      readonly [YIELDABLE_VALUE]?: unknown;
    }
  )[YIELDABLE_VALUE];
  if (typeof conditionName !== 'string') {
    throw new Error(
      'ifBlock(...) requires a named Craft reactive value as its condition.',
    );
  }

  return {
    kind: 'if',
    condition: condition as unknown as () => boolean,
    conditionName: conditionName as Name,
    whenTrue: whenTrue as unknown as () => ReturnType<TrueBranch>,
    whenFalse: whenFalse as
      | (() => FalseBranch extends (...args: any[]) => infer False
          ? False
          : never)
      | undefined,
  };
}
