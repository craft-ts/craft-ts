import type { Type } from '@angular/core';
import type {
  AngularComponentNode,
  AngularDirectiveNode,
} from './render/vnode';

export interface AngularMountOptions {
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly outputs?: Readonly<Record<string, (value: unknown) => unknown>>;
  readonly directives?: readonly AngularDirectiveNode[];
}

export function angular(
  component: Type<unknown>,
  options: AngularMountOptions = {},
): AngularComponentNode {
  return {
    kind: 'angular',
    component,
    inputs: options.inputs ?? {},
    outputs: options.outputs ?? {},
    directives: options.directives ?? [],
  };
}

export function directive(
  type: Type<unknown>,
  options: Omit<AngularMountOptions, 'directives'> = {},
): AngularDirectiveNode {
  return {
    type,
    inputs: options.inputs,
    outputs: options.outputs,
  };
}
