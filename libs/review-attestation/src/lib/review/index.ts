/**
 * The review surface: a queue, a diff anybody can read, and a reason.
 *
 * Split in two on purpose. `queue.ts` holds everything worth testing and needs
 * no socket; `server.ts` is the thin shell that puts it on localhost.
 */
export * from './queue.js';
export * from './frame.js';
export * from './server.js';
export * from './handoff.js';
// Migration bridge: the subject-agnostic workflow now lives in dev-tools,
// while visual consumers can keep importing the established review entry.
export {
  buildRemovalReviewCard,
  buildTemplateReviewCard,
  clusterTemplateReviewCards,
  codeLeavesDiff,
  reviewRevision,
  templateDiffSignature,
  templateEvidenceDiff,
  validateReviewDecision,
  type AttestationDevtoolModel,
  type PreviousDecision,
  type RemovalReviewCard,
  type ReviewCardBase,
  type ReviewDecisionRequest as GenericReviewDecisionRequest,
  type TemplateDiagnostic,
  type TemplateEvidence,
  type TemplateReviewCard,
  type VisualReviewCard,
} from '@craft-ts/dev-tools/attestation-review';
