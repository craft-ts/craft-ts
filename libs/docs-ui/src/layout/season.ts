import {
  button,
  craftComponent,
  div,
  span,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import { craftExpose, craftService, state } from '@craft-ts/core';
import { iconButtonUi } from '../button/button.style.ts';
import {
  isSeasonChoice,
  resolveSeason,
  SEASON_CHOICES,
  SEASON_STORAGE_KEY,
  type Season,
  type SeasonChoice,
  type SeasonNames,
} from '../foundation/season.ts';
import { DocIcon, type IconName } from '../icon/icon.ts';
import { DocMenuView, provideDocMenuView } from '../menu/menu.ts';
import { menuUi } from '../menu/menu.style.ts';

const stored = (): SeasonChoice | undefined => {
  try {
    const value = globalThis.localStorage?.getItem(SEASON_STORAGE_KEY);
    return isSeasonChoice(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Writes a choice where the page and the next visit can see it: `data-season` on the
 * root, which every colour and every drawing answers, and storage. "Automatic" stores
 * nothing, so the date keeps deciding. Storage is a browser boundary and may be
 * refused: then the choice lasts for this visit.
 */
const apply = (choice: SeasonChoice): SeasonChoice => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-season', resolveSeason(choice));
  }
  try {
    if (choice === 'auto') globalThis.localStorage?.removeItem(SEASON_STORAGE_KEY);
    else globalThis.localStorage?.setItem(SEASON_STORAGE_KEY, choice);
  } catch {
    // Refused storage: the choice lasts for this visit only.
  }
  return choice;
};

/**
 * What the reader asked for: a season, or "automatic" — the season of the date. The
 * boot script has already written `data-season` before the first paint; this is the
 * state behind the picker, and what changes it afterwards.
 */
export const { DocSeasonView, provideDocSeasonView } = craftService(
  { name: 'docSeasonView', providedIn: 'toProvide' },
  function* () {
    const initial = (stored() ?? 'auto') as SeasonChoice;
    // The boot script has normally written the season before the first paint. A page
    // without it (script blocked, a harness) still gets one: the document is never left
    // on the classic palette while the picker says otherwise.
    if (
      typeof document !== 'undefined' &&
      !document.documentElement.hasAttribute('data-season')
    ) {
      document.documentElement.setAttribute('data-season', resolveSeason(initial));
    }
    const choice = yield* state('choice', initial, ({ update }) => ({
      choose: (next: SeasonChoice) => update(() => apply(next)),
    }));
    yield* craftExpose('choose', choice.choose);
  },
);

/** The glyph of each season; "automatic" is the calendar. */
const ICON: Readonly<Record<SeasonChoice, IconName>> = {
  auto: 'calendar',
  spring: 'sprout',
  summer: 'sun',
  autumn: 'leaf',
  winter: 'snowflake',
};

export interface SeasonPickerInput {
  /** What the button does: the accessible name of the picker. */
  readonly label: Input<string>;
  /** Ties the button to its panel. Unique on the page. */
  readonly menuId: Input<string>;
  readonly names: Input<SeasonNames>;
}

const glyph = (name: IconName) =>
  DocIcon({
    name: function* () {
      return name;
    },
    size: function* () {
      return 'sm' as const;
    },
  });

/**
 * Picks the season, the way the appearance switch picks light or dark: a button in the
 * bar that opens a short list. The button shows the season now on screen; the list has
 * the four seasons and "automatic", as a radio group — the current one is announced
 * (`aria-checked`) and drawn (a sage fill, a heavier weight).
 */
export const DocSeasonPicker = craftComponent(
  'DocSeasonPicker',
  { providers: [provideDocMenuView()] },
  function* (props: SeasonPickerInput) {
    const view = yield* DocSeasonView();
    const menu = yield* DocMenuView({ menuId: props.menuId });
    const id = yield* props.menuId();
    const label = yield* props.label();
    const names = yield* props.names();

    /** The season on screen: the choice, or the date's when the choice is "automatic". */
    const shown = function* (): Generator<unknown, Season, unknown> {
      return resolveSeason((yield* view.choice()) as SeasonChoice);
    };

    const rows = SEASON_CHOICES.map(
      (choice): CraftNodeChild =>
        button(
          'docSeasonChoice',
          {
            type: 'button',
            class: menuUi.item,
            role: 'menuitemradio',
            'aria-checked': function* () {
              return (yield* view.choice()) === choice ? 'true' : 'false';
            },
            'data-checked': function* () {
              return (yield* view.choice()) === choice ? 'true' : 'false';
            },
            click: () => {
              view.choose(choice);
              menu.close();
            },
          },
          [glyph(ICON[choice]), span(names[choice])],
        ),
    );

    return div({ class: menuUi.root, 'data-doc-menu': id }, [
      button(
        'docSeasonTrigger',
        {
          type: 'button',
          class: iconButtonUi.root,
          'aria-haspopup': 'menu',
          'aria-controls': `${id}-panel`,
          'aria-expanded': function* () {
            return (yield* menu.open()) ? 'true' : 'false';
          },
          'aria-label': function* () {
            const current = (yield* view.choice()) as SeasonChoice;
            return `${label}: ${names[current]}`;
          },
          title: label,
          click: () => menu.toggle(),
        },
        [
          DocIcon({
            name: function* () {
              return ICON[yield* shown()];
            },
            size: function* () {
              return 'md' as const;
            },
          }),
        ],
      ),
      div(
        {
          class: menuUi.endPanel,
          id: `${id}-panel`,
          role: 'menu',
          'aria-label': label,
          'data-menu-state': function* () {
            return (yield* menu.open()) ? 'open' : 'closed';
          },
        },
        rows,
      ),
    ]);
  },
);
