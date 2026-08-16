import type {
  AngularComponentNode,
  AngularDirectiveNode,
} from './render/vnode';

export interface AngularMountOptions {
  readonly injector?: object;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly outputs?: Readonly<Record<string, (value: unknown) => unknown>>;
  readonly directives?: readonly AngularDirectiveNode[];
}

export function angular(
  component: unknown,
  options: AngularMountOptions = {},
): AngularComponentNode {
  return {
    kind: 'angular',
    component: component as AngularComponentNode['component'],
    injector: options.injector as AngularComponentNode['injector'],
    inputs: options.inputs ?? {},
    outputs: options.outputs ?? {},
    directives: options.directives ?? [],
  };
}

export function directive(
  type: unknown,
  options: Omit<AngularMountOptions, 'directives'> = {},
): AngularDirectiveNode {
  return {
    type: type as AngularDirectiveNode['type'],
    inputs: options.inputs,
    outputs: options.outputs,
  };
}
