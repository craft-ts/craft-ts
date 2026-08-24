// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hydrateCraft, renderCraft } from '@craft-ts/component';
import { appConfig } from './app/app.config';
import { DEMO_SECURITY_POLICY } from './app/security-policy';

describe('CraftTS SSR hydration and lazy routes', () => {
  it('claims the SSR DOM for a lazy route', async () => {
    window.history.replaceState({}, '', '/data');
    const rendered = await renderCraft({
      config: appConfig,
      url: '/data',
      // L'hydratation sans rechargement suppose que la query voyage : le
      // transfert est fermé par défaut, la page l'autorise par adresse.
      securityPolicy: DEMO_SECURITY_POLICY,
    });
    document.body.innerHTML = rendered.html;

    const host = document.querySelector('craft-root');
    expect(host).not.toBeNull();
    const hydrated = hydrateCraft({
      config: appConfig,
      host: host ?? undefined,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hydrated.mismatches).toEqual([]);
    expect(host?.querySelector('h1')?.textContent).toContain('Query résolue');

    hydrated.destroy();
  });
});
