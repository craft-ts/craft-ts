import { provideRouter, Router } from '@angular/router';
import { toCraftService } from '@craft-ng/core';

export const { injectCraftRouter, provideCraftRouter } = toCraftService({
  name: 'CraftRouter',
  scope: 'manuallyProvidedAtRoot',
  token: Router,
  provide: provideRouter,
});
