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
import { craftSignal as signal, ɵcomputed as computed } from '@craft-ts/core';
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
}>;

/**
 * The pictures the archive prepared, as far as they are ready, each at its
 * moment: where the replay is once the action it names has run.
 */
const marks = computed((): readonly Mark[] => {
  const steps = replayableEvents();
  const offsets = replayActionOffsetsMs();
  const duration = replayDurationMs();
  return (thumbnailManifest()?.entries ?? []).map((entry) => {
    // The thumbnail names its moment by an action; where this replay has no
    // such action, it counts by the number of actions that had run.
    const position =
      entry.eventId === undefined
        ? 0
        : steps.findIndex((step) => step.id === entry.eventId) + 1 ||
          entry.replayIndex;
    const time = position === 0 ? 0 : (offsets[position - 1] ?? entry.offsetMs);
    const share = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
    return { entry, position, share };
  });
});

/** The thumbnail of the moment the replay is at: the last one not yet passed. */
const currentEntryIndex = computed(() => {
  const done = replayIndex();
  let current: number | undefined;
  for (const mark of marks()) {
    if (mark.position <= done) current = mark.entry.index;
  }
  return current;
});

/** The point whose picture is open: hovered, or focused from the keyboard. */
const openEntryIndex = signal<number | undefined>(undefined);

/** The point's look: the one the replay is at, or one it has already passed. */
function markPhase(item: Mark): 'current' | 'passed' | undefined {
  if (item.entry.index === currentEntryIndex()) return 'current';
  return item.position <= replayIndex() ? 'passed' : undefined;
}

function markCardPhase(item: Mark): 'open' | undefined {
  return item.entry.index === openEntryIndex() ? 'open' : undefined;
}

function openMarkCard(index: number | undefined): void {
  openEntryIndex.set(index);
}

function goToMark(item: Mark): void {
  seekReplayToEvent(item.entry.eventId, item.entry.participantId);
}

/** Where a picture is served from, once the archive has told which ones it holds. */
function markImageUrl(item: Mark): string {
  const manifest = thumbnailManifest();
  return manifest ? thumbnailImageUrl(manifest, item.entry) : '';
}

/** Only a failed preparation can be tried again. */
const retryHidden = computed(() => thumbnailManifest()?.status !== 'failed');

/**
 * What the preparation of the pictures has to say, when it is not simply done:
 * it is under way, or it ended badly and can be tried again.
 */
const summaryHidden = computed(() => {
  const status = thumbnailManifest()?.status;
  return status === undefined || status === 'none' || status === 'ready';
});

/** The points on the timeline: where the replay can be taken with one click. */
export const ReplayThumbnailMarks = craftComponent(
  'ReplayThumbnailMarks',
  {},
  function* () {
    return ul(
      {
        class: ui.marks,
        'data-lab': 'thumbnails',
        'aria-label': 'Aperçus de la session',
      },
      forNode(marks, { track: (mark: Mark) => mark.entry.index }, (mark) =>
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
            button(
              'seekToThumbnail',
              {
                type: 'button',
                class: ui.markPoint,
                'data-mark': function* () {
                  return markPhase(yield* mark());
                },
                'aria-label': function* () {
                  const { entry } = yield* mark();
                  return `${thumbnailActionLabel(entry)} · ${thumbnailCaption(entry)}`;
                },
                pointerenter: function* () {
                  openMarkCard((yield* mark()).entry.index);
                },
                pointerleave: () => openMarkCard(undefined),
                focus: function* () {
                  openMarkCard((yield* mark()).entry.index);
                },
                blur: () => openMarkCard(undefined),
                click: function* () {
                  goToMark(yield* mark());
                },
              },
            ),
            div(
              {
                class: ui.markCard,
                'aria-hidden': 'true',
                'data-mark-card': function* () {
                  return markCardPhase(yield* mark());
                },
              },
              [
                img({
                  class: ui.markImage,
                  alt: function* () {
                    return thumbnailReasonLabel((yield* mark()).entry);
                  },
                  src: function* () {
                    return safeResourceUrl(markImageUrl(yield* mark()), {
                      allowedOrigins: [THUMBNAIL_ORIGIN],
                    });
                  },
                }),
                span({ class: ui.markCaption }, function* () {
                  return thumbnailCaption((yield* mark()).entry);
                }),
                span({ class: ui.markAction }, function* () {
                  return thumbnailActionLabel((yield* mark()).entry);
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

    return div(
      {
        class: ui.timelineNote,
        'data-lab': 'thumbnails-strip',
        hidden: summaryHidden,
      },
      [
        p(
          { 'data-lab': 'thumbnails-summary', role: 'status' },
          computed(thumbnailsSummary),
        ),
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
