import { InjectionToken, type Provider } from './host/craft-compat';

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
export const CRAFT_DOM_EVENT_HOOK = new InjectionToken<
  readonly CraftDomEventHook[]
>('CRAFT_DOM_EVENT_HOOK', {
  providedIn: 'root',
  factory: () => [],
  multi: true,
});

/** Register one composable DOM event hook. */
export function provideCraftDomEventHook(hook: CraftDomEventHook): Provider {
  return {
    provide: CRAFT_DOM_EVENT_HOOK,
    useValue: hook,
    multi: true,
  };
}
