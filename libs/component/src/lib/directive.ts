import {
  CRAFT_DIRECTIVE,
  type CraftDirective,
  type DirectiveMeta,
  type LogicDecorator,
  type TemplateDecorator,
} from './types';

/**
 * Decorates a Craft component's factory and template as one reusable unit.
 * Directives are applied from left to right by a component's `.pipe(...)`.
 */
export function craftDirective<
  const Name extends string,
  const Meta extends DirectiveMeta,
  Logic extends LogicDecorator,
  Template extends TemplateDecorator,
>(
  name: Name,
  meta: Meta,
  logic: Logic,
  template: Template,
): CraftDirective<Logic, Template> {
  const directive = (() => undefined) as unknown as CraftDirective<
    Logic,
    Template
  >;

  const definition = { name, meta, logic, template };
  Object.defineProperty(directive, CRAFT_DIRECTIVE, {
    value: definition,
    enumerable: false,
  });

  return directive;
}
