import type { CraftDomAdapter } from '@craft-ts/core';
import { CRAFT_COMPONENT } from '../types';

/** Versioned contract between the optional build tool and the renderer. */
export interface CompiledTemplatePlan {
  readonly version: 1;
  readonly create: (renderer: CraftDomAdapter) => Node[];
  readonly locate?: (root: Node) => Node[];
  readonly bind: (inputs: any) => readonly unknown[];
  readonly elements: readonly {
    readonly slot: number;
    readonly path: readonly number[];
    readonly name?: string;
  }[];
  readonly bindings: readonly {
    readonly slot: number;
    readonly key?: string;
    readonly indirect?: boolean;
    readonly input?: string;
    readonly path: readonly number[];
  }[];
}

const templates = new WeakMap<
  object,
  {
    readonly template: unknown;
    readonly plan: CompiledTemplatePlan;
  }
>();

/** Internal compiler ABI. Returns the original definition, including its types. */
export function ɵwithCompiledTemplate<Component extends object>(
  component: Component,
  plan: CompiledTemplatePlan,
): Component {
  const definition = (component as any)[CRAFT_COMPONENT];
  if (definition && plan.version === 1) {
    templates.set(component, { template: definition.template, plan });
  }
  return component;
}

export function compiledTemplateFor(
  component: object,
): CompiledTemplatePlan | undefined {
  const entry = templates.get(component);
  return entry?.template === (component as any)[CRAFT_COMPONENT]?.template
    ? entry?.plan
    : undefined;
}

const itemComponents = new WeakMap<Function, object>();

/** Internal compiler ABI: the transform has proved that this factory only forwards inputs. */
export function ɵwithCompiledItem<Factory extends Function>(
  factory: Factory,
  component: object,
): Factory {
  itemComponents.set(factory, component);
  return factory;
}

export function compiledItemComponent(factory: Function): object | undefined {
  return itemComponents.get(factory);
}

const blueprints = new WeakMap<
  CraftDomAdapter,
  WeakMap<CompiledTemplatePlan, Node>
>();

/** Blueprints contain no live bindings, replay records, scopes or instance data. */
export function createCompiledNodes(
  plan: CompiledTemplatePlan,
  renderer: CraftDomAdapter,
): Node[] {
  if (!plan.locate || !renderer.cloneNode) return plan.create(renderer);
  let plans = blueprints.get(renderer);
  if (!plans) blueprints.set(renderer, (plans = new WeakMap()));
  let root = plans.get(plan);
  if (!root) {
    root = plan.create(renderer)[0];
    plans.set(plan, root);
  }
  return plan.locate(renderer.cloneNode(root));
}
