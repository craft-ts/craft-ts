import { craftSleep } from '@craft-ts/core';
import type {
  TemplateCondition,
  TemplateStatementParts,
} from '@craft-ts/dev-tools/attestation-review';
import type { FrameView } from '@craft-ts/style-testing/review/frame';
import type { Messages } from './messages';
import type { Locale } from './preferences';

export const scenarioOf = (subject: string): string =>
  subject.slice(subject.lastIndexOf('#') + 1);

export const componentOf = (subject: string): string => {
  const visual = subject.startsWith('visual:') ? subject.slice(7) : subject;
  return visual.slice(0, visual.lastIndexOf('#'));
};

export const snapshotUrl = (hash: string): string =>
  `/api/snapshot/${encodeURIComponent(hash)}`;

export const imageUrl = (hash: string): string =>
  `/api/evidence/${encodeURIComponent(hash)}`;

export const conditionText = (
  conditions: readonly TemplateCondition[],
  say: Messages,
): string =>
  conditions
    .map((condition) =>
      say.templateCondition(condition.name, condition.expectation),
    )
    .join(say.templateConditionJoiner);

/**
 * Presents the obligation in the reviewer's language while leaving the
 * canonical English `statement` untouched for agencies and exports.
 */
export const templateStatementOf = (
  parts: TemplateStatementParts | undefined,
  rawEnglish: string,
  say: Messages,
  locale: Locale,
): string => {
  // English is the canonical agency-facing sentence. Returning it verbatim
  // also keeps old reports and custom producer wording fully compatible.
  if (locale === 'en' || !parts) return rawEnglish;
  return parts.direction === 'render'
    ? say.templateStatementRender(parts.component, parts.target)
    : say.templateStatementCommand(
        parts.element,
        parts.elementName,
        parts.component,
        parts.target,
      );
};

export const directionText = (
  direction: 'render' | 'command',
  say: Messages,
): string =>
  direction === 'render' ? say.directionRender : say.directionCommand;

export const stateText = (
  state: 'current' | 'renewed' | 'missing' | 'review' | 'removed',
  say: Messages,
): string => {
  switch (state) {
    case 'current':
      return say.stateCurrent;
    case 'renewed':
      return say.stateRenewed;
    case 'missing':
      return say.stateMissing;
    case 'review':
      return say.stateReview;
    case 'removed':
      return say.stateRemoved;
  }
};

/** Translate the finite set of queue reasons while preserving custom notes. */
export const reasonText = (reason: string, say: Messages): string => {
  switch (reason) {
    case 'never attested':
      return say.reasonNeverAttested;
    case 'the retired obligation reappeared':
      return say.reasonRetiredReappeared;
    case 'the output changed':
      return say.reasonOutputChanged;
    case 'the template promise changed':
      return say.reasonTemplateChanged;
    case 'the reductions the verdict rested on changed':
      return say.reasonAssumptionsChanged;
    case 'the template no longer produces this promise':
      return say.reasonTemplateRemoved;
    default: {
      const match = /^last verdict was '([^']+)'$/.exec(reason);
      return match
        ? say.reasonLastVerdict(say.previousVerdict(match[1] ?? ''))
        : reason;
    }
  }
};

/** Keep the diagnostic payload in English while adding a localized summary. */
export const diagnosticSummaryOf = (
  code: string,
  rawEnglish: string,
  say: Messages,
  locale: Locale,
): string =>
  locale === 'fr' && code === 'template-obligation-unresolved'
    ? say.diagnosticUnresolved
    : '';

/**
 * Waits for replay fonts through Craft's cancellable clock.
 *
 * The generic Promise returned by `FontFaceSet.ready` is opaque to a Craft
 * resource. Polling its observable status keeps suspension and cancellation
 * owned by the mutation that is inspecting the replay.
 */
export function* waitForReplayReady(view: FrameView) {
  const attempts = Math.ceil(3000 / 16);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (view.document.fonts.status === 'loaded') return;
    yield* craftSleep(16, { owner: 'review-replay-fonts' });
  }
}
