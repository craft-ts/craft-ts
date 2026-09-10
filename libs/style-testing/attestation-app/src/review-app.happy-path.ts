import type { LayoutDigest } from '@craft-ts/style-testing';
import {
  defineHappyPathHttpMocks,
  defineReviewAttestConfig,
  defineVisualAppConfig,
} from '@craft-ts/style-testing';
import {
  buildTemplateReviewCard,
  type AttestationDevtoolModel,
  type TemplateEvidence,
} from '@craft-ts/dev-tools/attestation-review';
import type { ReviewApiQueue } from '@craft-ts/style-testing/review';

export const REVIEW_APP_COMPONENT =
  'component:libs/style-testing/attestation-app/src/review-app.ts:ReviewApp';

const previousEvidence: TemplateEvidence = {
  direction: 'command',
  element: 'button',
  elementName: 'Save',
  target: 'method:profile.save',
  targetKind: 'method',
};

const currentEvidence: TemplateEvidence = {
  ...previousEvidence,
  target: 'property:profile.commit',
  targetKind: 'property',
};

export const reviewAppTemplateCard = buildTemplateReviewCard({
  subject: 'template:component:fixture.ts:ProfileCard#command:profile.commit',
  state: 'review',
  reason: 'the output changed',
  currentEvidenceHash: 'review-app-self-current',
  component: 'component:fixture.ts:ProfileCard',
  statement: 'button "Save" calls profile.commit',
  statementParts: {
    direction: 'command',
    component: 'ProfileCard',
    target: 'profile.commit',
    element: 'button',
    elementName: 'Save',
  },
  currentEvidence,
  previousEvidence,
  hadPreviousAttestation: true,
  currentLeaves: { 'property:profile.commit': '2' },
  previousLeaves: { 'method:profile.save': '1' },
  previousDecision: {
    verdict: 'ok',
    by: 'self-attestation fixture',
    at: '2026-01-01T00:00:00.000Z',
    note: 'The former command was intentional.',
  },
});

export const reviewAppHappyPathModel: Omit<AttestationDevtoolModel, 'cards'> = {
  visualAssets: [
    {
      evidence: 'review-app-self-visual-evidence',
      image: 'review-app-self-visual-image',
      scenarios: ['base'],
    },
  ],
  visualTests: [
    {
      subject: 'visual:component:fixture.ts:ProfileCard#base',
      component: 'ProfileCard',
      scenario: 'base',
      state: 'current',
      evidence: 'review-app-self-visual-evidence',
    },
  ],
  templateObligations: [
    {
      subject: reviewAppTemplateCard.subject,
      component: reviewAppTemplateCard.component,
      direction: 'command',
      statement: reviewAppTemplateCard.statement,
      statementParts: reviewAppTemplateCard.statementParts,
      state: 'review',
      evidence: currentEvidence,
    },
  ],
  diagnostics: [
    {
      code: 'template-obligation-unresolved',
      message: 'One dynamic fixture target still needs a proof.',
    },
  ],
};

export const reviewAppHappyPathQueue: ReviewApiQueue = {
  items: 1,
  decisions: 1,
  cards: [reviewAppTemplateCard],
  history: [],
  ...reviewAppHappyPathModel,
  regeneration: { previousDecisions: 1 },
};

const reviewCloseResponse = {
  closed: true,
  rejectedCards: 0,
  promptPath: '.craft/review-iteration.md',
};

const iterationHandoffResponse = {
  rejectedCards: 0,
  feedbackPath: '.craft/review-feedback.md',
  feedbackJsonPath: '.craft/review-feedback.json',
  promptPath: '.craft/review-iteration.md',
  prompt: '',
  feedback: {
    format: 'craft-ts-review-feedback',
    version: 1,
    generatedAt: '2026-01-01T00:00:00.000Z',
    project: {
      root: '.',
      rootAbsolute: '.',
      ledger: '.craft/attestations.jsonl',
      evidenceDirectory: '.craft/evidence',
    },
    rejectedCards: [],
  },
};

const emptyDigest: LayoutDigest = {
  digestVersion: 1,
  nodes: [],
  signature: {
    columns: {},
    lines: {},
    wrapped: [],
    clipped: [],
    scrollbars: [],
    overlaps: [],
  },
};

export const reviewAppHappyPathMocks = defineHappyPathHttpMocks(
  'review-app.happy-path.ts',
  {
    'GET /api/review': { response: reviewAppHappyPathQueue },
    'POST /api/decisions': { response: reviewAppHappyPathQueue },
    'POST /api/decisions/reopen': { response: reviewAppHappyPathQueue },
    'POST /api/close-review': { response: reviewCloseResponse },
    'POST /api/iteration-handoff': { response: iterationHandoffResponse },
    'POST /api/regenerate': { response: reviewAppHappyPathQueue },
    'GET /api/digest/*': { response: emptyDigest },
  },
);

export const reviewAppVisualTestConfig = defineVisualAppConfig({
  pages: [
    {
      id: 'review-app',
      route: '/',
      url: '/',
      component: REVIEW_APP_COMPONENT,
      mocks: reviewAppHappyPathMocks,
    },
  ],
});

export const reviewAttestConfig = defineReviewAttestConfig({
  visual: { app: reviewAppVisualTestConfig, matrices: [] },
  template: true,
});
