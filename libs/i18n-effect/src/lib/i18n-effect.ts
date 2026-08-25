import type { I18nRuntime, LocaleDefinition, TranslationKey, TranslationParams } from '@craft-ts/i18n';
import { Context, Effect, Layer } from 'effect';

export type I18nEffectShape = {
  readonly runtime: I18nRuntime<readonly LocaleDefinition[]>;
};

export class I18nEffectService extends Context.Service<I18nEffectService, I18nEffectShape>()(
  '@craft-ts/i18n-effect/I18nEffectService',
) {}

export function provideI18nRuntime<const Locales extends readonly LocaleDefinition[]>(
  runtime: I18nRuntime<Locales>,
): Layer.Layer<I18nEffectService> {
  return Layer.succeed(I18nEffectService, {
    runtime: runtime as unknown as I18nRuntime<readonly LocaleDefinition[]>,
  });
}

export function translateEffect<
  const Locales extends readonly LocaleDefinition[],
  Key extends TranslationKey<Locales[number]>,
>(
  key: Key,
  ...params: keyof TranslationParams<Locales[number], Key & string> extends never
    ? [params?: TranslationParams<Locales[number], Key & string>]
    : [params: TranslationParams<Locales[number], Key & string>]
): Effect.Effect<string, never, I18nEffectService> {
  return Effect.gen(function* () {
    const service = yield* I18nEffectService;
    const translate = service.runtime.translate as unknown as (key: string, params?: Record<string, unknown>) => string;
    return translate(key, params[0] as Record<string, unknown> | undefined);
  });
}
