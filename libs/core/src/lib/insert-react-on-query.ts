import { effect } from './host/craft-compat';
import type { InsertionsStateFactory } from './query.core';
import {
  rawReactiveFacade,
  rawReactiveValue,
  type RawReactiveProperties,
  type YieldableReactiveValue,
} from './reactive-read';

/** Values visible to a state insertion reacting to a query update. */
export type ReactOnQueryContext<QueryValue, StateValue, Insertions> = {
  readonly queryValue: QueryValue;
  readonly stateValue: StateValue;
  readonly insertions: RawReactiveProperties<Insertions>;
};

/**
 * Reacts inside a state insertion to each available value from a query.
 * `filter` and `update` run in the reactive context, so reads such as a form's
 * `dirty()` state are tracked. The query value is ignored while unresolved.
 *
 * Use this for event-like synchronization from server state into local state.
 * For forms, call `form.reset(queryValue)` in `update` to accept the server
 * value and keep the form pristine.
 */
export function insertReactOnQuery<QueryValue, StateValue, Insertions>(
  query: {
    readonly value: YieldableReactiveValue<QueryValue | undefined>;
  },
  options: {
    readonly filter?: (
      context: ReactOnQueryContext<QueryValue, StateValue, Insertions>,
    ) => boolean;
    readonly update: (
      context: ReactOnQueryContext<QueryValue, StateValue, Insertions>,
    ) => unknown;
  },
): InsertionsStateFactory<StateValue, {}, Insertions> {
  return (context) => {
    const querySignal = rawReactiveValue(query.value);
    const stateSignal = rawReactiveValue(context.state);
    const insertions = rawReactiveFacade(context.insertions);

    effect(() => {
      const queryValue = querySignal();
      if (queryValue === undefined) return;

      const reactionContext = {
        queryValue,
        stateValue: stateSignal(),
        insertions,
      } as ReactOnQueryContext<QueryValue, StateValue, Insertions>;

      if (options.filter && !options.filter(reactionContext)) return;
      options.update(reactionContext);
    });

    return {};
  };
}
