import { describe, expect, it } from 'vitest';
import { createCraftWorkerFetch } from './worker-adapter';
import { createHttpServer } from './http-server';

describe('Worker HTTP adapter', () => {
  it('forwards a Web request to the portable application', async () => {
    const application = createHttpServer({
      routes: [
        {
          method: 'GET',
          path: '/health',
          handler: () => Response.json({ status: 'ok' }),
        },
      ],
    });
    const fetchHandler = createCraftWorkerFetch(application);

    const response = await fetchHandler(
      new Request('https://worker.example.test/health'),
      { binding: 'test' },
      {},
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });
});
