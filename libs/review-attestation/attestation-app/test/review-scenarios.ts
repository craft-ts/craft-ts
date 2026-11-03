import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildRemovalReviewCard,
  buildTemplateReviewCard,
  type TemplateEvidence,
  type VisualReviewCard,
} from '@craft-ts/dev-tools/attestation-review';
import type {
  AttestationReviewCard,
  ReviewDecisionRequest,
  ReviewServerOptions,
} from '../../src/lib/review/server';
import {
  reviewAppFolderLayoutCard,
  reviewAppHappyPathModel,
  reviewAppTemplateCard,
} from '../src/review-app.happy-path';

const savedEvidence: TemplateEvidence = {
  direction: 'command',
  element: 'button',
  elementName: 'Save',
  target: 'method:user.save',
  targetKind: 'method',
};

/** A removed promise: what « Retirer » is for. */
export const removedPromise = buildRemovalReviewCard({
  subject: 'template:component:profile.ts:UserCard#command:user.save',
  component: 'component:profile.ts:UserCard',
  evidenceHash: 'proof-removed',
  previousEvidence: savedEvidence,
  previousDecision: {
    verdict: 'ok',
    by: 'romain',
    at: '2026-09-07T09:00:00.000Z',
    note: 'Intentional.',
  },
});

const promise = (
  component: string,
  name: string,
  policy: 'human-required' | 'agent-allowed' = 'agent-allowed',
) =>
  buildTemplateReviewCard({
    subject: `template:${component}#render:${name}`,
    component,
    state: 'missing',
    reason: 'New promise',
    statement: `${component} displays ${name}.`,
    statementParts: { direction: 'render', component, target: name },
    currentEvidenceHash: `${component}-${name}`,
    contextHash: 'context-1',
    validationPolicy: policy,
    conditions: [{ kind: 'if', name: 'loaded', expectation: 'true' }],
    currentEvidence: {
      direction: 'render',
      element: null,
      elementName: null,
      target: name,
      targetKind: 'state',
    },
    hadPreviousAttestation: false,
    currentLeaves: {},
  });

/** Two components' template promises, one of them for a human only. */
export const profileName = promise('Profile', 'Name');
export const profilePermissions = promise('Profile', 'Permissions', 'human-required');
export const orderTotal = promise('Order', 'Total');

/** A screenshot to decide on, from the application overview or the visual tests. */
const screenshot = (subject: string, label: string): VisualReviewCard => ({
  kind: 'visual',
  presenter: 'screenshot-replay',
  evidenceMode: 'screenshot',
  id: `visual:${label}`,
  revision: `${label}-revision`,
  state: 'review',
  subject,
  shape: subject,
  reason: 'the screenshot changed',
  cluster: [subject],
  changes: [],
  reviewMembers: [{ subject, label }],
  members: [{ subject, attested: [], changed: [] }],
  image: 'review-app-self-visual-image',
});
export const profileMobileCapture = screenshot(
  'visual:component:fixture.ts:ProfileCard#app--profile--list--mobile',
  'profile-mobile',
);
export const profileBaseScreenshot = screenshot(
  'visual:component:fixture.ts:ProfileCard#base',
  'profile-base',
);

const handoffRoot = () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'craft-review-app-'));
  return {
    rootDir,
    ledgerPath: join(rootDir, '.craft', 'attestations.jsonl'),
    evidenceDirectory: join(rootDir, '.craft', 'evidence'),
  };
};

