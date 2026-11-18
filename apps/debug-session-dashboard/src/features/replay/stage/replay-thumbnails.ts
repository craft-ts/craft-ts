import { i18n } from '../../../shared/util/catalog';
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
  type Output,
} from '@craft-ts/component';
import { assign, unit } from '@craft-ts/style';
import { buttonUi } from '@craft-ts/ui/style';
import { markVars, ui } from '../../../shared/ui/dashboard.style';
import { thumbnailsSummary } from '../../../shared/util/replay-labels';
import { ReplaySession } from '../../../shared/state/replay-session';
import { thumbnailManifest } from '../../../shared/state/replay-state';
import { ThumbnailPreview } from './thumbnail-preview.service';
import {
  THUMBNAIL_ORIGIN,
} from '../../../shared/data-access/thumbnail-archive.service';
import {
  Mark,
  ReplayThumbnailMarksViewModel,
} from './replay-thumbnail-marks-view-model.service';

/**
 * The pictures the archive prepared, as far as they are ready, each at its
 * moment: where the replay is once the action it names has run.
 */
/** The point's look: the one the replay is at, or one it has already passed. */
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
      forNode(
        function* () {
          return yield* (yield* ReplayThumbnailMarksViewModel()).renderedMarks();
        },
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
                  return (yield* mark()).ariaLabel;
                },
                pointerenter: function* () {
                  const item = yield* mark();
                  yield* (yield* ThumbnailPreview()).show(item.entry.index);
                },
                pointerleave: function* () {
                  yield* (yield* ThumbnailPreview()).show(undefined);
                },
                focus: function* () {
                  const item = yield* mark();
                  yield* (yield* ThumbnailPreview()).show(item.entry.index);
                },
                blur: function* () {
                  yield* (yield* ThumbnailPreview()).show(undefined);
                },
                click: function* () {
                  const item = yield* mark();
                  if (item.entry.eventId)
                    (yield* ReplaySession()).seekReplayToEvent(
                      item.entry.eventId,
                      item.entry.participantId,
                    );
                },
              }),
              div(
                {
                  class: ui.markCard,
                  'aria-hidden': 'true',
                  'data-mark-card': function* () {
                    const item = yield* mark();
                    const openEntryIndex = yield* (
                      yield* ThumbnailPreview()
                    ).openEntryIndex();
                    return openEntryIndex === item.entry.index
                      ? 'open'
                      : undefined;
                  },
                },
                [
                  img({
                    class: ui.markImage,
                    alt: function* () {
                      return (yield* mark()).reasonLabel;
                    },
                    src: function* () {
                      const item = yield* mark();
                      return safeResourceUrl(item.imageUrl, {
                        allowedOrigins: [THUMBNAIL_ORIGIN],
                      });
                    },
                  }),
                  span({ class: ui.markCaption }, function* () {
                    return (yield* mark()).caption;
                  }),
                  span({ class: ui.markAction }, function* () {
                    return i18n.t('thumbnailActionLabel', {
                      actionLabel: (yield* mark()).actionLabel,
                    });
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
  function* (inputs: { readonly retryThumbnails: Output<() => void> }) {
    const { retryThumbnails } = inputs;
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
              click: retryThumbnails,
            },
            i18n.t("copy.copy145"),
          ),
        ]),
      ],
    );
  },
);
