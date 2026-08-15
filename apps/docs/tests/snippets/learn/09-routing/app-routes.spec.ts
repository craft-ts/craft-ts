import { describe, expect, it } from 'vitest';
import { appRoutes } from './app-routes';

describe('Learn 09 app routes', () => {
  it('declares a tasks path', () => {
    expect(appRoutes.toRoutes().some((route) => route.path === 'tasks')).toBe(
      true,
    );
  });
});
