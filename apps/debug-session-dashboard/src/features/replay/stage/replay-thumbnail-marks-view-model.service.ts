import { craftComputed, craftService } from '@craft-ts/core';
import {
  replayActionOffsetsMs,
  replayIndex,
  replayableEvents,
  thumbnailManifest,
} from '../../../shared/state/replay-state';
import {
  replayDurationMs,
  thumbnailActionLabel,
  thumbnailCaption,
  thumbnailReasonLabel,
} from '../../../shared/util/replay-labels';
import {
  thumbnailImageUrl,
  type ThumbnailEntry,
} from '../../../shared/data-access/thumbnail-archive.service';

/** A thumbnail, placed on the timeline of the replay it belongs to. */
export type Mark = Readonly<{
  entry: ThumbnailEntry;
  /** Actions that had run when the picture was taken, in this replay. */
  position: number;
  /** How far along the recording that moment is, as a percentage. */
  share: number;
  phase: 'current' | 'passed' | undefined;
  actionLabel: string;
  ariaLabel: string;
  caption: string;
  reasonLabel: string;
  imageUrl: string;
}>;

/** The replay-derived display values for each saved thumbnail. */
export const { ReplayThumbnailMarksViewModel } = craftService(
  { name: 'replayThumbnailMarksViewModel', providedIn: 'global' },
  function* () {
    yield* craftComputed('renderedMarks', function* () {
      const steps = replayableEvents();
      const offsets = replayActionOffsetsMs();
      const duration = replayDurationMs();
      const manifest = thumbnailManifest();
      const marks = (manifest?.entries ?? []).map((entry) => {
        const position =
          entry.eventId === undefined
            ? 0
            : steps.findIndex((step) => step.id === entry.eventId) + 1 ||
              entry.replayIndex;
        const time =
          position === 0 ? 0 : (offsets[position - 1] ?? entry.offsetMs);
        const share = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
        const actionLabel = thumbnailActionLabel(entry);
        const caption = thumbnailCaption(entry);
        return {
          entry,
          position,
          share,
          actionLabel,
          ariaLabel: `${actionLabel} · ${caption}`,
          caption,
          reasonLabel: thumbnailReasonLabel(entry),
          imageUrl: manifest ? thumbnailImageUrl(manifest, entry) : '',
        };
      });
      const done = replayIndex();
      const current = marks.reduce<number | undefined>(
        (selected, mark) =>
          mark.position <= done ? mark.entry.index : selected,
        undefined,
      );
      return marks.map<Mark>((mark) => ({
        ...mark,
        phase:
          mark.entry.index === current
            ? 'current'
            : mark.position <= done
              ? 'passed'
              : undefined,
      }));
    });
  },
);
