import { BrowserDocument, craftService, state } from '@craft-ts/core';
import { createI18nRuntime } from '@craft-ts/i18n';
import { locales, type DemoLocale } from './i18n.service';

export const { I18n } = craftService(
  { name: 'I18n', providedIn: 'global' },
  function* () {
    const runtime = createI18nRuntime({ locales, defaultLocale: 'en-US' });
    const language = yield* state(
      'language',
      'en-US' as DemoLocale,
      ({ set }) => {
        const setLocale = function* (next: DemoLocale) {
          runtime.setLocale(next);
          yield* set(next);
          yield* BrowserDocument.setLang(next);
        };

        return {
          setLocale,
          change: function* (event: Event) {
            const next = (event.target as HTMLSelectElement)
              .value as DemoLocale;
            yield* setLocale(next);
          },
        };
      },
    );

    const translate = runtime.bind(language);

    return {
      language,
      setLocale: language.setLocale,
      translate,
    };
  },
);
