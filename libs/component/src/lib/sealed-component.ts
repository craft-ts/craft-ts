import type { CraftChannels } from '@craft-ts/core';
import {
  type ComponentFactory,
  type ComponentMeta,
  type ComponentTemplate,
  type CraftComponent,
  type TemplateChildren,
} from './types';
import type {
  ComponentTemplateChannels,
  CraftNodeChildrenHandledExceptionCodes,
  CraftNodeChildrenHeadingNeed,
  SealedTemplateOutput,
} from './render/vnode';

/**
 * The summary of a template, as its parent reads it: the dependency map the
 * component already sealed, its channels, its heading need and the exception
 * codes it handles.
 */
type SealedOutputOf<
  Template,
  TemplateDependencies extends object,
> =
  ComponentTemplateChannels<Template> extends infer Channels extends
    CraftChannels
    ? SealedTemplateOutput<
        TemplateDependencies,
        Channels,
        // Rebuilt inline (see `SealDependencyMapOf` in core): a union produced
        // by an alias such as `Extract<…>` keeps that alias's arguments —
        // here, the template itself.
        CraftNodeChildrenHeadingNeed<
          TemplateChildren<Template>
        > extends infer Need
          ? Need extends string
            ? Need
            : never
          : never,
        CraftNodeChildrenHandledExceptionCodes<
          TemplateChildren<Template>
        > extends infer Code
          ? Code extends string
            ? Code
            : never
          : never
      >
    : never;

/** A sealed factory that renders directly. */
export interface SealedDirectFactory<Args extends any[], Output> {
  (...args: Args): Output;
}

/** A sealed factory that drives a generator. */
export interface SealedGeneratorFactory<
  Args extends any[],
  Yielded,
  Output,
  Next,
> {
  (...args: Args): Generator<Yielded, Output, Next>;
}

/**
 * The same factory — same inputs, same yields — rendering the summary instead
 * of the tree. Keeping the inputs keeps the props, the content requirements
 * and the projection contract; keeping the yields keeps every recomputation
 * `.pipe(...)` does from them (service dependencies, initialization
 * exceptions) identical to the unsealed component's.
 *
 * Interfaces, not function type literals: the return type of a function type
 * literal is only resolved when something asks for it, through every mapper
 * that led there. A parent would then resolve its sealed child's return type,
 * which resolves the grandchild's, one level of nesting per component, until
 * TypeScript reports TS2589 — the very depth sealing removes. An interface
 * reference holds resolved arguments only.
 */
type SealedFactory<Factory, Output> = Factory extends (
  ...args: infer Args
) => infer Result
  ? [Result] extends [Generator<infer Yielded, any, infer Next>]
    ? SealedGeneratorFactory<Args, Yielded, Output, Next>
    : SealedDirectFactory<Args, Output>
  : Factory;

/**
 * A component whose type keeps everything a parent checks, and nothing of the
 * tree its template renders.
 *
 * Kept: props and inputs, the dependency contract (so `RouteCheckedDI` still
 * proves the component and every parent), initialization and field exceptions
 * (still refused until a `catchNode` / `fieldErrorNode` handles them), the
 * heading need (still refused outside a `headingSection`), style channels,
 * content requirements, the projection contract and `.pipe(...)`.
 *
 * Dropped: the shape of the rendered tree. A parent no longer re-expands it
 * when it renders, compares (`cond ? A() : B()`, a slot, a `forNode` row) or
 * exports the component, so the cost of a composition stops depending on how
 * deep the tree is (issue #40), and a declaration file can name the type
 * again (no TS7056). The one feature that reads that shape \u2014 typed locators
 * and template contracts reaching *into* the component \u2014 stops at a sealed
 * boundary.
 *
 * Obtain it with {@link sealComponent}; never write the `CraftComponent<\u2026>`
 * arguments by hand \u2014 `CraftComponent<Props>` drops the contract, and DI
 * proofs refuse it.
 */
