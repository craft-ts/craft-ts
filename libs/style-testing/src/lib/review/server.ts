/**
 * The local review surface.
 *
 * A page, on localhost, driven from the keyboard: `j`/`k` to move, `a` to
 * accept, `r` to reject, `n` to accept with a note. Keyboard because a queue
 * that needs a mouse is a queue that gets a hundred items into and then
 * abandoned, and the whole design rests on the queue staying short enough to
 * actually be read.
 *
 * The server is deliberately thin. Everything worth testing — what is in the
 * queue, how it clusters, what the diff reads like — is in `queue.ts` and runs
 * without a socket.
 */
import { createServer, type Server } from 'node:http';
import { buildReviewQueue, type ReviewCard, type ReviewItem } from './queue.js';

export interface ReviewServerOptions {
  readonly port?: number;
  readonly items?: readonly ReviewItem[];
  /** Called once per decision, expanded over its cluster by the caller. */
  readonly onDecision?: (decision: {
    readonly shape: string;
    readonly verdict: string;
    readonly note?: string;
  }) => void | Promise<void>;
  /** Serves a stored screenshot by hash. */
  readonly imageFor?: (hash: string) => Promise<Uint8Array | undefined>;
}

export interface RunningReviewServer {
  readonly url: string;
  readonly server: Server;
  close(): Promise<void>;
}

const escape = (value: string): string =>
  value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;');

/** The page. One file, no build step, no dependency. */
export function renderReviewPage(cards: readonly ReviewCard[], items: number): string {
  const body = cards
    .map(
      (card, index) => `
<article class="card" data-index="${index}" data-shape="${escape(card.shape)}">
  <header>
    <h2>${escape(card.subject)}</h2>
    <p class="why">${escape(card.reason)}</p>
    ${
      card.cluster.length > 1
        ? `<p class="cluster">${card.cluster.length} scenarios share this exact change — one decision covers all of them.</p>`
        : ''
    }
  </header>
  ${card.image ? `<img alt="" src="/image/${escape(card.image)}">` : ''}
  <ul class="changes">
    ${card.changes.map((change) => `<li><code>${escape(change)}</code></li>`).join('')}
    ${card.changes.length === 0 ? '<li>New subject: nothing to compare against.</li>' : ''}
  </ul>
</article>`,
    )
    .join('\n');

  return `<!doctype html>
<meta charset="utf-8">
<title>craft attest — review</title>
<style>
  :root { color-scheme: light dark; font: 14px/1.5 system-ui, sans-serif; }
  body { margin: 0; padding: 24px; max-width: 900px; }
  .card { border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
          border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .card[aria-current="true"] { outline: 2px solid Highlight; }
  h2 { font-size: 15px; margin: 0 0 4px; word-break: break-all; }
  .why { margin: 0; opacity: .7; }
  .cluster { margin: 8px 0 0; font-weight: 600; }
  .changes { margin: 12px 0 0; padding-left: 18px; }
  img { max-width: 100%; margin-top: 12px; border-radius: 6px; }
  footer { position: sticky; bottom: 0; padding: 12px 0; opacity: .8; }
</style>
<h1>${items} in the queue, ${cards.length} decision(s) to make</h1>
${body}
<footer><kbd>j</kbd>/<kbd>k</kbd> move · <kbd>a</kbd> accept · <kbd>n</kbd> accept with a note · <kbd>r</kbd> reject</footer>
<script>
  let index = 0;
  const cards = [...document.querySelectorAll('.card')];
  const focus = () => cards.forEach((card, position) => {
    card.setAttribute('aria-current', String(position === index));
    if (position === index) card.scrollIntoView({ block: 'nearest' });
  });
  const decide = async (verdict) => {
    const card = cards[index];
    if (!card) return;
    const note = verdict === 'ok-with-note' ? prompt('Note:') ?? '' : undefined;
    await fetch('/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shape: card.dataset.shape, verdict, note }),
    });
    card.remove();
    cards.splice(index, 1);
    index = Math.min(index, cards.length - 1);
    focus();
  };
  addEventListener('keydown', (event) => {
    if (event.key === 'j') { index = Math.min(index + 1, cards.length - 1); focus(); }
    if (event.key === 'k') { index = Math.max(index - 1, 0); focus(); }
    if (event.key === 'a') decide('ok');
    if (event.key === 'n') decide('ok-with-note');
    if (event.key === 'r') decide('rejected');
  });
  focus();
</script>`;
}

export async function startReviewServer(
  options: ReviewServerOptions = {},
): Promise<RunningReviewServer> {
  const queue = buildReviewQueue(options.items ?? []);
  const port = options.port ?? 4320;

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (request.method === 'POST' && url.pathname === '/decision') {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        void (async () => {
          try {
            await options.onDecision?.(
              JSON.parse(Buffer.concat(chunks).toString('utf8')),
            );
            response.writeHead(204).end();
          } catch (error) {
            response
              .writeHead(400, { 'content-type': 'text/plain' })
              .end(error instanceof Error ? error.message : 'bad request');
          }
        })();
      });
      return;
    }

    if (url.pathname.startsWith('/image/')) {
      void (async () => {
        const bytes = await options.imageFor?.(url.pathname.slice('/image/'.length));
        if (!bytes) {
          response.writeHead(404).end();
          return;
        }
        response
          .writeHead(200, { 'content-type': 'image/png' })
          .end(Buffer.from(bytes));
      })();
      return;
    }

    response
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      .end(renderReviewPage(queue.cards, queue.items));
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  return {
    url: `http://localhost:${port}`,
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
