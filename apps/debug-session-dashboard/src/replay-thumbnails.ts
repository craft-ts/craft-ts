import {
  button,
  craftComponent,
  div,
  forNode,
  img,
  li,
  p,
  safeResourceUrl,
  span,
  ul,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { assign, unit } from '@craft-ts/style';
import { buttonUi } from '@craft-ts/ui/style';
import { markVars, ui } from './dashboard.style';
import {
  replayDurationMs,
  thumbnailActionLabel,
  thumbnailCaption,
  thumbnailReasonLabel,
  thumbnailsSummary,
} from './replay-labels';
import { ReplayRoute } from './replay-route.service';
import { seekReplayToEvent } from './replay-session';
import {
  replayActionOffsetsMs,
  replayIndex,
  replayableEvents,
  thumbnailManifest,
} from './replay-state';
import { ThumbnailPreview } from './thumbnail-preview.service';
import {
  THUMBNAIL_ORIGIN,
  thumbnailImageUrl,
  type ThumbnailEntry,
} from './thumbnail-archive.service';

/** A thumbnail, placed on the timeline of the replay it belongs to. */
type Mark = Readonly<{
  entry: ThumbnailEntry;
  /** Actions that had run when the picture was taken, in this replay. */
  position: number;
  /** How far along the recording that moment is, as a percentage. */
  share: number;
  phase: 'current' | 'passed' | undefined;
  cardPhase: 'open' | undefined;
}>;

/**
 * The pictures the archive prepared, as far as they are ready, each at its
 * moment: where the replay is once the action it names has run.
 */
/** The point's look: the one the replay is at, or one it has already passed. */
function goToMark(item: Mark): void {
  seekReplayToEvent(item.entry.eventId, item.entry.participantId);
}

/** Where a picture is served from, once the archive has told which ones it holds. */
function markImageUrl(item: Mark): string {
  const manifest = thumbnailManifest();
  return manifest ? thumbnailImageUrl(manifest, item.entry) : '';
}

/** The points on the timeline: where the replay can be taken with one click. */
export const ReplayThumbnailMarks = craftComponent(
  'ReplayThumbnailMarks',
  {},
  function* () {
    const marks = yield* craftComputed('marks', function* () {
      const steps = replayableEvents();
      const offsets = replayActionOffsetsMs();
      const duration = replayDurationMs();
      return (thumbnailManifest()?.entries ?? []).map((entry) => {
        const position =
          entry.eventId === undefined
            ? 0
            : steps.findIndex((step) => step.id === entry.eventId) + 1 ||
              entry.replayIndex;
        const time =
          position === 0 ? 0 : (offsets[position - 1] ?? entry.offsetMs);
        const share = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
        return { entry, position, share };
      });
    });
    const currentEntryIndex = yield* craftComputed(
      'currentEntryIndex',
      function* () {
        const done = replayIndex();
        return (yield* marks()).reduce<number | undefined>(
          (current, mark) =>
            mark.position <= done ? mark.entry.index : current,
          undefined,
        );
      },
    );
    const preview = yield* ThumbnailPreview();
    const renderedMarks = yield* craftComputed('renderedMarks', function* () {
      const current = yield* currentEntryIndex();
      const open = yield* preview.openEntryIndex();
      const done = replayIndex();
      return (yield* marks()).map<Mark>((mark) => ({
        ...mark,
        phase:
          mark.entry.index === current
            ? 'current'
            : mark.position <= done
              ? 'passed'
              : undefined,
        cardPhase: mark.entry.index === open ? 'open' : undefined,
      }));
    });

    return ul(
      {
        class: ui.marks,
        'data-lab': 'thumbnails',
        'aria-label': 'Aperçus de la session',
      },
      forNode(
        renderedMarks,
        { track: (mark: Mark) => mark.entry.index },
        (mark) =>
          li(
            {
              class: ui.mark,
              'data-lab': 'thumbnail',
              style: function* () {
                const item = yield* mark();
                return {
                  ...assign(markVars.at, unit.pct(item.share)),
                  ...assign(markVars.shift, unit.pct(-item.share)),
                };
              },
            },
            [
              button('seekToThumbnail', {
                type: 'button',
                class: ui.markPoint,
                'data-mark': function* () {
                  const item = yield* mark();
                  return item.phase;
                },
                'aria-label': function* () {
                  const { entry } = yield* mark();
                  return `${thumbnailActionLabel(entry)} · ${thumbnailCaption(entry)}`;
                },
                pointerenter: function* () {
                  const item = yield* mark();
                  yield* preview.show(item.entry.index);
                },
                pointerleave: function* () {
                  yield* preview.show(undefined);
                },
                focus: function* () {
                  const item = yield* mark();
                  yield* preview.show(item.entry.index);
                },
                blur: function* () {
                  yield* preview.show(undefined);
                },
                click: function* () {
                  goToMark(yield* mark());
                },
              }),
              div(
                {
                  class: ui.markCard,
                  'aria-hidden': 'true',
                  'data-mark-card': function* () {
                    const item = yield* mark();
                    return item.cardPhase;
                  },
                },
                [
                  img({
                    class: ui.markImage,
                    alt: function* () {
                      const item = yield* mark();
                      return thumbnailReasonLabel(item.entry);
                    },
                    src: function* () {
                      const item = yield* mark();
                      return safeResourceUrl(markImageUrl(item), {
                        allowedOrigins: [THUMBNAIL_ORIGIN],
                      });
                    },
                  }),
                  span({ class: ui.markCaption }, function* () {
                    const item = yield* mark();
                    return thumbnailCaption(item.entry);
                  }),
                  span({ class: ui.markAction }, function* () {
                    const item = yield* mark();
                    return thumbnailActionLabel(item.entry);
                  }),
                ],
              ),
            ],
          ),
      ),
    );
  },
);

/** The line about the pictures, shown while they are being made or when they failed. */
export const ReplayThumbnailsStatus = craftComponent(
  'ReplayThumbnailsStatus',
  {},
  function* () {
    const route = yield* ReplayRoute();
    const retryHidden = yield* craftComputed(
      'retryHidden',
      () => thumbnailManifest()?.status !== 'failed',
    );
    const summaryHidden = yield* craftComputed('summaryHidden', () => {
      const status = thumbnailManifest()?.status;
      return status === undefined || status === 'none' || status === 'ready';
    });
    const summary = yield* craftComputed('summary', thumbnailsSummary);

    return div(
      {
        class: ui.timelineNote,
        'data-lab': 'thumbnails-strip',
        hidden: summaryHidden,
      },
      [
        p({ 'data-lab': 'thumbnails-summary', role: 'status' }, summary),
        // The button's own display wins over `hidden`: the wrapper carries it.
        span({ hidden: retryHidden }, [
          button(
            'retryThumbnails',
            {
              type: 'button',
              class: buttonUi.root,
              'data-variant': 'link',
              'data-lab': 'thumbnails-retry',
              click: route.retryThumbnails,
            },
            'Réessayer',
          ),
        ]),
      ],
    );
  },
);
