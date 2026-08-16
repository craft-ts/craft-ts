import { inject, type ProviderToken } from '@angular/core';
import type { CraftComponent } from '@craft-ng/component';

/**
 * Craft tokens are plain branded objects. Angular's DI happily stores and
 * resolves them — `{ provide: CRAFT_ROUTED_COMPONENT, useValue }` works at
 * runtime — but the `inject()` overloads only admit Angular's own
 * `ProviderToken`. These helpers bridge that signature once, here at the
 * island boundary, so the host classes stay cast-free.
 */
export function injectCraftToken<T>(token: object): T;
export function injectCraftToken<T>(
  token: object,
  options: { optional: true },
): T | null;
export function injectCraftToken<T>(
  token: object,
  options?: { optional: true },
): T | null {
  return options
    ? inject(token as ProviderToken<T>, options)
    : inject(token as ProviderToken<T>);
}

/**
 * The host directives take a Craft component as an opaque `unknown` input —
 * they are mount points, not typed call sites. Narrowing happens here.
 */
export function asCraftComponent(value: unknown): CraftComponent<any> {
  return value as CraftComponent<any>;
}
