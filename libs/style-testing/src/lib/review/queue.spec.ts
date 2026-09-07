import { describe, expect, it } from 'vitest';
import { buildReviewQueue, expandDecision, type ReviewItem } from './queue.ts';
import { startReviewServer, type ReviewApiQueue } from './server.ts';
import { layoutDigest, STYLE_KEYS, type MeasuredElement } from '../digest.ts';

const blank = Object.fromEntries(STYLE_KEYS.map((key) => [key, '']));

const digestWith = (path: string, radius: string) =>
  layoutDigest([
    {
      path,
      rect: { x: 0, y: 0, width: 100, height: 20 },
      styles: { ...blank, 'border-radius': radius },
      scroll: { width: 100, height: 20, clientWidth: 100, clientHeight: 20 },
      zOrder: 0,
    } satisfies MeasuredElement,
  ]);

const item = (subject: string, path: string, radius: string): ReviewItem => ({
  subject,
  reason: 'the output changed',
  approved: digestWith(path, '4px'),
  digest: digestWith(path, radius),
});

describe('buildReviewQueue', () => {
  it('collapses two hundred identical deltas into one decision', () => {
    const items = Array.from({ length: 200 }, (_, index) =>
      item(`visual:Card#scenario-${index}`, `card-${index}`, '8px'),
    );
    const queue = buildReviewQueue(items);

    expect(queue.items).toBe(200);
    expect(queue.cards).toHaveLength(1);
    expect(queue.cards[0]?.cluster).toHaveLength(200);
    expect(queue.cards[0]?.changes[0]).toMatch(/border-radius 4px→8px/);
  });

  it('keeps genuinely different changes apart, largest cluster first', () => {
    const queue = buildReviewQueue([
      item('a', 'card', '8px'),
      item('b', 'card', '8px'),
      item('c', 'card', '12px'),
    ]);
    expect(queue.cards.map((card) => card.cluster)).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
  });

  it('says plainly that a new subject has nothing to compare against', () => {
    const queue = buildReviewQueue([
      {
        subject: 'visual:New#base',
        reason: 'never attested',
        digest: digestWith('card', '4px'),
      },
    ]);
    expect(queue.cards[0]?.changes).toEqual([]);
    expect(queue.cards[0]?.shape).toContain('never attested');
  });

  it('keeps new subjects separate because there is no delta to cluster yet', () => {
    const queue = buildReviewQueue([
      {
        subject: 'visual:New#base',
        reason: 'never attested',
        digest: digestWith('card', '4px'),
      },
      {
        subject: 'visual:New#scheme=dark',
        reason: 'never attested',
        digest: digestWith('card', '4px'),
      },
    ]);

    expect(queue.items).toBe(2);
    expect(queue.cards).toHaveLength(2);
    expect(queue.cards.map((card) => card.cluster)).toEqual([
      ['visual:New#base'],
      ['visual:New#scheme=dark'],
    ]);
  });

  it('keeps each clustered scenario image and capture metadata', () => {
    const queue = buildReviewQueue([
      {
        ...item('a', 'card', '8px'),
        image: 'image-a',
        metadata: { viewport: { width: 375, height: 900 } },
      },
      {
        ...item('b', 'card', '8px'),
        image: 'image-b',
        metadata: { viewport: { width: 768, height: 900 } },
      },
    ]);

    expect(queue.cards[0]?.members).toEqual([
      {
        subject: 'a',
        image: 'image-a',
        metadata: { viewport: { width: 375, height: 900 } },
        attested: ['card'],
        changed: ['card'],
      },
      {
        subject: 'b',
        image: 'image-b',
        metadata: { viewport: { width: 768, height: 900 } },
        attested: ['card'],
        changed: ['card'],
      },
    ]);
  });

  it('tells each member which nodes it attests and which of them moved', () => {
    const queue = buildReviewQueue([item('visual:Card#base', 'card', '8px')]);
    const [member] = queue.cards[0]?.members ?? [];

    // The exact set the verdict covers. Everything else on the page is decor,
    // and a remark filed against decor is refused rather than stored.
    expect(member?.attested).toEqual(['card']);
    expect(member?.changed).toEqual(['card']);
  });

  it('attests every node, and marks as changed only the ones that moved', () => {
    const twoNodes = (radius: string) =>
      layoutDigest([
        {
          path: 'card',
          rect: { x: 0, y: 0, width: 100, height: 40 },
          styles: { ...blank, 'border-radius': radius },
          scroll: {
            width: 100,
            height: 40,
            clientWidth: 100,
            clientHeight: 40,
          },
          zOrder: 0,
        },
        {
          path: 'card/title',
          parent: 'card',
          rect: { x: 0, y: 0, width: 100, height: 20 },
          styles: blank,
          scroll: {
            width: 100,
            height: 20,
            clientWidth: 100,
            clientHeight: 20,
          },
          zOrder: 0,
        },
      ] satisfies MeasuredElement[]);
    const before = twoNodes('4px');
    const after = twoNodes('8px');
    const queue = buildReviewQueue([
      {
        subject: 'visual:Card#base',
        reason: 'the output changed',
        approved: before,
        digest: after,
      },
    ]);
    const [member] = queue.cards[0]?.members ?? [];
    expect(member?.attested).toEqual(['card', 'card/title']);
    expect(member?.changed).toEqual(['card']);
  });

  it('keeps the previous rejection reason on the review card', () => {
    const queue = buildReviewQueue([
      {
        subject: 'visual:Card#base',
        reason: "last verdict was 'rejected'",
        digest: digestWith('card', '8px'),
        rejectionReason: 'The title wraps onto the button.',
      },
    ]);

    expect(queue.cards[0]?.rejectionReason).toBe(
      'The title wraps onto the button.',
    );
  });
});

