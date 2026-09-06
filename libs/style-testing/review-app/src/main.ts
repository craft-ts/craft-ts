import { bootstrapCraft, provideCraftRootComponent } from '@craft-ts/component';
import { craftAppConfig, provideFnWrapper } from '@craft-ts/core';
import { ReviewApp } from './review-app';
import './styles.css';

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
    event.target instanceof HTMLSelectElement
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
