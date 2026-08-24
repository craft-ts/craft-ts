// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CRAFT_HISTORY, CRAFT_MATCH, provideCraftRouter } from './craft-router';
import {
  createEnvironmentInjector,
  Injector,
} from './host/craft-compat';

describe('provideCraftRouter title', () => {
  afterEach(() => {
    document.title = '';
    window.history.replaceState(null, '', '/');
  });

  it('writes document.title from the matched route title', () => {
    document.title = 'before';
    const injector = createEnvironmentInjector(
      provideCraftRouter([
        { path: 'hello', title: 'Hello page', component: {} },
      ]),
      Injector.NULL,
    );
    const history = injector.get(CRAFT_HISTORY);
    injector.get(CRAFT_MATCH);
    history.push('/hello');
    expect(document.title).toBe('Hello page');
  });
});
