export * from './lib/ai/ai-context-menu';
export * from './lib/ai/ai-send-dialog';
export * from './lib/ai/send-context-to-ai';
export * from './lib/assert-defined-input';
export * from './lib/bridge';
export { bootstrapCraft, type CraftAppRef } from './lib/bootstrap';
export * from './lib/server-render';
export * from './lib/hydrate';
export * from './lib/start';
export * from './lib/render/hydration';
export { createStringDomAdapter } from './lib/render/string-dom';
// Registers Craft's default pending loader and lazy-route recovery host.
// Side-effect only: nothing needs to name them, the router resolves them
// through CRAFT_PENDING_COMPONENT / CRAFT_ROUTE_LOAD_ERROR_COMPONENT.
import './lib/craft-defaults';
export * from './lib/component';
export * from './lib/css-vars';
export type {
  CssVarContract,
  CssVarsOf,
  CssVarsContractOfMeta,
  CssVarsAfterCall,
} from './lib/css-vars.type';
export * from './lib/composition';
export * from './lib/block';
export * from './lib/pending-block';
export * from './lib/field-exception-block';
export * from './lib/match-block';
export * from './lib/directive';
export * from './lib/craft-router-outlet';
export * from './lib/defer';
export * from './lib/each';
export * from './lib/each-scheduling';
export * from './lib/if-block';
export * from './lib/project';
export * from './lib/template';
export * from './lib/hyperscript';
export * from './lib/a11y';
export * from './lib/a11y-control';
export * from './lib/render/style-registry';
export * from './lib/testing';
export type {
  CraftLocatorResult,
  CraftTemplateLocatorApi,
  LocatorCriteria,
  LocatorCriteriaFor,
  LocatorContentNamesFor,
  MaybeDefined,
  StaticLocatorCriteria,
  TemplateLocatorCandidates,
} from './lib/locator';
export * from './lib/template-contract';
export type {
  ComponentFactory,
  ComponentTemplate,
  CraftDirective,
  CraftComponent,
  HostRequiredLogic,
  HostTemplate,
  Input,
  InputValue,
  LogicDecorator,
  Output,
  PropsOf,
  TemplateDecorator,
  ComponentMeta,
  DirectiveMeta,
  CraftDirectiveTemplateDependencies,
  ComponentTemplateOf,
  ComponentTemplateNameOf,
  ComponentLogicOutputOf,
  YieldableTemplateCallback,
  YieldableTemplateContext,
  TemplateMethodUse,
  TemplateCssVars,
  ComponentCssVars,
  ComponentCssVarsOf,
  ComponentNameOf,
  ComponentInitializationExceptionsOf,
  ComponentFieldExceptionsOf,
  ComponentInitializationExceptionCodes,
  ContentOptions,
  ContentSlot,
  ContentRequirement,
  ContentRequirementOf,
  ContentRequirementsOfContext,
  ContentSelector,
  ContentSelectorCondition,
  ContentStyles,
  ContentStylePolicy,
  RequiredContent,
  RenderableContent,
  ProjectionContractOf,
  ProjectionOf,
  ProjectionSlot,
  ProjectionUnit,
  CraftTemplate,
  ContentDependencies,
  PropsFromFactory,
  CraftInputExceptionsCarrier,
  ComponentInputExceptionsOf,
} from './lib/types';
export type {
  TemplateRenderAvailableActionWhen,
  TemplateRendersNamedElementWhen,
  TemplateRendersStateWhen,
} from './lib/template-contract';
export type {
  CraftNode,
  CraftNodeChild,
  CraftNodeChildren,
  IfBlockNode,
  CatchBlockNode,
  MatchBlockNode,
  TemplateNode,
  CraftNodeCssVarsCarrier,
} from './lib/render/vnode';
export { CRAFT_NODE_CSS_VARS } from './lib/render/vnode';
