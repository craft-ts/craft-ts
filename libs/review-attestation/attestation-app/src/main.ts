import {
  bootstrapCraft,
  provideCraftRootComponent,
  provideSendContextToAi,
} from '@craft-ts/component';
import {
  craftAppConfig,
  provideCraftRouter,
  provideCraftSchemaValidationPolicy,
  provideFnWrapper,
  provideSendContextEventEnricher,
  withHashLocation,
} from '@craft-ts/core';
import { ReviewApp } from './review-app';
import { provideReviewAppModel } from './review-app.model';
import { provideReviewNavigation } from './review-navigation.service';
import { reviewRoutes } from './review.routes';
import { reviewDocument } from './browser-adapter';
import {
  applyLocale,
  applyTheme,
  initialLocale,
  initialTheme,
} from './preferences';
import 'virtual:craft-style.css';

const developmentProviders = import.meta.env.DEV
  ? [
      provideSendContextEventEnricher((event) => ({
        ...event,
        application: 'review-attestation',
      })),
      provideSendContextToAi({ recording: true }),
    ]
  : [];

// Before the app renders, not after. Reading the stored choice from inside the
// component would paint one theme and correct it a frame later, which is the
// flash every theme switcher is judged on.
applyTheme(initialTheme(), reviewDocument.documentElement);
applyLocale(initialLocale(), reviewDocument.documentElement);

const config = craftAppConfig({
  providers: [
    ...developmentProviders,
    // Async processes request a validation policy from the app injector even
    // when they have no schema-specific override.
    provideCraftSchemaValidationPolicy(() => ({
      action: import.meta.env.DEV ? 'reject' : 'accept',
    })),
    provideCraftRootComponent(ReviewApp),
    ...provideCraftRouter(reviewRoutes.toRoutes(), withHashLocation()),
    provideReviewAppModel(),
    provideReviewNavigation(),
    provideFnWrapper(
      'Review app function boundary',
      function* (factory, thisArg, args) {
        return yield* factory.apply(thisArg, args);
      },
    ),
  ],
});

bootstrapCraft({
  config,
  mode: import.meta.env.DEV ? 'development' : 'production',
});

addEventListener('keydown', (event) => {
  if (
    event.defaultPrevented ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    // A `contenteditable` is a text field too, and it is not covered by any of
    // the element types above. Without this line, writing "And the row is
    // cut..." in the decision reason pressed `a` — Accept — and filed a verdict
    // the reviewer never reached.
    (event.target instanceof HTMLElement && event.target.isContentEditable)
  ) {
    return;
  }
  const action = reviewDocument.querySelector<HTMLButtonElement>(
    `[data-hotkey="${CSS.escape(event.key.toLowerCase())}"]`,
  );
  if (action && !action.disabled) {
    event.preventDefault();
    action.click();
  }
});
