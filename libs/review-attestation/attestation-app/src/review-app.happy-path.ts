import { createReviewAppMocks } from './review-app.mocks';
import type { LayoutDigest } from '@craft-ts/style-testing';
import {
  defineReviewAttestConfig,
  defineVisualAppConfig,
} from '@craft-ts/style-testing';
import {
  buildTemplateReviewCard,
  type ApplicationCaptureInventoryItem,
  type AttestationDevtoolModel,
  type FolderLayoutReviewCard,
  type TemplateEvidence,
} from '@craft-ts/dev-tools/attestation-review';
import type { ReviewApiQueue } from '@craft-ts/style-testing/review';

export const REVIEW_APP_COMPONENT =
  'component:libs/review-attestation/attestation-app/src/review-app.ts:ReviewApp';

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

export const reviewAppFolderLayoutCard: FolderLayoutReviewCard = {
  kind: 'folder-layout',
  presenter: 'folder-layout',
  id: 'folder-layout:review-app-fixture',
  shape: 'folder-layout:review-app-fixture',
  revision: 'review-app-folder-layout-revision',
  state: 'review',
  subject: 'folder-layout:review-app-fixture',
  reason: 'the folder layout proposal changed',
  cluster: ['folder-layout:review-app-fixture'],
  reviewMembers: [
    { subject: 'folder-layout:review-app-fixture', label: 'folder-layout' },
  ],
  members: [
    {
      subject: 'folder-layout:review-app-fixture',
      attested: [],
      changed: [],
    },
  ],
  changes: ['2 moved', '1 deleted', '1 created', '2 unchanged'],
  sourceGraphHash: 'graph-fixture',
  configHash: 'config-fixture',
  entries: [
    {
      sourcePath: 'src/app/orders/order-page.ts',
      proposedPath: 'src/features/orders/order-page.ts',
      status: 'moved',
      scope: 'feature-local',
      confidence: 0.96,
      reasons: ['route anchor orders'],
    },
    {
      sourcePath: 'src/app/shared/date.ts',
      proposedPath: 'src/shared/date.ts',
      status: 'moved',
      scope: 'global-shared',
      confidence: 0.91,
      reasons: ['shared by two routes'],
    },
    {
      sourcePath: 'src/app/legacy.ts',
      proposedPath: null,
      status: 'deleted',
      reasons: ['outside the frontend inventory'],
    },
    {
      sourcePath: null,
      proposedPath: 'src/core/bootstrap.ts',
      status: 'created',
      scope: 'core',
      confidence: 0.88,
      reasons: ['bootstrap dependency'],
    },
  ],
  statistics: {
    files: 4,
    moves: 2,
    reviews: 1,
    unresolved: 0,
    confidence: { high: 2, medium: 2, low: 0 },
  },
};

const reviewAppViewports: readonly {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}[] = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'wide', width: 2560, height: 1440 },
];

const reviewAppApplicationCaptures: readonly ApplicationCaptureInventoryItem[] =
  reviewAppViewports.map(({ name: viewport, width, height }) => ({
    subject: `visual:component:fixture.ts:ProfileCard#app--profile--list--${viewport}`,
    page: 'Profil',
    scenario: 'profile',
    label: 'Profil enregistré',
    capture: 'page',
    category: 'happy-path',
    viewport,
    dimensions: { width, height },
    state: 'current',
    image: 'review-app-self-visual-image',
    reference: 'review-app-self-visual-image',
    comparison: {
      matches: true,
      diffPixels: 0,
      threshold: 0.1,
      maxDiffPixels: 10,
    },
  }));

export const reviewAppHappyPathModel: Omit<AttestationDevtoolModel, 'cards'> = {
  applicationCaptures: reviewAppApplicationCaptures,
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
  folderLayouts: [
    {
      subject: reviewAppFolderLayoutCard.subject,
      sourceGraphHash: reviewAppFolderLayoutCard.sourceGraphHash,
      configHash: reviewAppFolderLayoutCard.configHash,
      state: 'review',
      entries: reviewAppFolderLayoutCard.entries,
      statistics: reviewAppFolderLayoutCard.statistics,
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

export const reviewAppHappyPathMocks = createReviewAppMocks(
  reviewAppHappyPathQueue,
  reviewCloseResponse,
  iterationHandoffResponse,
  emptyDigest,
);

export const reviewAppVisualTestConfig = defineVisualAppConfig({
  sourceFiles: [
    'libs/review-attestation/attestation-app/src/review-app.style.ts',
  ],
  pages: [
    {
      id: 'review-app',
      route: '/',
      url: '/',
      component: REVIEW_APP_COMPONENT,
      scenarios: [
        {
          id: 'review',
          label: 'Review and regeneration',
          category: 'happy-path',
          mocks: reviewAppHappyPathMocks,
          modals: [
            {
              id: 'regeneration',
              component: REVIEW_APP_COMPONENT,
              target: { name: 'RegenerationDialog' },
            },
          ],
          steps: [
            {
              action: 'capture',
              id: 'review',
              expect: [
                { kind: 'visible', target: { name: 'AcceptReviewCard' } },
              ],
            },
            { action: 'click', target: { name: 'OpenRegenerationDialog' } },
            {
              action: 'capture',
              id: 'regeneration',
              modal: 'regeneration',
              expect: [
                { kind: 'visible', target: { name: 'RegenerationDialog' } },
              ],
            },
            { action: 'click', target: { name: 'CancelRegeneration' } },
            { action: 'click', target: { name: 'ShowApplicationOverview' } },
            {
              action: 'capture',
              id: 'application',
              expect: [
                { kind: 'visible', target: { name: 'ApplicationCategory' } },
                {
                  kind: 'count',
                  target: { name: 'SelectApplicationCapture' },
                  count: 4,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
});

export const reviewAttestConfig = defineReviewAttestConfig({
  visual: { app: reviewAppVisualTestConfig, matrices: [] },
  template: true,
});
