export type {
  SendContextTheme,
  SendContextColors,
} from './lib/ai/send-context-theme';
export * from './lib/ai/ai-context-menu';
export * from './lib/ai/ai-send-dialog';
export * from './lib/ai/ai-send-context-chat';
export * from './lib/ai/ai-send-context-launcher';
export * from './lib/ai/send-context-prompt';
export * from './lib/ai/debug-session-replay';
export * from './lib/ai/debug-session-orchestrator';
export * from './lib/ai/debug-session-app-snapshot';
export * from './lib/ai/debug-session-thumbnail-plan';
export * from './lib/ai/debug-session-scenario';
export * from './lib/ai/debug-session-replay-signals';
export * from './lib/ai/debug-session-replay-bridge';
export * from './lib/ai/guided-resume';
export * from './lib/ai/send-context-ui.tokens';
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
// Side-effect only: the router resolves them through the generated services.
import './lib/craft-defaults';
export * from './lib/component';
export * from './lib/security';
export * from './lib/composition';
export * from './lib/catch-node';
export * from './lib/pending-node';
export * from './lib/field-error-node';
export * from './lib/match-node';
export * from './lib/directive';
export {
  eventAction,
  type EventActionOptions,
  type EventActions,
} from './lib/event-action';
export * from './lib/craft-router-outlet';
export * from './lib/defer-node';
export * from './lib/for-node';
export * from './lib/for-scheduling';
export * from './lib/if-node';
export * from './lib/project';
export * from './lib/template';
export * from './lib/hyperscript';
export * from './lib/a11y';
export * from './lib/a11y-control';
export * from './lib/testing';
export * from './lib/testing-stability';
export * from './lib/loop-guard-banner';
export {
  captureDebugSessionEnvironment,
  environmentDifferences,
  identifyBrowser,
} from './lib/ai/debug-session-environment';
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
  Output,
  PropsOf,
  TemplateDecorator,
  DirectiveTransforms,
  ComponentMeta,
  DirectiveMeta,
  CraftDirectiveTemplateDependencies,
  ComponentTemplateOf,
  ComponentTemplateNameOf,
  TemplateChildren,
  YieldableTemplateCallback,
  YieldableTemplateContext,
  TemplateMethodUse,
  ComponentNameOf,
  ComponentInitializationExceptionsOf,
  ComponentFieldExceptionsOf,
  ComponentInitializationExceptionCodes,
  ContentSlot,
  ContentRequirement,
  ContentRequirementOf,
  ContentRequirementsOfContext,
  ContentSelector,
  ContentSelectorCondition,
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
export { projection } from './lib/types';
export type {
  TemplateRenderAvailableActionWhen,
  TemplateRendersNamedElementWhen,
  TemplateRendersStateWhen,
} from './lib/template-contract';
export type {
  CraftNode,
  CraftNodeChild,
  CraftNodeChildren,
  CraftNodeChildrenDependencies,
  CraftNodeDependencies,
  IfNode,
  CatchNode,
  MatchNode,
  TemplateNode,
} from './lib/render/vnode';
