// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hydrateCraft, renderCraft } from '@craft-ts/component';
import { createSsrAppConfig } from './app/app.config';

describe('CraftTS SSR hydration and lazy routes', () => {
  it('claims the SSR DOM for a lazy route', async () => {
    window.history.replaceState({}, '', '/data');
    const rendered = await renderCraft({
      config: createSsrAppConfig(),
      url: '/data',
    });
    document.body.innerHTML = rendered.html;

    const host = document.querySelector('craft-root');
    expect(host).not.toBeNull();
    const hydrated = hydrateCraft({
      config: createSsrAppConfig(),
      host: host ?? undefined,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hydrated.mismatches).toEqual([]);
    expect(host?.querySelector('h1')?.textContent).toContain('Query résolue');

    hydrated.destroy();
  });
});
