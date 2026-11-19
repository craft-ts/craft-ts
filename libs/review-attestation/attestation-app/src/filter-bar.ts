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
import { craftComputed, craftService } from '@craft-ts/core';
import { eventValue } from './annotation-text';
import { MESSAGES } from './messages';
import { ReviewPreferences } from './preferences.service';
import { ReviewFilters } from './review-filters.service';
import { filters } from './review-controls.style';

const { FilterBarActionsView } = craftService(
  { name: 'FilterBarActionsView', providedIn: 'global' },
  function* () {
    const { activeFilterCount } = yield* ReviewFilters();
    const { locale } = yield* ReviewPreferences();
    yield* craftComputed('statusText', function* () {
      return MESSAGES[yield* locale()].activeFilters(
        yield* activeFilterCount(),
      );
    });
  },
);

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
    return div({ class: filters.actions }, [
      small({ class: filters.status, 'aria-live': 'polite' }, function* () {
        return yield* (yield* FilterBarActionsView()).statusText();
      }),
      button(
        'ClearFilters',
        {
          type: 'button',
          class: filters.clear,
          disabled: function* () {
            return (yield* (yield* ReviewFilters()).activeFilterCount()) === 0;
          },
          click: ReviewFilters.clearFilters,
        },
        function* () {
          return MESSAGES[yield* (yield* ReviewPreferences()).locale()].clearFilters;
        },
      ),
    ]);
  },
);

/** The five independent fields of the queue's filter bar. */
export const FilterBarFields = craftComponent(
  'FilterBarFields',
  {},
  function* () {
    return [
      div({ class: filters.field }, [
        label(
          { class: filters.label, htmlFor: 'component-filter' },
          function* () {
            return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterComponent;
          },
        ),
        input('ComponentFilter', {
          class: filters.control,
          id: 'component-filter',
          value: function* () {
            return yield* (yield* ReviewFilters()).componentFilter();
          },
          placeholder: 'UserCard',
          *input(event: Event) {
            yield* (yield* ReviewFilters()).componentFilter.writeFromInput(eventValue(event));
          },
        }),
      ]),
      div({ class: filters.field }, [
        label({ class: filters.label, htmlFor: 'kind-filter' }, function* () {
          return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterType;
        }),
        select(
          'KindFilter',
          {
            class: filters.control,
            id: 'kind-filter',
            value: function* () {
              return yield* (yield* ReviewFilters()).kindFilter();
            },
            *change(event: Event) {
              yield* (yield* ReviewFilters()).kindFilter.chooseFromInput(eventValue(event));
            },
          },
          [
            option({ value: 'all' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterAll;
            }),
            option({ value: 'visual' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterVisual;
            }),
            option({ value: 'template' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterTemplate;
            }),
            option({ value: 'removal' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterRemoved;
            }),
          ],
        ),
      ]),
      div({ class: filters.field }, [
        label({ class: filters.label, htmlFor: 'state-filter' }, function* () {
          return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterState;
        }),
        select(
          'StateFilter',
          {
            class: filters.control,
            id: 'state-filter',
            value: function* () {
              return yield* (yield* ReviewFilters()).stateFilter();
            },
            *change(event: Event) {
              yield* (yield* ReviewFilters()).stateFilter.chooseFromInput(eventValue(event));
            },
          },
          [
            option({ value: 'all' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterAll;
            }),
            option({ value: 'current' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterCurrent;
            }),
            option({ value: 'renewed' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterRenewed;
            }),
            option({ value: 'missing' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterMissing;
            }),
            option({ value: 'review' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterReview;
            }),
            option({ value: 'removed' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterRemoved;
            }),
          ],
        ),
      ]),
      div({ class: filters.field }, [
        label(
          { class: filters.label, htmlFor: 'direction-filter' },
          function* () {
            return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterDirection;
          },
        ),
        select(
          'DirectionFilter',
          {
            class: filters.control,
            id: 'direction-filter',
            value: function* () {
              return yield* (yield* ReviewFilters()).directionFilter();
            },
            *change(event: Event) {
              yield* (yield* ReviewFilters()).directionFilter.chooseFromInput(eventValue(event));
            },
          },
          [
            option({ value: 'all' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterAll;
            }),
            option({ value: 'render' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterRender;
            }),
            option({ value: 'command' }, function* () {
              return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterCommand;
            }),
          ],
        ),
      ]),
      div({ class: filters.field }, [
        label({ class: filters.label, htmlFor: 'text-filter' }, function* () {
          return MESSAGES[yield* (yield* ReviewPreferences()).locale()].filterText;
        }),
        input('TextFilter', {
          class: filters.control,
          id: 'text-filter',
          value: function* () {
            return yield* (yield* ReviewFilters()).textFilter();
          },
          placeholder: 'save',
          *input(event: Event) {
            yield* (yield* ReviewFilters()).writeTextFilter(eventValue(event));
          },
        }),
      ]),
    ];
  },
);
