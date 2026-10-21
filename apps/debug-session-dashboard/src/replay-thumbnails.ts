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
import { ɵcomputed as computed } from '@craft-ts/core';
import { buttonUi } from '@craft-ts/ui/style';
import { ui } from './dashboard.style';
import { thumbnailCaption, thumbnailReasonLabel, thumbnailsSummary } from './replay-labels';
import { ReplayRoute } from './replay-route.service';
import { seekReplayToEvent } from './replay-session';
import { replayIndex, replayableEvents, thumbnailManifest } from './replay-state';
import {
  THUMBNAIL_ORIGIN,
  thumbnailImageUrl,
  type ThumbnailEntry,
} from './thumbnail-archive.service';

/** The pictures the archive prepared, as far as they are ready. */
const entries = computed(() => thumbnailManifest()?.entries ?? []);

/** The thumbnail of the moment the replay is at: the last one not yet passed. */
const currentEntryIndex = computed(() => {
  const done = replayIndex();
  const steps = replayableEvents();
  let current: number | undefined;
  for (const entry of entries()) {
    // The thumbnail names its moment by an action; where this replay has no
    // such action, it counts by the number of actions that had run.
    const position =
      entry.eventId === undefined
        ? 0
        : steps.findIndex((step) => step.id === entry.eventId) + 1 ||
          entry.replayIndex;
    if (position <= done) current = entry.index;
  }
  return current;
});

/** Whether the strip has anything to say: the preparation started, or ended badly. */
const hidden = computed(() => {
  const manifest = thumbnailManifest();
  return manifest === undefined || manifest.status === 'none';
});

/** The strip of thumbnails: where the replay can be taken with one click. */
export const ReplayThumbnails = craftComponent(
  'ReplayThumbnails',
  {},
  function* () {
    const route = yield* ReplayRoute();

    const head = div({ class: ui.thumbsHead }, [
      p(
        { 'data-lab': 'thumbnails-summary', role: 'status' },
        computed(thumbnailsSummary),
      ),
      button(
        'retryThumbnails',
        {
          type: 'button',
          class: buttonUi.root,
          'data-variant': 'link',
          'data-lab': 'thumbnails-retry',
          hidden: computed(() => {
            const status = thumbnailManifest()?.status;
            return status !== 'failed';
          }),
          click: route.retryThumbnails,
        },
        'Réessayer',
      ),
    ]);

    const row = ul(
      {
        class: ui.thumbsRow,
        'data-lab': 'thumbnails',
        'aria-label': 'Aperçus de la session',
      },
      forNode(
        entries,
        { track: (entry: ThumbnailEntry) => entry.index },
        (entry) =>
          li([
            button(
              'seekToThumbnail',
              {
                type: 'button',
                class: ui.thumb,
                'data-lab': 'thumbnail',
                'data-thumb': function* () {
                  const item = yield* entry();
                  return item.index === currentEntryIndex()
                    ? 'current'
                    : undefined;
                },
                'aria-label': function* () {
                  return `Aller à : ${thumbnailCaption(yield* entry())}`;
                },
                click: function* () {
                  const item = yield* entry();
                  seekReplayToEvent(item.eventId, item.participantId);
                },
              },
              [
                img({
                  class: ui.thumbImage,
                  alt: function* () {
                    return thumbnailReasonLabel(yield* entry());
                  },
                  src: function* () {
                    const manifest = thumbnailManifest();
                    const item = yield* entry();
                    return manifest
                      ? safeResourceUrl(thumbnailImageUrl(manifest, item), {
                          allowedOrigins: [THUMBNAIL_ORIGIN],
                        })
                      : '';
                  },
                  loading: 'lazy',
                  decoding: 'async',
                }),
                span({ class: ui.thumbCaption }, function* () {
                  return thumbnailCaption(yield* entry());
                }),
              ],
            ),
          ]),
      ),
    );

    return div(
      {
        class: ui.thumbs,
        'data-lab': 'thumbnails-strip',
        hidden,
      },
      [head, row],
    );
  },
);
