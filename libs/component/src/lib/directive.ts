import {
  CRAFT_DIRECTIVE,
  type CraftDirective,
  type DirectiveMeta,
  type LogicDecorator,
  type TemplateDependencies,
  type TemplateDecorator,
} from './types';

type DirectiveTemplateDependencies<Template> = Template extends (
  ...args: any[]
) => infer DecoratedTemplate
  ? TemplateDependencies<DecoratedTemplate>
  : {};

/**
 * Decorates a Craft component's factory and template as one reusable unit.
 * Directives are applied from left to right by a component's `.pipe(...)`.
 */
export function craftDirective<
  const Name extends string,
  const Meta extends DirectiveMeta,
  Logic extends LogicDecorator,
  const Template extends TemplateDecorator,
>(
  name: Name,
  meta: Meta,
  logic: Logic,
  template: Template,
): CraftDirective<Logic, Template, DirectiveTemplateDependencies<Template>> {
  const directive = (() => undefined) as unknown as CraftDirective<
    Logic,
    Template,
    DirectiveTemplateDependencies<Template>
  >;

  const definition = { name, meta, logic, template };
  Object.defineProperty(directive, CRAFT_DIRECTIVE, {
    value: definition,
    enumerable: false,
  });

  return directive;
}
