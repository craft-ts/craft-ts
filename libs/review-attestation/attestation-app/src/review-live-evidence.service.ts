import { type Input, type Output } from '@craft-ts/component';
import {
  craftComputed,
  craftExpose,
  craftPrivate,
  craftService,
} from '@craft-ts/core';
import { assign, unit } from '@craft-ts/style';
import type { ReviewApiQueue } from '@craft-ts/style-testing/review';
import { imageUrl, scenarioOf, snapshotUrl } from './card-presentation';
import type { Messages } from './messages';
import { evidenceBox } from './review-card.style';

export type ReviewCard = ReviewApiQueue['cards'][number];
export type ReplayEvidenceState = {
  readonly loaded: boolean;
  readonly faithful: boolean;
  readonly report: readonly string[];
};
export type Band =
  | {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | undefined;
export type Member = { readonly changed: readonly unknown[] } | undefined;
export const FRAME_ID = 'craft-replay-frame';
export type Inputs = {
  card: Input<ReviewCard>;
  current: Input<ReviewCard | undefined>;
  t: Input<Messages>;
  bypassEvidence: Input<boolean>;
  folderLayoutEvidence: Input<boolean>;
  visualEvidence: Input<boolean>;
  showingReplay: Input<boolean>;
  replay: Input<ReplayEvidenceState>;
  canReplay: Input<boolean>;
  inspectFailed: Input<boolean>;
  fellBack: Input<boolean>;
  fidelitySentence: Input<string>;
  band: Input<Band>;
  overlayHint: Input<string>;
  overlayLabel: Input<string>;
  chrome: Input<readonly string[]>;
  hideChrome: Input<boolean>;
  toggleChrome: Output<() => unknown>;
  zoom: Input<string>;
  changeZoomFromEvent: Output<(event: Event) => unknown>;
  member: Input<Member>;
  coveredCount: Input<number>;
  inspectFrame: Output<(event: Event) => unknown>;
  chooseReplay: Output<() => unknown>;
  chooseImage: Output<() => unknown>;
};

/** Bypass, folder-layout, screenshot, and replay evidence for the active card. */
export const { ReviewLiveEvidenceView, provideReviewLiveEvidenceView } =
  craftService(
    { name: 'reviewLiveEvidenceView', providedIn: 'toProvide' },
    function* (inputs: Inputs) {
      const {
        card,
        t,
        showingReplay,
        replay,
        band,
        overlayHint,
        overlayLabel,
        chrome,
        hideChrome,
        toggleChrome,
        zoom,
        changeZoomFromEvent,
        member,
        coveredCount,
        inspectFrame,
        chooseReplay,
        chooseImage,
      } = inputs;
      yield* craftComputed('canShowBypass', function* () {
        return yield* inputs.bypassEvidence();
      });
      yield* craftComputed('canShowFolderLayout', function* () {
        return yield* inputs.folderLayoutEvidence();
      });
      yield* craftComputed('canShowVisualEvidence', function* () {
        return yield* inputs.visualEvidence();
      });
      yield* craftComputed('visualEvidenceHidden', function* () {
        return !(yield* inputs.visualEvidence());
      });
      yield* craftComputed('bypassLabel', function* () {
        const card = yield* inputs.card();
        if (card.kind === 'eslint-disable')
          return `eslint-disable · ${card.rule}`;
        return card.kind === 'architecture-waiver'
          ? `${card.rule} → ${card.target}`
          : '';
      });
      yield* craftComputed('bypassLocation', function* () {
        const card = yield* inputs.card();
        if (card.kind === 'eslint-disable')
          return `${card.filePath}:${card.excerpt.highlightLine}`;
        return card.kind === 'architecture-waiver'
          ? `${card.filePath}:${card.line}`
          : '';
      });
      yield* craftComputed('bypassReason', function* () {
        const card = yield* inputs.card();
        return card.kind === 'eslint-disable' ||
          card.kind === 'architecture-waiver'
          ? card.bypassReason
          : null;
      });
      yield* craftComputed('bypassCode', function* () {
        const card = yield* inputs.card();
        if (card.kind === 'eslint-disable') {
          return card.excerpt.lines
            .map(
              (line, index) =>
                `${String(card.excerpt.startLine + index).padStart(4)}  ${line}`,
            )
            .join('\n');
        }
        return card.kind === 'architecture-waiver'
          ? `${card.project}: ${card.rule} → ${card.target}`
          : '';
      });
      yield* craftComputed('bypassPreviousReason', function* () {
        const card = yield* inputs.card();
        return card.kind === 'eslint-disable' ||
          card.kind === 'architecture-waiver'
          ? (card.previousReason ?? null)
          : null;
      });
      yield* craftComputed('folderEntries', function* () {
        const card = yield* inputs.card();
        return card.kind === 'folder-layout' ? card.entries : [];
      });
      yield* craftComputed('folderSourceGraphHash', function* () {
        const card = yield* inputs.card();
        return card.kind === 'folder-layout' ? card.sourceGraphHash : '';
      });
      yield* craftComputed('folderConfigHash', function* () {
        const card = yield* inputs.card();
        return card.kind === 'folder-layout' ? card.configHash : '';
      });
      yield* craftComputed('folderMoves', function* () {
        const card = yield* inputs.card();
        return card.kind === 'folder-layout' ? card.statistics.moves : 0;
      });
      yield* craftComputed('folderReviews', function* () {
        const card = yield* inputs.card();
        return card.kind === 'folder-layout' ? card.statistics.reviews : 0;
      });
      yield* craftComputed('viewportLabel', function* () {
        const viewport = (yield* inputs.card()).members[0]?.metadata?.viewport;
        return viewport
          ? (yield* inputs.t()).viewport(viewport.width, viewport.height)
          : (yield* inputs.t()).viewportUnknown;
      });
      yield* craftComputed('screenshotLabel', function* () {
        const screenshot = (yield* inputs.card()).members[0]?.metadata
          ?.screenshot;
        return screenshot
          ? (yield* inputs.t()).capture(screenshot.width, screenshot.height)
          : (yield* inputs.t()).captureUnknown;
      });
      yield* craftComputed('colorSchemeLabel', function* () {
        return (
          (yield* inputs.card()).members[0]?.metadata?.colorScheme ??
          (yield* inputs.t()).schemeUnknown
        );
      });
      yield* craftComputed('browserLabel', function* () {
        const browser = (yield* inputs.card()).members[0]?.metadata?.browser;
        return browser
          ? `${browser.name} ${browser.version}`
          : (yield* inputs.t()).browserUnknown;
      });
      yield* craftComputed('neverApprovedHidden', function* () {
        return (yield* inputs.card()).changes.length > 0;
      });
      yield* craftComputed('coverageLabel', function* () {
        const coverage = (yield* inputs.card()).members[0]?.metadata?.coverage;
        if (!coverage) return (yield* inputs.t()).coverageUnknown;
        return (yield* inputs.t()).coverage(
          coverage.attested,
          coverage.attested - coverage.offScreen - coverage.occluded,
          coverage.occluded,
        );
      });
      yield* craftComputed('cannotReplay', function* () {
        return !(yield* inputs.canReplay());
      });
      yield* craftComputed('imageViewPressed', function* () {
        return !(yield* inputs.showingReplay());
      });
      yield* craftComputed('overlayToggleHidden', function* () {
        return (
          !(yield* inputs.showingReplay()) ||
          (yield* inputs.chrome()).length === 0
        );
      });
      yield* craftComputed('helpHidden', function* () {
        return !(yield* inputs.visualEvidence());
      });
      yield* craftComputed('helpText', function* () {
        const messages = yield* inputs.t();
        return (yield* inputs.showingReplay())
          ? messages.helpReplay
          : messages.helpImage;
      });
      yield* craftComputed('evidenceErrorHidden', function* () {
        return !(yield* inputs.inspectFailed()) || !(yield* inputs.canReplay());
      });
      yield* craftComputed('warningHidden', function* () {
        const replay = yield* inputs.replay();
        return (
          !(yield* inputs.canReplay()) || !replay.loaded || replay.faithful
        );
      });
      yield* craftComputed('warningText', function* () {
        const sentence = yield* inputs.fidelitySentence();
        return (yield* inputs.fellBack())
          ? (yield* inputs.t()).fellBack(
              `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`,
            )
          : sentence;
      });
      yield* craftComputed('replayHolderHidden', function* () {
        return !(yield* inputs.showingReplay());
      });
      yield* craftComputed('replayFrameId', function* () {
        return (yield* inputs.card()).shape === (yield* inputs.current())?.shape
          ? FRAME_ID
          : '';
      });
      yield* craftComputed('frameWidth', function* () {
        return String(
          (yield* inputs.card()).members[0]?.metadata?.viewport?.width ?? 375,
        );
      });
      yield* craftComputed('frameHeight', function* () {
        return String(
          (yield* inputs.card()).members[0]?.metadata?.viewport?.height ?? 900,
        );
      });
      yield* craftComputed('replaySource', function* () {
        const card = yield* inputs.card();
        const snapshot =
          card.shape === (yield* inputs.current())?.shape
            ? card.members[0]?.snapshot
            : undefined;
        return snapshot ? snapshotUrl(snapshot) : '/api/blank';
      });
      yield* craftComputed('bandHidden', function* () {
        return (yield* inputs.band()) === undefined;
      });
      yield* craftPrivate(
        craftComputed('bandStyle', function* () {
          const rect = yield* inputs.band();
          if (!rect) return null;
          return {
            ...assign(evidenceBox.left, unit.px(rect.x)),
            ...assign(evidenceBox.top, unit.px(rect.y)),
            ...assign(evidenceBox.width, unit.px(rect.width)),
            ...assign(evidenceBox.height, unit.px(rect.height)),
          };
        }),
      );
      yield* craftComputed('imageHidden', function* () {
        return !(yield* inputs.card()).image;
      });
      yield* craftComputed('imageAlt', function* () {
        return (yield* inputs.t()).imageAlt(
          scenarioOf((yield* inputs.card()).subject),
        );
      });
      yield* craftComputed('imageSource', function* () {
        const hash = (yield* inputs.card()).image;
        return hash ? imageUrl(hash) : '';
      });
      yield* craftComputed('foldHidden', function* () {
        const metadata = (yield* inputs.card()).members[0]?.metadata;
        return !(metadata?.visibleBand && metadata.screenshot);
      });
      yield* craftPrivate(
        craftComputed('foldStyle', function* () {
          const metadata = (yield* inputs.card()).members[0]?.metadata;
          const band = metadata?.visibleBand;
          const shot = metadata?.screenshot;
          if (!band || !shot) return null;
          const percent = (value: number, total: number) =>
            unit.pct(Math.max(0, Math.min(100, (value / total) * 100)));
          return {
            ...assign(evidenceBox.left, percent(band.x, shot.width)),
            ...assign(evidenceBox.top, percent(band.y, shot.height)),
            ...assign(evidenceBox.width, percent(band.width, shot.width)),
            ...assign(evidenceBox.height, percent(band.height, shot.height)),
          };
        }),
      );
      yield* craftComputed('noImageHidden', function* () {
        const card = yield* inputs.card();
        return card.kind !== 'visual' || Boolean(card.image);
      });
      yield* craftComputed('captionText', function* () {
        const target = (yield* inputs.card()).members[0]?.metadata?.target;
        const messages = yield* inputs.t();
        return target ? messages.captionWithTarget(target) : messages.caption;
      });
      yield* craftExpose('t', t);
      yield* craftExpose('card', card);
      yield* craftExpose('showingReplay', showingReplay);
      yield* craftExpose('chooseReplay', chooseReplay);
      yield* craftExpose('chooseImage', chooseImage);
      yield* craftExpose('overlayHint', overlayHint);
      yield* craftExpose('hideChrome', hideChrome);
      yield* craftExpose('toggleChrome', toggleChrome);
      yield* craftExpose('overlayLabel', overlayLabel);
      yield* craftExpose('zoom', zoom);
      yield* craftExpose('changeZoomFromEvent', changeZoomFromEvent);
      yield* craftExpose('member', member);
      yield* craftExpose('coveredCount', coveredCount);
      yield* craftExpose('chrome', chrome);
      yield* craftExpose('replay', replay);
      yield* craftComputed('replayReport', function* () {
        return (yield* replay()).report.map((line) => ({ line }));
      });
      yield* craftExpose('inspectFrame', inspectFrame);
      yield* craftExpose('band', band);
    },
  );
