import {
  CRAFT_DIRECTIVE,
  type CraftDirective,
  type ComponentOperatorDefinition,
  type DirectiveMeta,
  type DirectiveTransforms,
  type TemplateDependencies,
  type TemplateDecorator,
} from './types';
import { CRAFT_REGISTRATION_TARGET } from '@craft-ts/core';
import { CRAFT_NODE_DIRECTIVE } from '@craft-ts/core';

type DirectiveTemplateDependencies<Template> = Template extends (
  ...args: any[]
) => infer DecoratedTemplate
  ? TemplateDependencies<DecoratedTemplate>
  : {};

type DirectiveTemplateOf<Transforms> = Transforms extends {
  readonly template: infer Template;
}
  ? Template
  : TemplateDecorator;

/**
 * A reusable transformation of a component: what a service does, what the
 * component renders, or both.
 *
 * Directives are applied from left to right by `.pipe(...)`, on a component (the
 * component's own scope) or on a node (that subtree only).
 */
export function craftDirective<
  const Name extends string,
  const Meta extends DirectiveMeta,
  const Transforms extends DirectiveTransforms,
>(
  name: Name,
  meta: Meta,
  transforms: Transforms,
  componentOperator?: ComponentOperatorDefinition,
): CraftDirective<
  DirectiveTemplateOf<Transforms> & ((base: any) => any),
  DirectiveTemplateDependencies<DirectiveTemplateOf<Transforms>>
> {
  type Directive = CraftDirective<
    DirectiveTemplateOf<Transforms> & ((base: any) => any),
    DirectiveTemplateDependencies<DirectiveTemplateOf<Transforms>>
  >;
  const directive = (() => undefined) as unknown as Directive;

  const service = transforms.service
    ? Array.isArray(transforms.service)
      ? [...transforms.service]
      : [transforms.service]
    : [];

  const definition = {
    name,
    meta,
    service,
    template: transforms.template,
    componentOperator,
  };
  Object.defineProperty(directive, CRAFT_DIRECTIVE, {
    value: definition,
    enumerable: false,
  });

  Object.defineProperty(directive, CRAFT_REGISTRATION_TARGET, {
    value: { kind: 'directive', name },
    enumerable: false,
  });

  if (meta.node) {
    Object.defineProperty(directive, CRAFT_NODE_DIRECTIVE, {
      value: {
        name,
        inputs: meta.node.inputs ?? [],
        mount: meta.node.mount,
      },
      enumerable: false,
    });
  }

  return directive;
}
