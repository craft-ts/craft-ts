import {
  YIELDABLE_VALUE,
  type NamedYieldableValue,
  type ServiceDependencyMapFromYielded,
} from '@craft-ts/core';
import type { Yieldable } from '@craft-ts/core';
import type {
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  IfNode,
} from './render/vnode';

type Condition<Name extends string> = NamedYieldableValue<Name, () => unknown>;

type BranchDependencies<Branch> = Branch extends (
  ...args: any[]
) => infer Output
  ? CraftNodeChildrenDependencies<Output>
  : {};

type ConditionDependencies<Condition> = Condition extends (
  ...args: any[]
) => Generator<infer Yielded, any, any>
  ? ServiceDependencyMapFromYielded<Yielded>
  : {};

/** Creates a conditionally rendered Craft template block. */
export function ifNode<
  Name extends string,
  TrueBranch extends () => CraftNodeChildren,
  FalseBranch extends (() => CraftNodeChildren) | undefined = undefined,
>(
  condition: Condition<Name>,
  whenTrue: TrueBranch,
  whenFalse?: FalseBranch,
): IfNode<
  Name,
  BranchDependencies<TrueBranch> | BranchDependencies<FalseBranch>,
  ReturnType<TrueBranch>,
  FalseBranch extends (...args: any[]) => infer False ? False : never
>;

export function ifNode<
  Name extends string,
  ConditionFactory extends Yieldable<[], unknown, any>,
  TrueBranch extends () => CraftNodeChildren,
  FalseBranch extends (() => CraftNodeChildren) | undefined = undefined,
>(
  conditionName: Name,
  condition: ConditionFactory,
  whenTrue: TrueBranch,
  whenFalse?: FalseBranch,
): IfNode<
  Name,
  ConditionDependencies<ConditionFactory> &
    (BranchDependencies<TrueBranch> | BranchDependencies<FalseBranch>),
  ReturnType<TrueBranch>,
  FalseBranch extends (...args: any[]) => infer False ? False : never
>;

export function ifNode(
  conditionOrName: Condition<string> | string,
  conditionOrWhenTrue:
    | Yieldable<[], unknown, any>
    | (() => CraftNodeChildren),
  whenTrueOrFalse:
    | (() => CraftNodeChildren)
    | (() => CraftNodeChildren)
    | undefined,
  whenFalse?: (() => CraftNodeChildren) | undefined,
): IfNode<any, any, any, any> {
  const hasExplicitName = typeof conditionOrName === 'string';
  const condition = hasExplicitName
    ? conditionOrWhenTrue
    : conditionOrName;
  const whenTrue = hasExplicitName
    ? whenTrueOrFalse
    : conditionOrWhenTrue;
  const falseBranch = hasExplicitName ? whenFalse : whenTrueOrFalse;
  const conditionName = hasExplicitName
    ? conditionOrName
    : getConditionName(condition);

  if (typeof condition !== 'function' || typeof whenTrue !== 'function') {
    throw new Error('ifNode(...) requires a condition and a true branch.');
  }

  return {
    kind: 'if',
    condition: condition as () => boolean,
    conditionName,
    whenTrue: whenTrue as () => CraftNodeChildren,
    whenFalse: falseBranch as (() => CraftNodeChildren) | undefined,
  };
}

function getConditionName(condition: unknown): string {
  const conditionName = (
    condition as unknown as {
      readonly [YIELDABLE_VALUE]?: unknown;
    }
  )[YIELDABLE_VALUE];
  if (typeof conditionName !== 'string') {
    throw new Error(
      'ifNode(...) requires a named Craft reactive value as its condition.',
    );
  }
  return conditionName;
}
