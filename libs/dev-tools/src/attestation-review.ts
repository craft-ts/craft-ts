/**
 * Subject-agnostic workflow contracts for the attestation DevTool.
 *
 * This entry owns review navigation and decisions, not the representation of
 * evidence. Visual, template and removal presenters enrich the same base card.
 */
import { createHash } from 'node:crypto';

export type ReviewCardKind = 'visual' | 'template' | 'removal';
export type ReviewableState = 'missing' | 'review';
export type ReviewVerdict =
  | 'ok'
  | 'ok-with-note'
  | 'known-issue'
  | 'rejected'
  | 'blocked';
export type RetirementReason = 'superseded' | 'defect' | 'derivation';

export interface PreviousDecision {
  readonly verdict: ReviewVerdict;
  readonly by: string;
  readonly at: string;
  readonly note?: string;
}

export interface ReviewMember {
  readonly subject: string;
  readonly label: string;
}

/** Compatibility projection consumed by the existing visual presenter. */
export interface PresenterMember {
  readonly subject: string;
  readonly image?: string;
  readonly snapshot?: string;
  readonly evidence?: string;
  readonly risks?: readonly {
    readonly kind: string;
    readonly detail: string;
  }[];
  readonly metadata?: {
    readonly viewport?: { readonly width: number; readonly height: number };
    readonly screenshot?: { readonly width: number; readonly height: number };
    readonly origin?: { readonly x: number; readonly y: number };
    readonly visibleBand?: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly target?: string;
    readonly colorScheme?: 'light' | 'dark' | 'no-preference';
    readonly browser?: { readonly name: string; readonly version: string };
    readonly coverage?: {
      readonly attested: number;
      readonly offScreen: number;
      readonly occluded: number;
    };
    readonly offScreen?: readonly string[];
    readonly occluded?: readonly {
      readonly path: string;
      readonly by: string;
    }[];
  };
  readonly attested: readonly string[];
  readonly changed: readonly string[];
}

export interface ReviewCardBase {
  readonly kind: ReviewCardKind;
  readonly id: string;
  readonly revision: string;
  readonly state: ReviewableState | 'removed';
  readonly subject: string;
  readonly reason: string;
  readonly cluster: readonly string[];
  readonly previousDecision?: PreviousDecision;
  /** Stable key retained for compatibility with the visual review API. */
  readonly shape: string;
  readonly changes: readonly string[];
  readonly reviewMembers: readonly ReviewMember[];
  readonly members: readonly PresenterMember[];
  readonly image?: string;
  readonly snapshot?: string;
  readonly risks?: readonly {
    readonly kind: string;
    readonly detail: string;
  }[];
  readonly rejectionReason?: string;
}

export interface VisualReviewCard extends ReviewCardBase {
  readonly kind: 'visual';
  readonly presenter: 'screenshot-replay';
}

export interface TemplateEvidence {
  readonly direction: 'render' | 'command';
  readonly element: string | null;
  readonly elementName: string | null;
  readonly target: string;
  readonly targetKind: string;
}

export type TemplateEvidenceField = keyof TemplateEvidence;

export interface SemanticChange {
  readonly field: TemplateEvidenceField;
  readonly before: string | null;
  readonly after: string | null;
}

export interface CodeLeafChange {
  readonly leaf: string;
  readonly before?: string;
  readonly after?: string;
}

export interface CodeLeafDiff {
  readonly added: readonly CodeLeafChange[];
  readonly removed: readonly CodeLeafChange[];
  readonly changed: readonly CodeLeafChange[];
}

export interface TemplateReviewCard extends ReviewCardBase {
  readonly kind: 'template';
  readonly presenter: 'template-obligation';
  readonly component: string;
  readonly direction: 'render' | 'command';
  readonly statement: string;
  readonly currentEvidence: TemplateEvidence;
  /** Absent for a new subject and for ledgers created before readable proofs. */
  readonly previousEvidence?: TemplateEvidence;
  readonly previousEvidenceUnavailable: boolean;
  readonly semanticDiff: readonly SemanticChange[];
  readonly codeDiff: CodeLeafDiff;
}

export interface RemovalReviewCard extends ReviewCardBase {
  readonly kind: 'removal';
  readonly presenter: 'retirement';
  readonly component: string;
  readonly previousEvidence?: TemplateEvidence;
  readonly previousEvidenceUnavailable: boolean;
}

export type ReviewCard =
  | VisualReviewCard
  | TemplateReviewCard
  | RemovalReviewCard;

export interface TemplateDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly component?: string;
  readonly filePath?: string;
  readonly line?: number;
}

