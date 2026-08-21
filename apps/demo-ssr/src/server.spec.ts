import { describe, expect, it } from 'vitest';
import { renderPage, renderDeferredApi } from './server';

describe('SSR demo renderer', () => {
  it('renders the initial overview entirely on the server', async () => {
    const result = await renderPage(new URL('http://localhost/'));

    expect(result.status).toBe(200);
    expect(result.html).toContain('Comprendre SSR par l’expérience');
    expect(result.html).toContain('/deferred');
  });

  it('uses request data while rendering the personalized page', async () => {
    const result = await renderPage(new URL('http://localhost/request?name=Ada'), {
      'accept-language': 'fr-FR,fr;q=0.9',
      'user-agent': 'DemoBrowser/1.0',
    });

    expect(result.html).toContain('Bonjour Ada !');
    expect(result.html).toContain('fr-FR');
  });

  it('returns a real 404 for unknown pages', async () => {
    const result = await renderPage(new URL('http://localhost/missing'));

    expect(result.status).toBe(404);
    expect(result.html).toContain('Page non trouvée');
  });

  it('keeps slow deferred data outside the initial HTML', async () => {
    const result = await renderPage(new URL('http://localhost/deferred'));

    expect(result.html).toContain('En attente de l’hydratation');
    expect(result.html).not.toContain('Le bloc différé est arrivé');
    await expect(renderDeferredApi()).resolves.toMatchObject({
      message: expect.stringContaining('bloc différé'),
    });
  });
});
