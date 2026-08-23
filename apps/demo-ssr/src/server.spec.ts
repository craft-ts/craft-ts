import { describe, expect, it, vi } from 'vitest';
import { renderDeferredApi, renderPage } from './server';

describe('CraftTS SSR demo', () => {
  it('renders a Craft root, transfer snapshot and initial route on the server', async () => {
    const result = await renderPage(new URL('http://localhost/'));

    expect(result.status).toBe(200);
    expect(result.html).toContain('<craft-root data-craft-hk="SsrLabApp/0">');
    expect(result.html).toContain('Comprendre SSR par l’expérience');
    expect(result.html).toContain('__CRAFT_TRANSFER__');
    expect(result.html).toContain(
      '<link rel="canonical" href="http://localhost:4300/" />',
    );
    expect(result.html).toContain(
      '<meta name="robots" content="index,follow" />',
    );
  });

  it('uses the server-function registry in memory during SSR', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const result = await renderPage(new URL('http://localhost/'));

      expect(result.html).toContain('Même façade, deux transports');
      expect(result.html).toContain('Produits rendus : 3');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('blocks the data route until the query is resolved', async () => {
    const result = await renderPage(new URL('http://localhost/data'));

    expect(result.html).toContain('1 284');
    expect(result.html).not.toContain('Le serveur résout la query');
  });

  it('keeps client-only data out of the server query execution', async () => {
    const result = await renderPage(new URL('http://localhost/client-only'));

    expect(result.html).toContain('En attente de l’hydratation');
    expect(result.html).not.toContain('visite(s)');
  });

  it('renders the fallback boundary without waiting for its client payload', async () => {
    const result = await renderPage(new URL('http://localhost/fallback'));

    expect(result.html).toContain('Le bloc différé arrive après le rendu');
    expect(result.html).not.toContain(
      'Le bloc différé est arrivé après le premier rendu',
    );
  });

  it('renders unknown URLs with a server-side 404', async () => {
    const result = await renderPage(new URL('http://localhost/missing'));

    expect(result.status).toBe(404);
    expect(result.html).toContain('Page non trouvée');
    expect(result.html).toContain(
      '<meta name="robots" content="noindex,nofollow" />',
    );
  });

  it('serves the deferred client payload separately', async () => {
    await expect(renderDeferredApi()).resolves.toMatchObject({
      message: expect.stringContaining('bloc différé'),
    });
  });
});
