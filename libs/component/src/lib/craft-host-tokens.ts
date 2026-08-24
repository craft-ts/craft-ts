import { craftToken } from '@craft-ts/core';

export const CRAFT_ROUTED_COMPONENT = craftToken<unknown>(
  'CRAFT_ROUTED_COMPONENT',
);
export const CRAFT_ROOT_COMPONENT = craftToken<unknown>('CRAFT_ROOT_COMPONENT');
export const CRAFT_GLOBAL_ERROR_COMPONENT = craftToken<unknown>(
  'CRAFT_GLOBAL_ERROR_COMPONENT',
);
export const CRAFT_ROUTE_LOAD_ERROR_COMPONENT = craftToken<unknown>(
  'CRAFT_ROUTE_LOAD_ERROR_COMPONENT',
);
export const CRAFT_PENDING_COMPONENT = craftToken<unknown>(
  'CRAFT_PENDING_COMPONENT',
);