describe('expandDecision', () => {
  it('writes the cluster into every attestation the decision covers', () => {
    const queue = buildReviewQueue([
      item('a', 'card', '8px'),
      item('b', 'card', '8px'),
    ]);
    const [card] = queue.cards;
    if (!card) throw new Error('the queue should hold one card');
    const expanded = expandDecision({
      card,
      verdict: 'ok',
      note: 'radius token bump',
    });

    expect(expanded).toHaveLength(2);
    // "Judged" and "judged alongside 199 others" are not the same claim, and
    // the ledger has to be able to tell them apart later.
    expect(expanded[0]?.cluster).toEqual(['a', 'b']);
    expect(expanded[0]?.note).toBe('radius token bump');
  });

  it('leaves a lone decision without a cluster', () => {
    const queue = buildReviewQueue([item('a', 'card', '8px')]);
    const [card] = queue.cards;
    if (!card) throw new Error('the queue should hold one card');
    expect(expandDecision({ card, verdict: 'ok' })[0]?.cluster).toBeUndefined();
  });
});

describe('findings are checked against what the card attests', () => {
  it('accepts a remark aimed at a node of the subject', async () => {
    const recorded: unknown[] = [];
    const running = await startReviewServer({
      port: 0,
      items: [item('visual:Card#base', 'card', '8px')],
      onDecision: (decision) => void recorded.push(decision),
    });

    try {
      const queue = (await fetch(`${running.url}/api/review`).then((value) =>
        value.json(),
      )) as ReviewApiQueue;
      const response = await fetch(`${running.url}/api/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: queue.cards[0]?.shape,
          verdict: 'rejected',
          note: 'the radius is wrong',
          findings: [{ path: 'card', note: 'too round' }],
        }),
      });

      expect(response.ok).toBe(true);
      expect(recorded).toEqual([
        {
          shape: queue.cards[0]?.shape,
          verdict: 'rejected',
          note: 'the radius is wrong',
          findings: [{ path: 'card', note: 'too round' }],
        },
      ]);
    } finally {
      await running.close();
    }
  });

  it('refuses a remark aimed at something this subject does not cover', async () => {
    // The mistake this exists to prevent: the reviewer is shown a whole page,
    // points at the navigation, and the remark is filed against a card that
    // does not attest it — where it would read as coverage.
    const recorded: unknown[] = [];
    const running = await startReviewServer({
      port: 0,
      items: [item('visual:Card#base', 'card', '8px')],
      onDecision: (decision) => void recorded.push(decision),
    });

    try {
      const queue = (await fetch(`${running.url}/api/review`).then((value) =>
        value.json(),
      )) as ReviewApiQueue;
      const response = await fetch(`${running.url}/api/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: queue.cards[0]?.shape,
          verdict: 'rejected',
          note: 'the nav is misaligned',
          findings: [{ path: 'demo-nav/toggle', note: 'misaligned' }],
        }),
      });

      expect(response.status).toBe(400);
      expect((await response.json()) as { error: string }).toEqual({
        error:
          'review: demo-nav/toggle is not attested by this subject. File the remark on the card that covers it.',
      });
      expect(recorded).toEqual([]);
      // And the card is still in the queue: nothing was decided.
      expect(
        (await fetch(`${running.url}/api/review`).then((value) =>
          value.json(),
        )) as ReviewApiQueue,
      ).toMatchObject({ decisions: 1 });
    } finally {
      await running.close();
    }
  });

  it('serves a frozen document beside the screenshot', async () => {
    const running = await startReviewServer({
      port: 0,
      items: [
        {
          ...item('visual:Card#base', 'card', '8px'),
          snapshot: 'a'.repeat(32),
        },
      ],
      snapshotFor: async (hash) =>
        hash === 'a'.repeat(32) ? '<!doctype html><p>frozen' : undefined,
    });

    try {
      const response = await fetch(
        `${running.url}/api/snapshot/${'a'.repeat(32)}`,
      );
      expect(response.headers.get('content-type')).toContain('text/html');
      // The document has no script; the header makes sure one could not run
      // even if a snapshot ever grew one by accident.
      expect(response.headers.get('content-security-policy')).toContain(
        "script-src 'none'",
      );
      expect(await response.text()).toContain('frozen');

      expect(
        (await fetch(`${running.url}/api/snapshot/${'b'.repeat(32)}`)).status,
      ).toBe(404);
      expect((await fetch(`${running.url}/api/snapshot/nope`)).status).toBe(
        400,
      );
    } finally {
      await running.close();
    }
  });
});

