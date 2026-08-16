/**
 * Craft-owned structural stand-ins for the Angular router types that the
 * `craftRoutes` type graph still names. The DSL is unchanged; only the host
 * types are local.
 */

import { InjectionToken } from './craft-compat';

export type Data = Record<string, unknown>;

export type UrlSegment = {
  path: string;
  parameters: Record<string, string>;
};

export type ParamMap = {
  has(name: string): boolean;
  get(name: string): string | null;
  getAll(name: string): string[];
  keys: string[];
};

export type UrlTree = {
  toString(): string;
};

export type GuardResult = boolean | UrlTree;

export type Route = {
  path?: string;
  pathMatch?: 'full' | 'prefix';
  component?: unknown;
  loadComponent?: () => Promise<unknown> | unknown;
  loadChildren?: () => Promise<unknown> | unknown;
  children?: Route[];
  canActivate?: unknown[];
  canMatch?: unknown[];
  canActivateChild?: unknown[];
  resolve?: Record<string, unknown>;
  data?: Data;
  providers?: unknown[];
  title?: string | (() => string | Promise<string>);
  outlet?: string;
  redirectTo?: string | ((redirectData: PartialMatchRouteSnapshot) => unknown);
};

export type ActivatedRouteSnapshot = {
  routeConfig: Route | null;
  url: UrlSegment[];
  params: Record<string, string>;
  queryParams: Record<string, string>;
  fragment: string | null;
  data: Data;
  outlet: string;
  title?: string;
  paramMap: ParamMap;
  queryParamMap: ParamMap;
  parent: ActivatedRouteSnapshot | null;
  root: ActivatedRouteSnapshot;
  firstChild: ActivatedRouteSnapshot | null;
  children: ActivatedRouteSnapshot[];
  pathFromRoot: ActivatedRouteSnapshot[];
};

export type RouterStateSnapshot = {
  url: string;
  root: ActivatedRouteSnapshot;
};

export type PartialMatchRouteSnapshot = ActivatedRouteSnapshot;

export type ActivatedRoute = {
  snapshot: ActivatedRouteSnapshot;
  pathFromRoot: ActivatedRoute[];
};

export const ActivatedRoute = new InjectionToken<ActivatedRoute>(
  'ActivatedRoute',
);

export abstract class TitleStrategy {
  abstract updateTitle(snapshot: RouterStateSnapshot): void;
  buildTitle(snapshot: RouterStateSnapshot): string | undefined {
    let current: ActivatedRouteSnapshot | null = snapshot.root;
    let title: string | undefined;
    while (current) {
      if (typeof current.title === 'string') {
        title = current.title;
      }
      current = current.firstChild;
    }
    return title;
  }
}
