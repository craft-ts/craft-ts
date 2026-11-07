import { defineBehaviorWaivers } from '@craft-ts/dev-tools/behavior-catalog';
import { behaviorCatalog } from './behaviors.catalog';

/**
 * Behaviours left without a test on purpose, each with its reason:
 * `{ rule: 'behavior-unproven', target: '<id from behaviors.catalog.ts>', reason }`.
 *
 * A new behaviour arrives with its test or with an entry here. An entry whose
 * behaviour is gone fails the check: remove it with the code it excused.
 */
/**
 * The live replay drives a frozen page inside an iframe: it measures it, marks
 * it and listens for picks in its document. jsdom loads no frame content, so
 * these are proven in a browser by `e2e/review-replay.spec.ts`, whose traces do
 * not reach the unit proof index.
 */
const LIVE_REPLAY =
  'Driven inside the replay iframe, which jsdom does not load: proven in a browser by e2e/review-replay.spec.ts.';

export const behaviorWaiverList = defineBehaviorWaivers(behaviorCatalog, [
  {
    rule: 'behavior-unproven',
    target: 'async-process:ReviewAppModel.inspectReplay#success',
    reason: LIVE_REPLAY,
  },
  {
    rule: 'behavior-unproven',
    target: 'method:ReviewAppModel.changeZoomFromEvent',
    reason: LIVE_REPLAY,
  },
  {
    rule: 'behavior-unproven',
    target: 'method:ReviewAppModel.inspectFrame',
    reason: LIVE_REPLAY,
  },
  {
    rule: 'behavior-unproven',
    target: 'method:ReviewAppModel.previewMention',
    reason: LIVE_REPLAY,
  },
  {
    rule: 'behavior-unproven',
    target: 'method:ReviewAppModel.previewMentionFromEvent',
    reason: LIVE_REPLAY,
  },
  {
    rule: 'behavior-unproven',
    target: 'method:ReviewAppModel.selectNodes',
    reason: LIVE_REPLAY,
  },
  {
    rule: 'behavior-unproven',
    target: 'method:ReviewAppModel.showBand',
    reason: LIVE_REPLAY,
  },
  {
    rule: 'behavior-unproven',
    target: 'method:ReviewAppModel.toggleChrome',
    reason: LIVE_REPLAY,
  },
  {
    rule: 'behavior-unproven',
    target: 'method:ReviewAppModel.trackSelection',
    reason: LIVE_REPLAY,
  },
]);