describe('review server', () => {
  it('refreshes authoritative cards before checking a decision revision', async () => {
    const [card] = buildReviewQueue([
      item('visual:Card#base', 'card', '8px'),
    ]).cards;
    if (!card) throw new Error('the queue should hold one card');
    let changedExternally = false;
    const running = await startReviewServer({
      port: 0,
      cards: [card],
      refreshCards: async () =>
        changedExternally
          ? [{ ...card, revision: 'externally-updated' }]
          : [card],
    });

    try {
      const initial = (await fetch(`${running.url}/api/review`).then(
        (response) => response.json(),
      )) as ReviewApiQueue;
      changedExternally = true;
      const response = await fetch(`${running.url}/api/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: card.shape,
          id: card.id,
          revision: initial.cards[0]?.revision,
          verdict: 'ok',
        }),
      });

      expect(response.status).toBe(409);
      expect(
        (await fetch(`${running.url}/api/review`).then((value) =>
          value.json(),
        )) as ReviewApiQueue,
      ).toMatchObject({
        decisions: 1,
        cards: [{ revision: 'externally-updated' }],
      });
    } finally {
      await running.close();
    }
  });

  it('refuses a stale revision and keeps the card visible', async () => {
    const running = await startReviewServer({
      port: 0,
      items: [item('visual:Card#base', 'card', '8px')],
    });

    try {
      const initial = (await fetch(`${running.url}/api/review`).then(
        (response) => response.json(),
      )) as ReviewApiQueue;
      const card = initial.cards[0];
      expect(card).toBeDefined();
      const response = await fetch(`${running.url}/api/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: card?.shape,
          id: card?.id,
          revision: 'stale',
          verdict: 'ok',
        }),
      });

      expect(response.status).toBe(409);
      expect(
        (await fetch(`${running.url}/api/review`).then((value) =>
          value.json(),
        )) as ReviewApiQueue,
      ).toMatchObject({ decisions: 1 });
    } finally {
      await running.close();
    }
  });

  it('keeps rejected and blocked cards in the human queue', async () => {
    const running = await startReviewServer({
      port: 0,
      items: [item('visual:Card#base', 'card', '8px')],
    });

    try {
      const initial = (await fetch(`${running.url}/api/review`).then(
        (response) => response.json(),
      )) as ReviewApiQueue;
      const card = initial.cards[0];
      const response = await fetch(`${running.url}/api/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: card?.shape,
          id: card?.id,
          revision: card?.revision,
          verdict: 'rejected',
          note: 'still wrong',
        }),
      });

      expect(response.ok).toBe(true);
      expect((await response.json()) as ReviewApiQueue).toMatchObject({
        decisions: 1,
      });
    } finally {
      await running.close();
    }
  });

  it('updates its queue only after a decision is persisted', async () => {
    const decided: string[] = [];
    const running = await startReviewServer({
      port: 0,
      items: [
        {
          subject: 'visual:Card#base',
          reason: 'never attested',
          digest: digestWith('card', '4px'),
        },
        {
          subject: 'visual:Card#scheme=dark',
          reason: 'never attested',
          digest: digestWith('card', '4px'),
        },
      ],
      onDecision: ({ shape }) => void decided.push(shape),
    });

    try {
      const initial = (await fetch(`${running.url}/api/review`).then(
        (response) => response.json(),
      )) as ReviewApiQueue;
      expect(initial).toMatchObject({ items: 2, decisions: 2 });

      const response = await fetch(`${running.url}/api/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: initial.cards[0]?.shape,
          verdict: 'ok',
        }),
      });
      expect(response.ok).toBe(true);
      expect((await response.json()) as ReviewApiQueue).toMatchObject({
        items: 1,
        decisions: 1,
      });
      expect(decided).toEqual([initial.cards[0]?.shape]);

      const html = await fetch(running.url).then((value) => value.text());
      expect(html).toContain('src="/src/main.ts"');
      expect(html).not.toContain('visual:Card#base');
    } finally {
      await running.close();
    }
  });

  it('keeps a card in the queue when persistence fails', async () => {
    const running = await startReviewServer({
      port: 0,
      items: [
        {
          subject: 'visual:Card#base',
          reason: 'never attested',
          digest: digestWith('card', '4px'),
        },
      ],
      onDecision: () => {
        throw new Error('ledger is read-only');
      },
    });

    try {
      const initial = (await fetch(`${running.url}/api/review`).then(
        (response) => response.json(),
      )) as ReviewApiQueue;
      const response = await fetch(`${running.url}/api/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: initial.cards[0]?.shape,
          verdict: 'ok',
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'ledger is read-only' });
      expect(
        (await fetch(`${running.url}/api/review`).then((value) =>
          value.json(),
        )) as ReviewApiQueue,
      ).toMatchObject({ items: 1, decisions: 1 });
    } finally {
      await running.close();
    }
  });

  it('requires a reason before persisting a rejection', async () => {
    const decided: string[] = [];
    const running = await startReviewServer({
      port: 0,
      items: [
        {
          subject: 'visual:Card#base',
          reason: 'never attested',
          digest: digestWith('card', '4px'),
        },
      ],
      onDecision: ({ note }) => void decided.push(note ?? ''),
    });

    try {
      const initial = (await fetch(`${running.url}/api/review`).then(
        (response) => response.json(),
      )) as ReviewApiQueue;
      const response = await fetch(`${running.url}/api/decisions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shape: initial.cards[0]?.shape,
          verdict: 'rejected',
          note: '   ',
        }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: 'review: rejected decisions require a reason.',
      });
      expect(decided).toEqual([]);
      expect(
        (await fetch(`${running.url}/api/review`).then((value) =>
          value.json(),
        )) as ReviewApiQueue,
      ).toMatchObject({ items: 1, decisions: 1 });
    } finally {
      await running.close();
    }
  });
});
