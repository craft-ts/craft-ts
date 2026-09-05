import { describe, expect, it } from 'vitest';
import { buildReviewQueue, expandDecision, type ReviewItem } from './queue.ts';
import { renderReviewPage } from './server.ts';
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
});

describe('expandDecision', () => {
  it('writes the cluster into every attestation the decision covers', () => {
    const queue = buildReviewQueue([item('a', 'card', '8px'), item('b', 'card', '8px')]);
    const expanded = expandDecision({
      card: queue.cards[0]!,
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
    expect(expandDecision({ card: queue.cards[0]!, verdict: 'ok' })[0]?.cluster).toBeUndefined();
  });
});

describe('renderReviewPage', () => {
  it('shows why a card is there and what changed', () => {
    const queue = buildReviewQueue([item('visual:Card#base', 'card', '8px')]);
    const html = renderReviewPage(queue.cards, queue.items);
    expect(html).toContain('the output changed');
    expect(html).toContain('border-radius 4px→8px');
    expect(html).toContain('<kbd>a</kbd> accept');
  });

  it('escapes a subject rather than pasting it into the markup', () => {
    const queue = buildReviewQueue([
      {
        subject: 'visual:<script>alert(1)</script>#base',
        reason: 'never attested',
        digest: digestWith('card', '4px'),
      },
    ]);
    const html = renderReviewPage(queue.cards, queue.items);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