export interface VisualAssetInventoryItem {
  readonly evidence: string;
  readonly image?: string;
  readonly snapshot?: string;
  readonly scenarios: readonly string[];
}

export interface VisualTestInventoryItem {
  readonly subject: string;
  readonly component: string;
  readonly scenario: string;
  readonly state: 'current' | 'renewed' | 'missing' | 'review';
  readonly evidence: string;
  readonly previousEvidence?: string;
}

export interface TemplateInventoryItem {
  readonly subject: string;
  readonly component: string;
  readonly direction: 'render' | 'command';
  readonly statement: string;
  readonly state: 'current' | 'renewed' | 'missing' | 'review';
  readonly evidence: TemplateEvidence;
}

export interface AttestationDevtoolModel {
  readonly visualAssets: readonly VisualAssetInventoryItem[];
  readonly visualTests: readonly VisualTestInventoryItem[];
  readonly templateObligations: readonly TemplateInventoryItem[];
  readonly diagnostics: readonly TemplateDiagnostic[];
  readonly cards: readonly ReviewCard[];
}

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(',')}}`;
};

const hash = (value: unknown): string =>
  createHash('sha256').update(canonical(value)).digest('hex').slice(0, 32);

export const reviewRevision = (value: {
  readonly subject: string;
  readonly evidence: string;
  readonly state: string;
}): string => hash(value);

const EVIDENCE_FIELDS: readonly TemplateEvidenceField[] = [
  'direction',
  'element',
  'elementName',
  'target',
  'targetKind',
];

export function templateEvidenceDiff(
  before: TemplateEvidence | undefined,
  after: TemplateEvidence,
): readonly SemanticChange[] {
  if (!before) return [];
  return EVIDENCE_FIELDS.flatMap((field) =>
    before[field] === after[field]
      ? []
      : [{ field, before: before[field], after: after[field] }],
  );
}

export function codeLeavesDiff(
  before: Readonly<Record<string, string>> | undefined,
  after: Readonly<Record<string, string>>,
): CodeLeafDiff {
  if (!before) return { added: [], removed: [], changed: [] };
  const added = Object.keys(after)
    .filter((leaf) => before[leaf] === undefined)
    .sort()
    .map((leaf) => ({ leaf, after: after[leaf] as string }));
  const removed = Object.keys(before)
    .filter((leaf) => after[leaf] === undefined)
    .sort()
    .map((leaf) => ({ leaf, before: before[leaf] as string }));
  const changed = Object.keys(after)
    .filter(
      (leaf) => before[leaf] !== undefined && before[leaf] !== after[leaf],
    )
    .sort()
    .map((leaf) => ({
      leaf,
      before: before[leaf] as string,
      after: after[leaf] as string,
    }));
  return { added, removed, changed };
}

const display = (value: string | null): string => value ?? '∅';

const semanticLines = (changes: readonly SemanticChange[]): readonly string[] =>
  changes.map(
    (change) =>
      `${change.field}: ${display(change.before)} → ${display(change.after)}`,
  );

export const templateDiffSignature = (
  current: TemplateEvidence,
  changes: readonly SemanticChange[],
): string | undefined => {
  if (changes.length === 0) return undefined;
  const element = `${current.element ?? '∅'}/${current.elementName ?? '∅'}`;
  return `${current.direction}:${element}:${changes
    .map(
      (change) =>
        `${change.field}:${display(change.before)}→${display(change.after)}`,
    )
    .join('|')}`;
};

export interface TemplateReviewCardInput {
  readonly subject: string;
  readonly state: ReviewableState;
  readonly reason: string;
  readonly currentEvidenceHash: string;
  readonly component: string;
  readonly statement: string;
  readonly currentEvidence: TemplateEvidence;
  readonly previousEvidence?: TemplateEvidence;
  readonly hadPreviousAttestation: boolean;
  readonly currentLeaves: Readonly<Record<string, string>>;
  readonly previousLeaves?: Readonly<Record<string, string>>;
  readonly previousDecision?: PreviousDecision;
}

export function buildTemplateReviewCard(
  input: TemplateReviewCardInput,
): TemplateReviewCard {
  const semanticDiff = templateEvidenceDiff(
    input.previousEvidence,
    input.currentEvidence,
  );
  const codeDiff = codeLeavesDiff(input.previousLeaves, input.currentLeaves);
  const signature = templateDiffSignature(input.currentEvidence, semanticDiff);
  const shape = signature ?? `template:${input.subject}`;
  return {
    kind: 'template',
    presenter: 'template-obligation',
    id: `template:${hash({ subject: input.subject, shape })}`,
    revision: reviewRevision({
      subject: input.subject,
      evidence: input.currentEvidenceHash,
      state: input.state,
    }),
    state: input.state,
    subject: input.subject,
    reason: input.reason,
    cluster: [input.subject],
    ...(input.previousDecision
      ? { previousDecision: input.previousDecision }
      : {}),
    shape,
    changes: semanticLines(semanticDiff),
    reviewMembers: [{ subject: input.subject, label: input.component }],
    members: [{ subject: input.subject, attested: [], changed: [] }],
    component: input.component,
    direction: input.currentEvidence.direction,
    statement: input.statement,
    currentEvidence: input.currentEvidence,
    ...(input.previousEvidence
      ? { previousEvidence: input.previousEvidence }
      : {}),
    previousEvidenceUnavailable:
      input.hadPreviousAttestation && !input.previousEvidence,
    semanticDiff,
    codeDiff,
  };
}

/** Group only exact before/after template changes; new subjects stay separate. */
export function clusterTemplateReviewCards(
  cards: readonly TemplateReviewCard[],
): readonly TemplateReviewCard[] {
  const groups = new Map<string, TemplateReviewCard[]>();
  for (const card of cards) {
    const canGroup =
      card.previousEvidence !== undefined && card.semanticDiff.length > 0;
    const key = canGroup ? card.shape : `${card.shape}:${card.subject}`;
    const group = groups.get(key);
    if (group) group.push(card);
    else groups.set(key, [card]);
  }
  return [...groups.values()]
    .map((group) => {
      const sorted = [...group].sort((left, right) =>
        left.subject.localeCompare(right.subject),
      );
      const first = sorted[0] as TemplateReviewCard;
      const cluster = sorted.map((card) => card.subject);
      return {
        ...first,
        id: `template:${hash({ shape: first.shape, cluster })}`,
        cluster,
        reviewMembers: sorted.map((card) => ({
          subject: card.subject,
          label: card.component,
        })),
        members: sorted.map((card) => ({
          subject: card.subject,
          attested: [],
          changed: [],
        })),
      };
    })
    .sort(
      (left, right) =>
        right.cluster.length - left.cluster.length ||
        left.subject.localeCompare(right.subject),
    );
}

export interface RemovalReviewCardInput {
  readonly subject: string;
  readonly component: string;
  readonly evidenceHash: string;
  readonly previousEvidence?: TemplateEvidence;
  readonly previousDecision: PreviousDecision;
}

export function buildRemovalReviewCard(
  input: RemovalReviewCardInput,
): RemovalReviewCard {
  const shape = `removal:${input.subject}`;
  return {
    kind: 'removal',
    presenter: 'retirement',
    id: shape,
    revision: reviewRevision({
      subject: input.subject,
      evidence: input.evidenceHash,
      state: 'removed',
    }),
    state: 'removed',
    subject: input.subject,
    reason: 'the template no longer produces this promise',
    cluster: [input.subject],
    previousDecision: input.previousDecision,
    shape,
    changes: ['obligation removed'],
    reviewMembers: [{ subject: input.subject, label: input.component }],
    members: [{ subject: input.subject, attested: [], changed: [] }],
    component: input.component,
    ...(input.previousEvidence
      ? { previousEvidence: input.previousEvidence }
      : {}),
    previousEvidenceUnavailable: input.previousEvidence === undefined,
  };
}

export type ReviewDecisionRequest =
  | {
      readonly id: string;
      readonly revision: string;
      readonly verdict: ReviewVerdict;
      readonly note?: string;
    }
  | {
      readonly id: string;
      readonly revision: string;
      readonly verdict: 'retire';
      readonly retirementReason: RetirementReason;
      readonly note: string;
    };

export function validateReviewDecision(
  card: ReviewCard,
  decision: ReviewDecisionRequest,
): string | undefined {
  if (decision.id !== card.id) return 'that review card no longer exists';
  if (decision.revision !== card.revision) {
    return 'that review card changed; reload it before deciding';
  }
  if (card.kind === 'removal') {
    if (decision.verdict !== 'retire') return 'a removal requires Retire';
    if (!decision.note.trim()) return 'a retirement comment is required';
    return undefined;
  }
  if (decision.verdict === 'retire') return 'Retire only applies to removals';
  if (decision.verdict === 'rejected' && !decision.note?.trim()) {
    return 'a rejected decision requires a comment';
  }
  if (decision.verdict === 'ok-with-note' && !decision.note?.trim()) {
    return 'Accept with note requires a comment';
  }
  return undefined;
}
