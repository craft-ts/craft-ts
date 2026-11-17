import {
  executeYieldable,
  ɵIDENTITY_FN_ADAPTER,
  ɵreadServiceMember,
  ɵSERVICE_MEMBER_UNREAD,
  type CraftDomAdapter,
} from '@craft-ts/core';
import type { Injector } from '../host-runtime';
import { CRAFT_COMPONENT } from '../types';

/** Versioned contract between the optional build tool and the renderer. */
export interface CompiledTemplatePlan {
  readonly version: 1;
  /**
   * Light instances: no injector, input proxy, render context, replay record
   * or registry entry of their own. Opt-in trade-off made by the build.
   */
  readonly lean?: boolean;
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
    /** The build rewrote the generator into a plain function reading with {@link ɵy}. */
    readonly lowered?: boolean;
    readonly input?: string;
    readonly path: readonly number[];
  }[];
  /** Listeners, read after the bindings in what `bind` returns. */
  readonly events?: readonly {
    readonly slot: number;
    readonly event: string;
    readonly tag: string;
    readonly name?: string;
  }[];
  /**
   * Children rendered by the generic renderer, read after the listeners:
   * mounted in `parent`, before the slot `before` (-1: at the end).
   */
  readonly holes?: readonly {
    readonly parent: number;
    readonly before: number;
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

/** The injector a light binding evaluates in, while it evaluates. */
export const leanReadScope: { injector: Injector | undefined } = {
  injector: undefined,
};

/**
 * Internal compiler ABI: what `yield* value` evaluates to in a binding the
 * build rewrote into a plain function. A settled read hands its value back at
 * once; any other generator is driven like the generator it replaced.
 */
export function ɵy(value: unknown): unknown {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof (value as { next?: unknown }).next !== 'function'
  )
    return value;
  if ((value as { done?: unknown }).done === true)
    return (value as { value: unknown }).value;
  const injector = leanReadScope.injector;
  if (!injector)
    throw new Error('A compiled binding was read outside of its component.');
  return executeYieldable(
    () => value as Generator,
    [],
    injector as never,
    ɵIDENTITY_FN_ADAPTER,
  );
}

/**
 * Internal compiler ABI: `yield* reference.key()` in a rewritten binding. A
 * service member is read directly; anything else is called and driven like
 * the generator it was.
 */
export function ɵys(reference: unknown, key: string): unknown {
  const injector = leanReadScope.injector;
  if (injector) {
    const value = ɵreadServiceMember(reference, key, injector as never);
    if (value !== ɵSERVICE_MEMBER_UNREAD) return value;
  }
  return ɵy((reference as Record<string, () => unknown>)[key]());
}