/** What each scenario's review server starts with. */
export const reviewScenarios = {
  /** One template change to accept, then reopen. */
  decisions: {
    cards: [reviewAppTemplateCard, removedPromise],
    model: reviewAppHappyPathModel,
  },
  /** A removed promise to retire, with its reason. */
  removal: {
    cards: [reviewAppTemplateCard, removedPromise],
    model: reviewAppHappyPathModel,
  },
  /** Evidence to regenerate, and a review to hand back to Codex. */
  iteration: {
    cards: [reviewAppTemplateCard, removedPromise],
    model: reviewAppHappyPathModel,
    previousDecisions: 1,
    regenerate: async () => ({
      cards: [reviewAppTemplateCard, removedPromise],
      model: reviewAppHappyPathModel,
      previousDecisions: 0,
    }),
    iteration: handoffRoot(),
  },
  /** Template promises an agent may judge, except the one kept for a human. */
  templates: {
    cards: [profileName, profilePermissions, orderTotal],
    // The ledger's answer: the card now carries the decision just made.
    onDecision: (() => {
      let cards: readonly AttestationReviewCard[] = [profileName, profilePermissions, orderTotal];
      return (decision: ReviewDecisionRequest) => {
        cards = cards.map((card) =>
          card.id === decision.id
            ? {
                ...card,
                previousDecision: {
                  verdict: decision.verdict as 'ok',
                  by: 'reviewer',
                  at: '2026-11-03T08:00:00.000Z',
                  ...(decision.note ? { note: decision.note } : {}),
                },
              }
            : card,
        ) as readonly AttestationReviewCard[];
        return cards;
      };
    })(),
    templateAgent: {
      name: 'Review agent',
      run: async (selected) =>
        selected.map((card) => ({
          id: card.id,
          outcome: 'accepted' as const,
          rationale: 'The requirement covers this promise.',
          references: ['requirements.md'],
        })),
    },
  },
  /** The same proposal, its apply command declined. */
  folderLayoutDeclined: {
    cards: [reviewAppFolderLayoutCard],
    model: reviewAppHappyPathModel,
    folderLayoutApply: {
      command: 'npx craft-ts organize --apply',
      gitCommands: 'git mv src/app/orders/order-page.ts src/features/orders/order-page.ts',
      moves: 2,
      deletions: 1,
      manualReviews: 1,
      run: async () => undefined,
    },
  },
  /** A folder layout proposal, applied once accepted. */
  folderLayout: {
    cards: [reviewAppFolderLayoutCard],
    model: reviewAppHappyPathModel,
    folderLayoutApply: {
      command: 'npx craft-ts organize --apply',
      gitCommands: 'git mv src/app/orders/order-page.ts src/features/orders/order-page.ts',
      moves: 2,
      deletions: 1,
      manualReviews: 1,
      run: async () => undefined,
    },
  },
  /** The app's own visual tests, application captures and bypasses. */
  inventory: {
    cards: [reviewAppTemplateCard, profileMobileCapture, profileBaseScreenshot],
    model: {
      ...reviewAppHappyPathModel,
      // The mobile capture changed: the one to look at next.
      applicationCaptures: (reviewAppHappyPathModel.applicationCaptures ?? []).map((capture) =>
        capture.subject === profileMobileCapture.subject ? { ...capture, state: 'review' as const } : capture,
      ),
      bypasses: [
        {
          subject: 'bypass:eslint-disable:src/main.ts:3',
          kind: 'eslint-disable' as const,
          rule: 'no-console',
          reason: 'The boot banner.',
          filePath: 'src/main.ts',
          line: 3,
          state: 'current' as const,
        },
        {
          subject: 'bypass:eslint-disable:src/legacy.ts:9',
          kind: 'eslint-disable' as const,
          rule: 'no-alert',
          reason: 'Kept until the dialog lands.',
          filePath: 'src/legacy.ts',
          line: 9,
          state: 'current' as const,
        },
      ],
    },
  },
  /** Closed at the end of its test: nothing else may use it. */
  closing: {
    cards: [reviewAppTemplateCard],
    model: reviewAppHappyPathModel,
    iteration: handoffRoot(),
  },
} satisfies Record<string, ReviewServerOptions>;

export type ReviewScenario = keyof typeof reviewScenarios;

declare module 'vitest' {
  export interface ProvidedContext {
    /** Each scenario's review server, started by review-servers.global-setup.ts. */
    reviewServers: Record<ReviewScenario, string>;
  }
}
