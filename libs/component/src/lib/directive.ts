import {
  CRAFT_DIRECTIVE,
  type CraftDirective,
  type LogicDecorator,
  type TemplateDecorator,
} from './types';

/**
 * Decorates a Craft component's factory and template as one reusable unit.
 * Directives are applied from left to right by a component's `.pipe(...)`.
 */
export function craftDirective<
  Logic extends LogicDecorator,
  Template extends TemplateDecorator,
>(logic: Logic, template: Template): CraftDirective<Logic, Template> {
  const directive = (() => undefined) as unknown as CraftDirective<
    Logic,
    Template
  >;

  Object.defineProperty(directive, CRAFT_DIRECTIVE, {
    value: { logic, template },
    enumerable: false,
  });

  return directive;
}
