import { describe, expect, it } from 'vitest';

// #region route-checked-di
import type { ActivatedRoute, Router } from '@angular/router';
import type { CanRun, ComponentDepsOf, RouteCheckedDI } from '@craft-ng/core';

type AppRouteCheckedDI<
  Component,
  RouteInputs extends string = never,
  Context extends string = 'app route component',
> = RouteCheckedDI<
  ComponentDepsOf<Component>,
  'CraftRouter',
  Router | ActivatedRoute,
  Context,
  RouteInputs
>;

type _CanRunTasks = CanRun<
  AppRouteCheckedDI<
    (typeof import('./tasks/tasks'))['default'],
    never,
    'path: "tasks"'
  >
>;
// #endregion route-checked-di

describe('Learn 09 route DI check', () => {
  it('keeps the CanRun alias instantiable', () => {
    expect(true).toBe(true);
  });
});
