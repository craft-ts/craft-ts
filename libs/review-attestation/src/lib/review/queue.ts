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
import {
  reviewRevision,
  type PreviousDecision,
  type VisualReviewCard as ReviewCardContract,
} from '@craft-ts/dev-tools/attestation-review';

/** What the snapshot said it could not reproduce, recorded at capture time. */
export interface SnapshotRiskNote {
  readonly kind: string;
  readonly detail: string;
}

export interface ReviewItem {
  readonly subject: string;
  /** Why this is in the queue, in one line. */
  readonly reason: string;
  readonly digest: LayoutDigest;
  /** The last digest a human accepted, when there is one. */
  readonly approved?: LayoutDigest;
  /** Evidence hash of the screenshot, for the store. */
  readonly image?: string;
  /**
   * Hash of the attested digest.
   *
   * An address rather than the digest itself: the browser fetches the one card
   * it is showing. Pushing every digest into the queue would put megabytes on
   * the wire for a two-hundred-scenario cluster to answer a question about one.
   */
  readonly evidence?: string;
  /** Evidence hash of the frozen document, when one was captured. */
  readonly snapshot?: string;
  /**
   * What the snapshot declared it could not reproduce.
   *
   * Whether the replay *actually* measures like the attested digest is checked
   * in the browser that shows it, not here: that is the only place the answer
   * is about the document the reviewer is looking at.
   */
  readonly risks?: readonly SnapshotRiskNote[];
  readonly metadata?: VisualCaptureMetadata;
  /** Human feedback from the latest rejected review, when available. */
  readonly rejectionReason?: string;
  readonly previousDecision?: PreviousDecision;
  readonly state?: 'missing' | 'review';
}

export interface ReviewMember {
  readonly subject: string;
  readonly image?: string;
  readonly snapshot?: string;
  readonly evidence?: string;
  readonly risks?: readonly SnapshotRiskNote[];
  readonly metadata?: VisualCaptureMetadata;
  /**
   * Every node this subject attests, as digest paths.
   *
   * The exact set the verdict covers. The review dims everything else, and a
   * finding filed outside it is refused rather than stored — which is what
   * stops a remark about the navigation being recorded against a card that
   * does not cover it.
   */
  readonly attested: readonly string[];
  /** The attested nodes that moved. Why this card is in the queue. */
  readonly changed: readonly string[];
}

export interface ReviewCard extends ReviewCardContract {
  readonly subject: string;
  readonly reason: string;
  /** `.card padding 8→12`, ready to read. */
  readonly changes: readonly string[];
  readonly image?: string;
  readonly snapshot?: string;
  readonly risks?: readonly SnapshotRiskNote[];
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
const OPAQUE_CHANGE =
  'the output changed in a way the readable diff does not show';

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

  const changedByItem = new Map<string, readonly string[]>();
  const attestedByItem = new Map<string, readonly string[]>();

  for (const item of items) {
    const deltas = item.approved ? digestDelta(item.approved, item.digest) : [];
    attestedByItem.set(
      item.subject,
      item.digest.nodes.map((node) => node.path).sort(),
    );
    changedByItem.set(
      item.subject,
      [...new Set(deltas.map((delta) => delta.path))].sort(),
    );
    // Two changed subjects may legitimately share an exact delta. Two new
    // subjects cannot: there is no previous evidence proving that the same
    // change happened. Grouping them here would turn four unseen screenshots
    // into one blind decision.
    // Never empty. `deltaShape([])` is the empty string, and a card addressed
    // by an empty shape is a card no decision can be filed against: the server
    // rejects it as a missing shape and the reviewer is told nothing useful.
    // An empty delta is reachable — the evidence can differ in text content or
    // in the discrete signature, neither of which the readable diff reports —
    // so the case is named rather than left to produce an unusable card.
    const shape = item.approved
      ? deltaShape(deltas) || `${OPAQUE_CHANGE}:${item.subject}`
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
      const cluster = group.map((item) => item.subject).sort();
      const evidence = group
        .map((item) => item.evidence ?? '')
        .sort()
        .join('|');
      return {
        kind: 'visual' as const,
        presenter: 'screenshot-replay' as const,
        id: `visual:${shape}`,
        revision: reviewRevision({
          subject: cluster.join('|'),
          evidence,
          state: group
            .map((item) => item.state ?? 'review')
            .sort()
            .join('|'),
        }),
        state: first.state ?? 'review',
        subject: first.subject,
        reason: first.reason,
        changes: changesByShape.get(shape) ?? [],
        ...(first.image ? { image: first.image } : {}),
        ...(first.snapshot ? { snapshot: first.snapshot } : {}),
        ...(first.risks?.length ? { risks: first.risks } : {}),
        cluster,
        reviewMembers: group
          .map((item) => ({ subject: item.subject, label: item.subject }))
          .sort((left, right) => left.subject.localeCompare(right.subject)),
        members: [...group]
          .sort((left, right) => left.subject.localeCompare(right.subject))
          .map((item) => ({
            subject: item.subject,
            ...(item.image ? { image: item.image } : {}),
            ...(item.snapshot ? { snapshot: item.snapshot } : {}),
            ...(item.evidence ? { evidence: item.evidence } : {}),
            ...(item.risks?.length ? { risks: item.risks } : {}),
            ...(item.metadata ? { metadata: item.metadata } : {}),
            attested: attestedByItem.get(item.subject) ?? [],
            changed: changedByItem.get(item.subject) ?? [],
          })),
        ...(first.rejectionReason
          ? { rejectionReason: first.rejectionReason }
          : {}),
        ...(first.previousDecision
          ? { previousDecision: first.previousDecision }
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