export type SealedComponent<Component> =
  Component extends CraftComponent<
    infer Props,
    infer ComponentDeps,
    infer Factory extends ComponentFactory,
    infer Meta extends ComponentMeta,
    infer RootFactory extends ComponentFactory,
    infer TemplateDependencies extends object,
    infer Template extends ComponentTemplate,
    infer Name extends string,
    infer InitializationExceptions extends string,
    infer ContentRequirements extends object,
    infer FieldExceptions
  >
    ? SealedCraftComponent<
        Props,
        ComponentDeps,
        Factory,
        Meta,
        RootFactory,
        TemplateDependencies,
        Template,
        Name,
        InitializationExceptions,
        ContentRequirements,
        FieldExceptions
      >
    : {
        readonly ERROR_sealComponent_expects_a_craftComponent: Component;
      };

/**
 * {@link SealedComponent} from the arguments of the component type itself.
 *
 * `sealComponent` reaches it through the inference of its own type
 * parameters, which reads a component's arguments directly. Reading them
 * through a conditional `infer` instead makes TypeScript verify the match
 * structurally — call signature, `.pipe(...)` and all — which costs as much as
 * the composition the seal is meant to make cheap.
 */
export type SealedCraftComponent<
  Props extends object,
  ComponentDeps extends object,
  Factory extends ComponentFactory,
  Meta extends ComponentMeta,
  RootFactory extends ComponentFactory,
  TemplateDependencies extends object,
  Template extends ComponentTemplate,
  Name extends string,
  InitializationExceptions extends string,
  ContentRequirements extends object,
  FieldExceptions,
> =
  SealedOutputOf<Template, TemplateDependencies> extends infer Output
    ? [
        SealedFactory<Factory, Output>,
        SealedFactory<RootFactory, Output>,
        SealedFactory<Template, Output>,
      ] extends [
        infer SealedFactoryType extends ComponentFactory,
        infer SealedRootFactory extends ComponentFactory,
        infer SealedTemplate extends ComponentTemplate,
      ]
      ? CraftComponent<
          Props,
          ComponentDeps,
          SealedFactoryType,
          Meta,
          SealedRootFactory,
          TemplateDependencies,
          SealedTemplate,
          Name,
          InitializationExceptions,
          ContentRequirements,
          FieldExceptions
        >
      : never
    : never;

/**
 * Seals a component at a composition boundary (see {@link SealedComponent}).
 *
 * The component itself is returned untouched: sealing only changes what its
 * type remembers. It is one remedy for TS2589, TS2321 or TS7056 on a component
 * tree, applied where the component crosses a boundary — a slot, a `forNode`
 * row, the branches of a condition, a library's public index. Keep the
 * definition plain so its own tests keep typed content locators:
 *
 *   // workspace-browser.ts
 *   export const WorkspaceBrowser = craftComponent('WorkspaceBrowser', { … }, function* () { … });
 *   // shell.ts
 *   const SealedWorkspaceBrowser = sealComponent(WorkspaceBrowser);
 */
export function sealComponent<
  Props extends object,
  ComponentDeps extends object,
  Factory extends ComponentFactory,
  Meta extends ComponentMeta,
  RootFactory extends ComponentFactory,
  TemplateDependencies extends object,
  Template extends ComponentTemplate,
  Name extends string,
  InitializationExceptions extends string,
  ContentRequirements extends object,
  FieldExceptions,
>(
  component: CraftComponent<
    Props,
    ComponentDeps,
    Factory,
    Meta,
    RootFactory,
    TemplateDependencies,
    Template,
    Name,
    InitializationExceptions,
    ContentRequirements,
    FieldExceptions
  >,
): SealedCraftComponent<
  Props,
  ComponentDeps,
  Factory,
  Meta,
  RootFactory,
  TemplateDependencies,
  Template,
  Name,
  InitializationExceptions,
  ContentRequirements,
  FieldExceptions
> {
  return component as never;
}
