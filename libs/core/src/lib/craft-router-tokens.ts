import { InjectionToken } from '@angular/core';
import { craftToken, ɵregisterCraftTokenHostToken } from './host/craft-injector';
import type {
  CraftCompiledRoute,
  CraftHistory,
  CraftLocation,
  CraftMatch,
} from './host/craft-router-runtime';
import type {
  CraftSignal,
  CraftWritableSignal,
} from './host/craft-signal';

function angularCraftToken<T>(debugName: string): InjectionToken<T> {
  const native = craftToken<T>(debugName);
  const host = new InjectionToken<T>(debugName);
  ɵregisterCraftTokenHostToken(native, host);
  return host;
}

export type CraftUrlTree = {
  readonly __craftUrlTree: true;
  toString(): string;
};

export type CraftRouterEvent = {
  readonly type: 'NavigationStart' | 'NavigationEnd';
  readonly url: string;
};

export type CraftNavigationExtras = {
  replaceUrl?: boolean;
  skipLocationChange?: boolean;
  state?: Record<string, unknown>;
  queryParamsHandling?: 'merge' | 'preserve' | '';
  fragment?: string | null;
  preserveFragment?: boolean;
};

export type CraftNavigation = {
  extras?: CraftNavigationExtras;
};

export type CraftRouterNavigationApi = {
  readonly url: string;
  createUrlTree(input: {
    to: string;
    params?: Record<string, string>;
    queryParams?: Record<string, string> | null;
    fragment?: string | null;
  }): CraftUrlTree;
  navigate(
    input: {
      to: string;
      params?: Record<string, string>;
      queryParams?: Record<string, string> | null;
      fragment?: string | null;
    } & CraftNavigationExtras,
  ): Promise<boolean>;
  navigateByUrl(
    url: string | CraftUrlTree | { to: string },
    extras?: CraftNavigationExtras,
  ): Promise<boolean>;
  serializeUrl(tree: CraftUrlTree): string;
  getCurrentNavigation(): CraftNavigation | null;
};

export const CRAFT_HISTORY = angularCraftToken<CraftHistory>('CRAFT_HISTORY');

export const CRAFT_LOCATION = angularCraftToken<
  CraftWritableSignal<CraftLocation>
>('CRAFT_LOCATION');

export const CRAFT_MATCH = angularCraftToken<CraftSignal<CraftMatch | null>>(
  'CRAFT_MATCH',
);

export const CRAFT_CHILD_MATCH = angularCraftToken<
  CraftSignal<CraftMatch | null>
>('CRAFT_CHILD_MATCH');

export const CRAFT_COMPILED_ROUTES = angularCraftToken<
  readonly CraftCompiledRoute[]
>('CRAFT_COMPILED_ROUTES');

export const CRAFT_ROUTER = angularCraftToken<CraftRouterNavigationApi>(
  'CRAFT_ROUTER',
);
