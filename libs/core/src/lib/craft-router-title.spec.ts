// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from './host/craft-test-bed';
import { provideCraftRouter } from './craft-router';
import { ɵinjectCraftHistory, ɵinjectCraftMatch } from './craft-router-tokens';

describe('provideCraftRouter title', () => {
  afterEach(() => {
    document.title = '';
    window.history.replaceState(null, '', '/');
  });

  it('writes document.title from the matched route title', () => {
    document.title = 'before';
    TestBed.configureTestingModule({
      providers: [provideCraftRouter([
        { path: 'hello', title: 'Hello page', component: {} },
      ])],
    });
    const history = TestBed.runInInjectionContext(() => ɵinjectCraftHistory()!);
    TestBed.runInInjectionContext(() => ɵinjectCraftMatch());
    history.push('/hello');
    expect(document.title).toBe('Hello page');
  });
});
