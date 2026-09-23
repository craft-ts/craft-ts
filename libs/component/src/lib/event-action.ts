import { craftNodeDirective, type CraftNodeDirective } from '@craft-ts/core';

export const EVENT_ACTION = Symbol('craft-event-action');

export type EventActionOptions<EventType extends Event = Event> = {
  readonly action: (event: EventType) => unknown;
  readonly preventDefault?: boolean;
  readonly stopPropagation?: boolean;
  readonly stopImmediatePropagation?: boolean;
};

export type EventActions = {
  readonly [Name in keyof GlobalEventHandlersEventMap]?: EventActionOptions<
    GlobalEventHandlersEventMap[Name]
  >;
};

export type EventActionDirective = CraftNodeDirective<
  Readonly<Record<never, never>>
> & {
  readonly [EVENT_ACTION]: EventActions;
};

/** Binds an action and its DOM event modifiers to the same element listener. */
export function eventAction(actions: EventActions): EventActionDirective {
  const directive = craftNodeDirective<Readonly<Record<never, never>>>(
    'eventAction',
    [],
    () => undefined,
  ) as EventActionDirective;
  Object.defineProperty(directive, EVENT_ACTION, { value: actions });
  return directive;
}

export function isEventActionDirective(
  value: unknown,
): value is EventActionDirective {
  return typeof value === 'function' && EVENT_ACTION in value;
}
