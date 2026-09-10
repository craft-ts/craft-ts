import { craftComponent, div, label, option, select } from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { eventValue } from './annotation-text';
import { MESSAGES } from './messages';
import { ReviewPreferences } from './preferences.service';

/**
 * The two choices the reviewer makes about the tool rather than about a
 * render: language and theme. Self-contained because `ReviewPreferences` is
 * a global service — this component needs no Input to reach it.
 */
export const ThemeLocalePicker = craftComponent(
  'ThemeLocalePicker',
  {},
  function* () {
    const { locale, theme, chooseLocale, chooseTheme } =
      yield* ReviewPreferences();
    const t = craftComputed('t', function* () {
      return MESSAGES[yield* locale()];
    });
    return { locale, theme, chooseLocale, chooseTheme, t };
  },
  ({ locale, theme, chooseLocale, chooseTheme, t }) =>
    div({ class: 'preferences' }, [
      label({ class: 'field-label', htmlFor: 'review-locale' }, function* () {
        return (yield* t()).language;
      }),
      select(
        'ReviewLocale',
        {
          id: 'review-locale',
          value: locale,
          *change(event: Event) {
            yield* chooseLocale(eventValue(event));
          },
        },
        [option({ value: 'en' }, 'English'), option({ value: 'fr' }, 'Français')],
      ),
      label({ class: 'field-label', htmlFor: 'review-theme' }, function* () {
        return (yield* t()).theme;
      }),
      select(
        'ReviewTheme',
        {
          id: 'review-theme',
          value: theme,
          *change(event: Event) {
            yield* chooseTheme(eventValue(event));
          },
        },
        [
          // First, and the default: a reviewer who has never touched this
          // gets what their machine asks for, and keeps getting it when the
          // machine changes its mind at sunset.
          option({ value: 'system' }, function* () {
            return (yield* t()).themeSystem;
          }),
          option({ value: 'light' }, function* () {
            return (yield* t()).themeLight;
          }),
          option({ value: 'dark' }, function* () {
            return (yield* t()).themeDark;
          }),
        ],
      ),
    ]),
);
