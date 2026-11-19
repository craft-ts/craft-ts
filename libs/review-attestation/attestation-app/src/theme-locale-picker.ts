import {
  craftComponent,
  div,
  label,
  option,
  select,
} from '@craft-ts/component';
import { eventValue } from './annotation-text';
import { ReviewPreferences } from './preferences.service';
import { preferences } from './review-controls.style';

/**
 * The two choices the reviewer makes about the tool rather than about a
 * render: language and theme. Self-contained because `ReviewPreferences` is
 * a global service — this component needs no Input to reach it.
 */
export const ThemeLocalePicker = craftComponent(
  'ThemeLocalePicker',
  {},
  () =>
    div({ class: preferences.root }, [
      label({ htmlFor: 'review-locale' }, function* () {
        return (yield* (yield* ReviewPreferences()).locale.messages()).language;
      }),
      select(
        'ReviewLocale',
        {
          class: preferences.control,
          id: 'review-locale',
          value: function* () {
            return yield* (yield* ReviewPreferences()).locale();
          },
          *change(event: Event) {
            (yield* ReviewPreferences()).chooseLocale(eventValue(event));
          },
        },
        [
          option({ value: 'en' }, 'English'),
          option({ value: 'fr' }, 'Français'),
        ],
      ),
      label({ htmlFor: 'review-theme' }, function* () {
        return (yield* (yield* ReviewPreferences()).locale.messages()).theme;
      }),
      select(
        'ReviewTheme',
        {
          class: preferences.control,
          id: 'review-theme',
          value: function* () {
            return yield* (yield* ReviewPreferences()).theme();
          },
          *change(event: Event) {
            (yield* ReviewPreferences()).chooseTheme(eventValue(event));
          },
        },
        [
          // First, and the default: a reviewer who has never touched this
          // gets what their machine asks for, and keeps getting it when the
          // machine changes its mind at sunset.
          option({ value: 'system' }, function* () {
            return (yield* (yield* ReviewPreferences()).locale.messages()).themeSystem;
          }),
          option({ value: 'light' }, function* () {
            return (yield* (yield* ReviewPreferences()).locale.messages()).themeLight;
          }),
          option({ value: 'dark' }, function* () {
            return (yield* (yield* ReviewPreferences()).locale.messages()).themeDark;
          }),
        ],
      ),
      label({ htmlFor: 'review-ide' }, function* () {
        return (yield* (yield* ReviewPreferences()).locale.messages()).ide;
      }),
      select(
        'ReviewIde',
        {
          class: preferences.control,
          id: 'review-ide',
          value: function* () {
            return yield* (yield* ReviewPreferences()).ide();
          },
          *change(event: Event) {
            (yield* ReviewPreferences()).chooseIde(eventValue(event));
          },
        },
        [
          option({ value: 'vscode' }, 'VS Code'),
          option({ value: 'cursor' }, 'Cursor'),
          option({ value: 'zed' }, 'Zed'),
        ],
      ),
    ]),
);
