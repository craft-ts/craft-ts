import { runInInjectionContext, type Injector, type Provider } from './host/craft-compat';
import { craftService } from './craft-service';

/** Metadata describing a DOM event bound from a Craft template. */
export interface CraftDomEvent {
  /** The native event received by the binding. */
  readonly event: Event;
  /** The normalized DOM event name, for example `click` or `mouseenter`. */
  readonly eventName: string;
  /** The element that owns the binding. */
  readonly element: Element;
  /** The element tag, normalized to lower case. */
  readonly elementTag: string;
  /** The optional local name passed to a named helper, for example `save`. */
  readonly elementName?: string;
  /** The Craft component whose template declared the element. */
  readonly componentName?: string;
  /** A stable descriptive key for the interaction location. */
  readonly interactionName: string;
}

/**
 * Cross-cutting behavior around a DOM action declared in a Craft template.
 *
 * Hooks compose in registration order. A hook must call `next()` to preserve
 * the original template action; it may also do work before or after it.
 */
export type CraftDomEventHook = (
  interaction: CraftDomEvent,
  next: () => unknown,
) => unknown;

/** All DOM hooks active in the current component injector. */
const craftDomEventHookService = craftService(
  { name: 'CraftDomEventHooks', providedIn: 'toProvide', collection: true },
  (inputs: { $provided?: CraftDomEventHook }) =>
    inputs.$provided ? [inputs.$provided] : [],
) as unknown as {
  provideCraftDomEventHooks: (value?: CraftDomEventHook) => unknown;
  CRAFT_DOM_EVENT_HOOKS_META_DATA: {
    inject(): readonly CraftDomEventHook[];
  };
};

export const ɵinjectCraftDomEventHooks = (
  injector?: Injector,
): readonly CraftDomEventHook[] => {
  try {
    return injector
      ? runInInjectionContext(injector, () =>
          craftDomEventHookService.CRAFT_DOM_EVENT_HOOKS_META_DATA.inject(),
        )
      : craftDomEventHookService.CRAFT_DOM_EVENT_HOOKS_META_DATA.inject();
  } catch {
    return [];
  }
};

/** Register one composable DOM event hook. */
export function provideCraftDomEventHook(hook: CraftDomEventHook): Provider {
  return craftDomEventHookService.provideCraftDomEventHooks(hook) as Provider;
}
