import {
  craftComputed,
  craftMethod,
  craftService,
  on$,
  queryParams,
  source$,
  state,
  craftPrivate,
  craftExpose,
} from '@craft-ts/core';
import {
  initialDirectionFilter,
  initialKindFilter,
  initialStateFilter,
  isDirectionFilter,
  isKindFilter,
  isStateFilter,
  stringQueryParamCodec,
} from './devtool-view-state';

/**
 * The queue's filter bar, as one unit: five independent filters and the
 * single event that clears all of them together.
 *
 * `activeFilterCount` lives here rather than beside `cards` in
 * `review-app.ts` because it only reads these five states — it never needs
 * the subject list, so it does not need to leave this service to be computed.
 */
export const { ReviewFilters } = craftService(
  { name: 'ReviewFilters', providedIn: 'global' },
  function* () {
    const clearFilters$ = source$<void>('clearFilters$');

    const componentFilter = yield* state(
      'componentFilter',
      '',
      ({ set }) => ({
        writeFromInput: (value: string) => set(value),
        clearFromFilterEvent: on$(clearFilters$, () => set('')),
      }),
    );
    const textParams = yield* craftPrivate(queryParams(
      'reviewTextFilter',
      {
        state: {
          text: { fallbackValue: '', codec: stringQueryParamCodec },
        },
      },
      ({ patch }) => ({
        writeFromInput: function* (value: string) {
          yield* patch({ text: value }, { replaceUrl: true });
        },
        clearText: function* () {
          yield* patch({ text: '' }, { replaceUrl: true });
        },
      }),
    ));
    const textFilter = textParams.text;
    // Each `chooseFromInput` takes the raw select value and no-ops on
    // anything unexpected, so a template's change handler stays a single
    // yield with no local guard.
    const kindFilter = yield* state(
      'kindFilter',
      initialKindFilter(),
      ({ set }) => ({
        chooseFromInput: (value: string) => {
          if (isKindFilter(value)) set(value);
        },
        clearFromFilterEvent: on$(clearFilters$, () => set('all')),
      }),
    );
    const stateFilter = yield* state(
      'stateFilter',
      initialStateFilter(),
      ({ set }) => ({
        chooseFromInput: (value: string) => {
          if (isStateFilter(value)) set(value);
        },
        clearFromFilterEvent: on$(clearFilters$, () => set('all')),
      }),
    );
    const directionFilter = yield* state(
      'directionFilter',
      initialDirectionFilter(),
      ({ set }) => ({
        chooseFromInput: (value: string) => {
          if (isDirectionFilter(value)) set(value);
        },
        clearFromFilterEvent: on$(clearFilters$, () => set('all')),
      }),
    );

    const clearFilters = yield* craftMethod('clearFilters', function* () {
      clearFilters$.emit();
      yield* textParams.clearText();
    });

    const activeFilterCount = yield* craftComputed('activeFilterCount', function* () {
      let count = 0;
      if ((yield* componentFilter()).trim()) count += 1;
      if ((yield* textFilter()).trim()) count += 1;
      if ((yield* kindFilter()) !== 'all') count += 1;
      if ((yield* stateFilter()) !== 'all') count += 1;
      if ((yield* directionFilter()) !== 'all') count += 1;
      return count;
    });

    yield* craftExpose('textFilter', textFilter);
    yield* craftExpose('writeTextFilter', textParams.writeFromInput);
  },
);
