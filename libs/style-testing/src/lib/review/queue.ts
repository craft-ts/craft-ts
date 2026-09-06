/**
 * The review queue, and the two things that keep it from being abandoned.
 *
 * A queue that asks two hundred questions to collect one answer gets stamped,
 * and a stamped queue is worse than no queue: it records that somebody looked
 * when nobody did. Two mechanisms stop that, and neither is optional.
 *
 * - **the automatic carry-forward** (in `@craft-ts/attest`) keeps everything
 *   whose output did not move out of here entirely;
 * - **clustering by the shape of the diff** collapses the two hundred scenarios
 *   a single border-radius change produced into one decision, and writes the
 *   cluster into every attestation it covers so the decision stays auditable as
 *   having covered all of them.
 *
 * Every card also carries **why** it is here. A reviewer who cannot see what
 * changed and why they are being asked will approve, every time.
 */
import {
  deltaShape,
  digestDelta,
  formatDelta,
  type LayoutDigest,
} from '../digest.js';
import type { VisualCaptureMetadata } from '../attest.js';

export interface ReviewItem {
  readonly subject: string;
  /** Why this is in the queue, in one line. */
  readonly reason: string;
  readonly digest: LayoutDigest;
  /** The last digest a human accepted, when there is one. */
  readonly approved?: LayoutDigest;
  /** Evidence hash of the screenshot, for the store. */
  readonly image?: string;
  readonly metadata?: VisualCaptureMetadata;
  /** Human feedback from the latest rejected review, when available. */
  readonly rejectionReason?: string;
}

export interface ReviewMember {
  readonly subject: string;
  readonly image?: string;
  readonly metadata?: VisualCaptureMetadata;
}

export interface ReviewCard {
  readonly subject: string;
  readonly reason: string;
  /** `.card padding 8→12`, ready to read. */
  readonly changes: readonly string[];
  readonly image?: string;
  /**
   * Subjects whose change reads identically.
   *
   * One decision covers all of them; the list travels into the attestation so
   * the coverage is not a claim anyone has to take on faith.
   */
  readonly cluster: readonly string[];
  /** Every scenario covered by this decision, including its own visual aid. */
  readonly members: readonly ReviewMember[];
  /** Why the latest review rejected this scenario. */
  readonly rejectionReason?: string;
  readonly shape: string;
}

export interface ReviewQueue {
  readonly cards: readonly ReviewCard[];
  /** Cards, before clustering. Used for the count in the header. */
  readonly items: number;
}

const NEW_SUBJECT = 'never attested — nothing to compare against';

/**
 * Groups the queue by the shape of its diff, largest cluster first.
 *
 * Largest first because the biggest cluster is almost always one intentional
 * change, and clearing it first turns a two-hundred-item queue into a
 * five-item one before anybody loses patience.
 */
export function buildReviewQueue(items: readonly ReviewItem[]): ReviewQueue {
  const byShape = new Map<string, ReviewItem[]>();
  const changesByShape = new Map<string, readonly string[]>();

  for (const item of items) {
    const deltas = item.approved ? digestDelta(item.approved, item.digest) : [];
    // Two changed subjects may legitimately share an exact delta. Two new
    // subjects cannot: there is no previous evidence proving that the same
    // change happened. Grouping them here would turn four unseen screenshots
    // into one blind decision.
    const shape = item.approved
      ? deltaShape(deltas)
      : `${NEW_SUBJECT}:${item.subject}`;
    const known = byShape.get(shape);
    if (known) known.push(item);
    else {
      byShape.set(shape, [item]);
      changesByShape.set(shape, deltas.map(formatDelta));
    }
  }

  const cards = [...byShape.entries()]
    .sort(
      ([leftShape, left], [rightShape, right]) =>
        right.length - left.length || leftShape.localeCompare(rightShape),
    )
    .map(([shape, group]) => {
      const first = group[0] as ReviewItem;
      return {
        subject: first.subject,
        reason: first.reason,
        changes: changesByShape.get(shape) ?? [],
        ...(first.image ? { image: first.image } : {}),
        cluster: group.map((item) => item.subject).sort(),
        members: [...group]
          .sort((left, right) => left.subject.localeCompare(right.subject))
          .map((item) => ({
            subject: item.subject,
            ...(item.image ? { image: item.image } : {}),
            ...(item.metadata ? { metadata: item.metadata } : {}),
          })),
        ...(first.rejectionReason
          ? { rejectionReason: first.rejectionReason }
          : {}),
        shape,
      };
    });

  return { cards, items: items.length };
}

export type ReviewDecision = {
  readonly card: ReviewCard;
  readonly verdict:
    | 'ok'
    | 'ok-with-note'
    | 'rejected'
    | 'known-issue'
    | 'blocked';
  readonly note?: string;
};

/**
 * One decision, expanded over the cluster it covers.
 *
 * The cluster is attached to every subject rather than only to the one that was
 * shown, so a later reader can tell "this was judged" from "this was judged
 * alongside 199 others" — which are not the same claim.
 */
export function expandDecision(decision: ReviewDecision): readonly {
  readonly subject: string;
  readonly verdict: ReviewDecision['verdict'];
  readonly note?: string;
  readonly cluster?: readonly string[];
}[] {
  const shared = decision.card.cluster.length > 1;
  return decision.card.cluster.map((subject) => ({
    subject,
    verdict: decision.verdict,
    ...(decision.note ? { note: decision.note } : {}),
    ...(shared ? { cluster: decision.card.cluster } : {}),
  }));
}
