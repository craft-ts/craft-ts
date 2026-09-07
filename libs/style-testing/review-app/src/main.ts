import { bootstrapCraft, provideCraftRootComponent } from '@craft-ts/component';
import { craftAppConfig, provideFnWrapper } from '@craft-ts/core';
import { ReviewApp } from './review-app';
import {
  applyLocale,
  applyTheme,
  initialLocale,
  initialTheme,
} from './preferences';
import './styles.css';

// Before the app renders, not after. Reading the stored choice from inside the
// component would paint one theme and correct it a frame later, which is the
// flash every theme switcher is judged on.
applyTheme(initialTheme(), document.documentElement);
applyLocale(initialLocale(), document.documentElement);

const config = craftAppConfig({
  providers: [
    provideCraftRootComponent(ReviewApp),
    provideFnWrapper(
      'Review app function boundary',
      function* (factory, thisArg, args) {
        return yield* factory.apply(thisArg, args);
      },
    ),
  ],
});

bootstrapCraft({ config, mode: 'production' });

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
  const action = document.querySelector<HTMLButtonElement>(
    `[data-hotkey="${CSS.escape(event.key.toLowerCase())}"]`,
  );
  if (action && !action.disabled) {
    event.preventDefault();
    action.click();
  }
});
