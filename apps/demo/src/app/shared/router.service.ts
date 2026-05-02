import { provideRouter, Router } from '@angular/router';
import { toCraftService } from '@craft-ng/core';

export const { injectCraftRouter, provideCraftRouter, CraftRouterToYield } =
  toCraftService({
    name: 'CraftRouter',
    scope: 'manuallyProvidedAtRoot',
    token: Router,
    provide: provideRouter,
  });
