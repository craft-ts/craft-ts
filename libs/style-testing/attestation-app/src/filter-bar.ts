import {
  button,
  craftComponent,
  div,
  input,
  label,
  option,
  select,
  small,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { eventValue } from './annotation-text';
import { MESSAGES } from './messages';
import { ReviewPreferences } from './preferences.service';
import { ReviewFilters } from './review-filters.service';

/**
 * The filter status and the button that clears every filter at once.
 *
 * Kept apart from `FilterBarFields` because it renders one level up in the
 * DOM (beside the section's `heading(...)`, which — being tracked by the
 * document outline at the type level — has to stay a direct call in
 * `review-app.ts` rather than move behind a component boundary).
 */
export const FilterBarActions = craftComponent(
  'FilterBarActions',
  {},
  function* () {
    const { clearFilters, activeFilterCount } = yield* ReviewFilters();
    const { locale } = yield* ReviewPreferences();
    const t = craftComputed('t', function* () {
      return MESSAGES[yield* locale()];
    });
    const statusText = craftComputed('statusText', function* () {
      return (yield* t()).activeFilters(yield* activeFilterCount());
    });
    const noFiltersActive = craftComputed('noFiltersActive', function* () {
      return (yield* activeFilterCount()) === 0;
    });
    return { clearFilters, statusText, noFiltersActive, t };
  },
  ({ clearFilters, statusText, noFiltersActive, t }) =>
    div({ class: 'filter-heading-actions' }, [
      small({ class: 'filter-status', 'aria-live': 'polite' }, statusText),
      button(
        'ClearFilters',
        {
          type: 'button',
          class: 'clear-filters',
          disabled: noFiltersActive,
          click: clearFilters,
        },
        function* () {
          return (yield* t()).clearFilters;
        },
      ),
    ]),
);

/** The five independent fields of the queue's filter bar. */
export const FilterBarFields = craftComponent(
  'FilterBarFields',
  {},
  function* () {
    const {
      componentFilter,
      textFilter,
      kindFilter,
      stateFilter,
      directionFilter,
    } = yield* ReviewFilters();
    const { locale } = yield* ReviewPreferences();
    const t = craftComputed('t', function* () {
      return MESSAGES[yield* locale()];
    });
    return {
      componentFilter,
      textFilter,
      kindFilter,
      stateFilter,
      directionFilter,
      t,
    };
  },
  ({
    componentFilter,
    textFilter,
    kindFilter,
    stateFilter,
    directionFilter,
    t,
  }) => [
    div({ class: 'filter-field' }, [
      label({ htmlFor: 'component-filter' }, function* () {
        return (yield* t()).filterComponent;
      }),
      input('ComponentFilter', {
        id: 'component-filter',
        value: componentFilter,
        placeholder: 'UserCard',
        *input(event: Event) {
          yield* componentFilter.writeFromInput(eventValue(event));
        },
      }),
    ]),
    div({ class: 'filter-field' }, [
      label({ htmlFor: 'kind-filter' }, function* () {
        return (yield* t()).filterType;
      }),
      select(
        'KindFilter',
        {
          id: 'kind-filter',
          value: kindFilter,
          *change(event: Event) {
            yield* kindFilter.chooseFromInput(eventValue(event));
          },
        },
        [
          option({ value: 'all' }, function* () {
            return (yield* t()).filterAll;
          }),
          option({ value: 'visual' }, function* () {
            return (yield* t()).filterVisual;
          }),
          option({ value: 'template' }, function* () {
            return (yield* t()).filterTemplate;
          }),
          option({ value: 'removal' }, function* () {
            return (yield* t()).filterRemoved;
          }),
        ],
      ),
    ]),
    div({ class: 'filter-field' }, [
      label({ htmlFor: 'state-filter' }, function* () {
        return (yield* t()).filterState;
      }),
      select(
        'StateFilter',
        {
          id: 'state-filter',
          value: stateFilter,
          *change(event: Event) {
            yield* stateFilter.chooseFromInput(eventValue(event));
          },
        },
        [
          option({ value: 'all' }, function* () {
            return (yield* t()).filterAll;
          }),
          option({ value: 'current' }, function* () {
            return (yield* t()).filterCurrent;
          }),
          option({ value: 'renewed' }, function* () {
            return (yield* t()).filterRenewed;
          }),
          option({ value: 'missing' }, function* () {
            return (yield* t()).filterMissing;
          }),
          option({ value: 'review' }, function* () {
            return (yield* t()).filterReview;
          }),
          option({ value: 'removed' }, function* () {
            return (yield* t()).filterRemoved;
          }),
        ],
      ),
    ]),
    div({ class: 'filter-field' }, [
      label({ htmlFor: 'direction-filter' }, function* () {
        return (yield* t()).filterDirection;
      }),
      select(
        'DirectionFilter',
        {
          id: 'direction-filter',
          value: directionFilter,
          *change(event: Event) {
            yield* directionFilter.chooseFromInput(eventValue(event));
          },
        },
        [
          option({ value: 'all' }, function* () {
            return (yield* t()).filterAll;
          }),
          option({ value: 'render' }, function* () {
            return (yield* t()).filterRender;
          }),
          option({ value: 'command' }, function* () {
            return (yield* t()).filterCommand;
          }),
        ],
      ),
    ]),
    div({ class: 'filter-field' }, [
      label({ htmlFor: 'text-filter' }, function* () {
        return (yield* t()).filterText;
      }),
      input('TextFilter', {
        id: 'text-filter',
        value: textFilter,
        placeholder: 'save',
        *input(event: Event) {
          yield* textFilter.writeFromInput(eventValue(event));
        },
      }),
    ]),
  ],
);
