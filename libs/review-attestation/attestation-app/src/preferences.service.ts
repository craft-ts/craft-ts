import { craftMethod, craftService, state } from '@craft-ts/core';
import { reviewDocument } from './browser-adapter';
import {
  applyLocale,
  applyTheme,
  initialLocale,
  initialTheme,
  isLocale,
  isThemeChoice,
  storeLocale,
  storeTheme,
  type Locale,
  type ThemeChoice,
} from './preferences';

/**
 * The reviewer's tool-level choices: language and theme, each with the
 * storage write and DOM attribute update that make the choice stick and
 * take effect immediately.
 */
export const { ReviewPreferences } = craftService(
  { name: 'ReviewPreferences', providedIn: 'global' },
  function* () {
    const locale = yield* state('locale', initialLocale(), ({ set }) => ({
      choose: (value: Locale) => set(value),
    }));
    const theme = yield* state('theme', initialTheme(), ({ set }) => ({
      choose: (value: ThemeChoice) => set(value),
    }));

    // Take the raw select value and no-op on anything unexpected, so the
    // template's change handler stays a single yield with no local guard.
    const chooseLocale = craftMethod('chooseLocale', function* (
      value: string,
    ) {
      if (!isLocale(value)) return;
      yield* locale.choose(value);
      storeLocale(value);
      applyLocale(value, reviewDocument.documentElement);
    });
    const chooseTheme = craftMethod('chooseTheme', function* (
      value: string,
    ) {
      if (!isThemeChoice(value)) return;
      yield* theme.choose(value);
      storeTheme(value);
      applyTheme(value, reviewDocument.documentElement);
    });

    return { locale, theme, chooseLocale, chooseTheme };
  },
);
