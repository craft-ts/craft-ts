import { button, craftComponent, details, div, figcaption, figure, forNode, heading, iframe, ifNode, img, label, li, option, p, safeResourceUrl, section, select, span, strong, summary, ul, type Input, type Output } from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import type { ReviewApiQueue } from '@craft-ts/style-testing/review';
import { assign, unit } from '@craft-ts/style';
import { BypassCardEvidence } from './bypasses-view';
import { FolderLayoutView } from './folder-layout-view';
import { TierLegend } from './tier-legend';
import type { Messages } from './messages';
import { imageUrl, scenarioOf, snapshotUrl } from './card-presentation';
import { annotation } from './annotation.style';
import { evidenceBox, imageEvidence, notice, reviewBits } from './review-card.style';

type ReviewCard = ReviewApiQueue['cards'][number];
type ReplayEvidenceState = { readonly loaded: boolean; readonly faithful: boolean; readonly report: readonly string[] };
type Band = { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | undefined;
type Member = { readonly changed: readonly unknown[] } | undefined;
const FRAME_ID = 'craft-replay-frame';
type Inputs = {
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
export const ReviewLiveEvidence = craftComponent(
  'ReviewLiveEvidence',
  {},
  (inputs: Inputs) => ({
    ...inputs,
    canShowBypass: craftComputed('canShowBypass', function* () { return yield* inputs.bypassEvidence(); }),
    canShowFolderLayout: craftComputed('canShowFolderLayout', function* () { return yield* inputs.folderLayoutEvidence(); }),
    canShowVisualEvidence: craftComputed('canShowVisualEvidence', function* () { return yield* inputs.visualEvidence(); }),
    visualEvidenceHidden: craftComputed('visualEvidenceHidden', function* () { return !(yield* inputs.visualEvidence()); }),
    bypassLabel: craftComputed('bypassLabel', function* () {
      const card = yield* inputs.card();
      if (card.kind === 'eslint-disable') return `eslint-disable · ${card.rule}`;
      return card.kind === 'architecture-waiver' ? `${card.rule} → ${card.target}` : '';
    }),
    bypassLocation: craftComputed('bypassLocation', function* () {
      const card = yield* inputs.card();
      if (card.kind === 'eslint-disable') return `${card.filePath}:${card.excerpt.highlightLine}`;
      return card.kind === 'architecture-waiver' ? `${card.filePath}:${card.line}` : '';
    }),
    bypassReason: craftComputed('bypassReason', function* () {
      const card = yield* inputs.card();
      return card.kind === 'eslint-disable' || card.kind === 'architecture-waiver'
        ? card.bypassReason
        : null;
    }),
    bypassCode: craftComputed('bypassCode', function* () {
      const card = yield* inputs.card();
      if (card.kind === 'eslint-disable') {
        return card.excerpt.lines.map((line, index) => `${String(card.excerpt.startLine + index).padStart(4)}  ${line}`).join('\n');
      }
      return card.kind === 'architecture-waiver'
        ? `${card.project}: ${card.rule} → ${card.target}`
        : '';
    }),
    bypassPreviousReason: craftComputed('bypassPreviousReason', function* () {
      const card = yield* inputs.card();
      return (card.kind === 'eslint-disable' || card.kind === 'architecture-waiver')
        ? card.previousReason ?? null
        : null;
    }),
    folderEntries: craftComputed('folderEntries', function* () {
      const card = yield* inputs.card();
      return card.kind === 'folder-layout' ? card.entries : [];
    }),
    folderSourceGraphHash: craftComputed('folderSourceGraphHash', function* () {
      const card = yield* inputs.card();
      return card.kind === 'folder-layout' ? card.sourceGraphHash : '';
    }),
    folderConfigHash: craftComputed('folderConfigHash', function* () {
      const card = yield* inputs.card();
      return card.kind === 'folder-layout' ? card.configHash : '';
    }),
    folderMoves: craftComputed('folderMoves', function* () {
      const card = yield* inputs.card();
      return card.kind === 'folder-layout' ? card.statistics.moves : 0;
    }),
    folderReviews: craftComputed('folderReviews', function* () {
      const card = yield* inputs.card();
      return card.kind === 'folder-layout' ? card.statistics.reviews : 0;
    }),
    viewportLabel: craftComputed('viewportLabel', function* () {
      const viewport = (yield* inputs.card()).members[0]?.metadata?.viewport;
      return viewport ? (yield* inputs.t()).viewport(viewport.width, viewport.height) : (yield* inputs.t()).viewportUnknown;
    }),
    screenshotLabel: craftComputed('screenshotLabel', function* () {
      const screenshot = (yield* inputs.card()).members[0]?.metadata?.screenshot;
      return screenshot ? (yield* inputs.t()).capture(screenshot.width, screenshot.height) : (yield* inputs.t()).captureUnknown;
    }),
    colorSchemeLabel: craftComputed('colorSchemeLabel', function* () {
      return (yield* inputs.card()).members[0]?.metadata?.colorScheme ?? (yield* inputs.t()).schemeUnknown;
    }),
    browserLabel: craftComputed('browserLabel', function* () {
      const browser = (yield* inputs.card()).members[0]?.metadata?.browser;
      return browser ? `${browser.name} ${browser.version}` : (yield* inputs.t()).browserUnknown;
    }),
    neverApprovedHidden: craftComputed('neverApprovedHidden', function* () {
      return (yield* inputs.card()).changes.length > 0;
    }),
    coverageLabel: craftComputed('coverageLabel', function* () {
      const coverage = (yield* inputs.card()).members[0]?.metadata?.coverage;
      if (!coverage) return (yield* inputs.t()).coverageUnknown;
      return (yield* inputs.t()).coverage(
        coverage.attested,
        coverage.attested - coverage.offScreen - coverage.occluded,
        coverage.occluded,
      );
    }),
    cannotReplay: craftComputed('cannotReplay', function* () { return !(yield* inputs.canReplay()); }),
    imageViewPressed: craftComputed('imageViewPressed', function* () { return !(yield* inputs.showingReplay()); }),
    overlayToggleHidden: craftComputed('overlayToggleHidden', function* () {
      return !(yield* inputs.showingReplay()) || (yield* inputs.chrome()).length === 0;
    }),
    helpHidden: craftComputed('helpHidden', function* () { return !(yield* inputs.visualEvidence()); }),
    helpText: craftComputed('helpText', function* () {
      const messages = yield* inputs.t();
      return (yield* inputs.showingReplay()) ? messages.helpReplay : messages.helpImage;
    }),
    evidenceErrorHidden: craftComputed('evidenceErrorHidden', function* () {
      return !(yield* inputs.inspectFailed()) || !(yield* inputs.canReplay());
    }),
    warningHidden: craftComputed('warningHidden', function* () {
      const replay = yield* inputs.replay();
      return !(yield* inputs.canReplay()) || !replay.loaded || replay.faithful;
    }),
    warningText: craftComputed('warningText', function* () {
      const sentence = yield* inputs.fidelitySentence();
      return (yield* inputs.fellBack())
        ? (yield* inputs.t()).fellBack(`${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`)
        : sentence;
    }),
    replayHolderHidden: craftComputed('replayHolderHidden', function* () { return !(yield* inputs.showingReplay()); }),
    replayFrameId: craftComputed('replayFrameId', function* () {
      return (yield* inputs.card()).shape === (yield* inputs.current())?.shape ? FRAME_ID : '';
    }),
    frameWidth: craftComputed('frameWidth', function* () {
      return String((yield* inputs.card()).members[0]?.metadata?.viewport?.width ?? 375);
    }),
    frameHeight: craftComputed('frameHeight', function* () {
      return String((yield* inputs.card()).members[0]?.metadata?.viewport?.height ?? 900);
    }),
    replaySource: craftComputed('replaySource', function* () {
      const card = yield* inputs.card();
      const snapshot = card.shape === (yield* inputs.current())?.shape ? card.members[0]?.snapshot : undefined;
      return snapshot ? snapshotUrl(snapshot) : '/api/blank';
    }),
    bandHidden: craftComputed('bandHidden', function* () { return (yield* inputs.band()) === undefined; }),
    bandStyle: craftComputed('bandStyle', function* () {
      const rect = yield* inputs.band();
      if (!rect) return null;
      return {
        ...assign(evidenceBox.left, unit.px(rect.x)),
        ...assign(evidenceBox.top, unit.px(rect.y)),
        ...assign(evidenceBox.width, unit.px(rect.width)),
        ...assign(evidenceBox.height, unit.px(rect.height)),
      };
    }),
    imageHidden: craftComputed('imageHidden', function* () { return !(yield* inputs.card()).image; }),
    imageAlt: craftComputed('imageAlt', function* () {
      return (yield* inputs.t()).imageAlt(scenarioOf((yield* inputs.card()).subject));
    }),
    imageSource: craftComputed('imageSource', function* () {
      const hash = (yield* inputs.card()).image;
      return hash ? imageUrl(hash) : '';
    }),
    foldHidden: craftComputed('foldHidden', function* () {
      const metadata = (yield* inputs.card()).members[0]?.metadata;
      return !(metadata?.visibleBand && metadata.screenshot);
    }),
    foldStyle: craftComputed('foldStyle', function* () {
      const metadata = (yield* inputs.card()).members[0]?.metadata;
      const band = metadata?.visibleBand;
      const shot = metadata?.screenshot;
      if (!band || !shot) return null;
      const percent = (value: number, total: number) => unit.pct(Math.max(0, Math.min(100, (value / total) * 100)));
      return {
        ...assign(evidenceBox.left, percent(band.x, shot.width)),
        ...assign(evidenceBox.top, percent(band.y, shot.height)),
        ...assign(evidenceBox.width, percent(band.width, shot.width)),
        ...assign(evidenceBox.height, percent(band.height, shot.height)),
      };
    }),
    noImageHidden: craftComputed('noImageHidden', function* () {
      const card = yield* inputs.card();
      return card.kind !== 'visual' || Boolean(card.image);
    }),
    captionText: craftComputed('captionText', function* () {
      const target = (yield* inputs.card()).members[0]?.metadata?.target;
      const messages = yield* inputs.t();
      return target ? messages.captionWithTarget(target) : messages.caption;
    }),
  }),
  ({ card, t, showingReplay, replay, band, overlayHint, overlayLabel, chrome, hideChrome, toggleChrome, zoom, changeZoomFromEvent, member, coveredCount, inspectFrame, chooseReplay, chooseImage, canShowBypass, canShowFolderLayout, canShowVisualEvidence, visualEvidenceHidden, bypassLabel, bypassLocation, bypassReason, bypassCode, bypassPreviousReason, folderEntries, folderSourceGraphHash, folderConfigHash, folderMoves, folderReviews, viewportLabel, screenshotLabel, colorSchemeLabel, browserLabel, neverApprovedHidden, coverageLabel, cannotReplay, imageViewPressed, overlayToggleHidden, helpHidden, helpText, evidenceErrorHidden, warningHidden, warningText, replayHolderHidden, replayFrameId, frameWidth, frameHeight, replaySource, bandHidden, imageHidden, imageAlt, imageSource, foldHidden, noImageHidden, captionText }) =>
    [
ifNode(canShowBypass, () =>
                        BypassCardEvidence({
                          label: bypassLabel,
                          location: bypassLocation,
                          reason: bypassReason,
                          code: bypassCode,
                          previousReason: bypassPreviousReason,
                          t,
                        }),
                      ),
ifNode(canShowFolderLayout, () =>
                        FolderLayoutView({
                          entries: folderEntries,
                          sourceGraphHash: folderSourceGraphHash,
                          configHash: folderConfigHash,
                          moves: folderMoves,
                          reviews: folderReviews,
                        }),
                      ),
section(
                        {
                          class: imageEvidence.toolbar,
                          'data-reviewKind': function* () {
                            return (yield* card()).kind;
                          },
                          hidden: visualEvidenceHidden,
                        },
                        [
                          div({ class: imageEvidence.metadata }, [
                            span({ class: reviewBits.chip }, viewportLabel),
                            span({ class: reviewBits.chip }, screenshotLabel),
                            span({ class: reviewBits.chip }, colorSchemeLabel),
                            span({ class: reviewBits.chip }, browserLabel),
                            // What the verdict covers against what anybody could look
                            // at. Said out loud, on the same rule as `bulk`: an
                            // attestation must not claim a coverage it does not have.
                            // A subject nobody has attested, said once and small.
                            span(
                              {
                                class: reviewBits.chip,
                                hidden: neverApprovedHidden,
                              },
                              function* () { return (yield* t()).neverApproved; },
                            ),
                            span({ class: reviewBits.chip }, coverageLabel),
                          ]),
                          div({ class: imageEvidence.views }, [
                            span(
                              {
                                class: imageEvidence.fieldLabel,
                                id: 'evidence-views-label',
                              },
                              function* () {
                                return (yield* t()).evidence;
                              },
                            ),
                            div(
                              {
                                class: imageEvidence.toggle,
                                role: 'group',
                                'aria-labelledby': 'evidence-views-label',
                              },
                              [
                                button(
                                  'ShowReplay',
                                  {
                                    type: 'button',
                                    class: imageEvidence.toggleButton,
                                    'data-view': 'replay',
                                    title: function* () {
                                      return (yield* t()).viewPageHint;
                                    },
                                    disabled: cannotReplay,
                                    'aria-pressed': function* () {
                                      return String(yield* showingReplay());
                                    },
                                    click: chooseReplay,
                                  },
                                  function* () {
                                    return (yield* t()).viewPage;
                                  },
                                ),
                                button(
                                  'ShowImage',
                                  {
                                    type: 'button',
                                    class: imageEvidence.toggleButton,
                                    'data-view': 'image',
                                    title: function* () {
                                      return (yield* t()).viewImageHint;
                                    },
                                    'aria-pressed': function* () { return String(yield* imageViewPressed()); },
                                    click: chooseImage,
                                  },
                                  function* () {
                                    return (yield* t()).viewImage;
                                  },
                                ),
                              ],
                            ),
                            button(
                              'ToggleChrome',
                              {
                                type: 'button',
                                class: [
                                  imageEvidence.overlayToggle,
                                  annotation.hinted,
                                ],
                                'data-testid': 'overlay-toggle',
                                // Only the page can do this. In a screenshot those
                                // pixels have already been replaced.
                                'data-hint': overlayHint,
                                // Offered only when there is something to lift. A
                                // control that is always present and does nothing on
                                // most cards reads as broken — and on those cards it
                                // was, because it marked every fixed element on the
                                // page whether or not it covered anything.
                                hidden: overlayToggleHidden,
                                'aria-pressed': function* () {
                                  return String(yield* hideChrome());
                                },
                                click: toggleChrome,
                              },
                              overlayLabel,
                            ),
                          ]),
                          // Applies to both artefacts, by different means: the
                          // picture is a picture, and the frozen page is drawn
                          // smaller with a transform. Never a width — that would
                          // relayout it and it would stop being what was measured.
                          label(
                            {
                              class: imageEvidence.fieldLabel,
                              htmlFor: 'evidence-zoom',
                            },
                            function* () {
                              return (yield* t()).zoom;
                            },
                          ),
                          select(
                            'EvidenceZoom',
                            {
                              id: 'evidence-zoom',
                              'aria-label': 'Evidence zoom',
                              value: zoom,
                              change: changeZoomFromEvent,
                            },
                            [
                              option({ value: 'fit' }, function* () {
                                return (yield* t()).zoomFit;
                              }),
                              option({ value: 'actual' }, function* () {
                                return (yield* t()).zoomActual;
                              }),
                            ],
                          ),
                        ],
                      ),
p(
                        {
                          class: imageEvidence.help,
                          hidden: helpHidden,
                        },
                        helpText,
                      ),
TierLegend({
                        showing: showingReplay,
                        changedCount: function* () {
                          return (yield* member())?.changed.length ?? 0;
                        },
                        coveredCount,
                        chromeNames: chrome,
                        t,
                      }),
section(
                        'ReviewEvidenceError',
                        {
                          class: notice.root,
                          role: 'alert',
                          hidden: evidenceErrorHidden,
                        },
                        [
                          span(
                            { class: notice.icon, 'aria-hidden': 'true' },
                            '!',
                          ),
                          div({ class: notice.copy }, [
                            strong({ class: notice.title }, function* () {
                              return (yield* t()).evidenceErrorTitle;
                            }),
                            p({ class: notice.body }, function* () {
                              return (yield* t()).evidenceError;
                            }),
                          ]),
                        ],
                      ),
section(
                        {
                          class: notice.root,
                          'data-reviewNotice': 'warning',
                          role: 'status',
                          // Shown in both views, not only on the page. The reviewer
                          // who was moved to the photograph is exactly the one who
                          // needs to be told why, and hiding this with the frame
                          // left them looking at a picture for no stated reason.
                          hidden: warningHidden,
                        },
                        [
                          strong({ class: notice.warningTitle }, warningText),
                          // Folded. The sentence above is what a reviewer acts
                          // on; the addresses are what they check afterwards, and
                          // four lines of `color rgb(0,0,0)→rgb(255,255,255)` open
                          // by default push the verdict off the screen.
                          //
                          // What this costs the decision is not repeated here: the
                          // panel below says it once, next to the buttons it
                          // applies to.
                          details(
                            {
                              class: notice.detail,
                              'data-testid': 'fidelity-detail',
                              hidden: function* () {
                                return (yield* replay()).report.length === 0;
                              },
                            },
                            [
                              summary(
                                { class: notice.detailSummary },
                                function* () {

                                  return `${(yield* t()).fidelityDetail} (${(yield* replay()).report.length})`;
                                },
                              ),
                              ul(
                                forNode(
                                  function* () {
                                    return (yield* replay()).report.map(
                                      (line) => ({
                                        line,
                                      }),
                                    );
                                  },
                                  { track: (entry) => entry.line },
                                  (entry) =>
                                    li(
                                      { class: reviewBits.code },
                                      function* () {
                                        return (yield* entry()).line;
                                      },
                                    ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
ifNode(canShowVisualEvidence, () =>
                        figure(
                          {
                            class: imageEvidence.canvas,
                            'data-testid': 'evidence-canvas',
                          },
                          [
                            div(
                              {
                                class: imageEvidence.replayHolder,
                                'data-testid': 'replay-holder',
                                hidden: replayHolderHidden,
                              },
                              // The scaled box. The frame keeps its captured size —
                              // a width change would relayout the page inside it —
                              // and this is drawn smaller instead. The band rides
                              // along, so a rectangle dragged in frame coordinates
                              // lands where the pointer was.
                              div(
                                {
                                  class: imageEvidence.replayScale,
                                  'data-testid': 'replay-scale',
                                },
                                [
                                  iframe({
                                    class: imageEvidence.frame,
                                    id: replayFrameId,
                                    title: function* () {
                                      return (yield* t()).frameTitle;
                                    },
                                    // Sized to the captured viewport, never to the
                                    // reviewer's window: the snapshot freezes the styles,
                                    // not the box the page lays itself out in.
                                    width: frameWidth,
                                    height: frameHeight,
                                    src: function* () { return safeResourceUrl(yield* replaySource()); },
                                    load: inspectFrame,
                                  }),
                                  // Drawn in this document, on top of the frame — never
                                  // inside it. Inserting an element into the frozen page
                                  // would break the one claim it makes: that nothing was
                                  // added to it after it was measured.
                                  div({
                                    class: imageEvidence.band,
                                    'data-testid': 'selection-band',
                                    'aria-hidden': 'true',
                                    hidden: bandHidden,
                                    style: function* () {
                                      return {
                                        ...assign(evidenceBox.left, unit.px((yield* band())?.x ?? 0)),
                                        ...assign(evidenceBox.top, unit.px((yield* band())?.y ?? 0)),
                                        ...assign(evidenceBox.width, unit.px((yield* band())?.width ?? 0)),
                                        ...assign(evidenceBox.height, unit.px((yield* band())?.height ?? 0)),
                                      };
                                    },
                                  }),
                                ],
                              ),
                            ),
                            div(
                              {
                                class: imageEvidence.imageHolder,
                                'data-testid': 'image-holder',
                                hidden: showingReplay,
                              },
                              [
                                img({
                                  class: imageEvidence.picture,
                                  'data-zoom': zoom,
                                  hidden: imageHidden,
                                  alt: imageAlt,
                                  src: function* () { return safeResourceUrl(yield* imageSource()); },
                                }),
                                // Where the viewport ended. Everything below it is
                                // attested and was never on anybody's screen.
                                div({
                                  class: imageEvidence.fold,
                                  'data-testid': 'fold',
                                  hidden: foldHidden,
                                  style: function* () {
                                    return {
                                      ...assign(evidenceBox.left, unit.pct(((yield* card()).members[0]?.metadata?.visibleBand?.x ?? 0) / ((yield* card()).members[0]?.metadata?.screenshot?.width ?? 1) * 100)),
                                      ...assign(evidenceBox.top, unit.pct(((yield* card()).members[0]?.metadata?.visibleBand?.y ?? 0) / ((yield* card()).members[0]?.metadata?.screenshot?.height ?? 1) * 100)),
                                      ...assign(evidenceBox.width, unit.pct(((yield* card()).members[0]?.metadata?.visibleBand?.width ?? 0) / ((yield* card()).members[0]?.metadata?.screenshot?.width ?? 1) * 100)),
                                      ...assign(evidenceBox.height, unit.pct(((yield* card()).members[0]?.metadata?.visibleBand?.height ?? 0) / ((yield* card()).members[0]?.metadata?.screenshot?.height ?? 1) * 100)),
                                    };
                                  },
                                }),
                              ],
                            ),
                            p(
                              {
                                class: imageEvidence.noImage,
                                hidden: noImageHidden,
                              },
                              function* () {
                                return (yield* t()).noImage;
                              },
                            ),
                            figcaption(
                              { class: imageEvidence.caption },
                              captionText,
                            ),
                          ],
                        ),
                      ),
section(
                        {
                          class: imageEvidence.diff,
                          'data-reviewKind': function* () {
                            return (yield* card()).kind;
                          },
                          // Nothing to list is not worth a heading and a bullet
                          // saying so. A subject nobody has attested says that in
                          // one chip beside the viewport, where the rest of the
                          // facts about this capture already are.
                          hidden: function* () {
                            return (yield* card()).changes.length === 0;
                          },
                        },
                        [
                          heading(function* () {
                            return (yield* t()).measuredChange;
                          }),
                          ul(
                            { class: reviewBits.list },
                            forNode(
                              function* () {
                                return (yield* card()).changes;
                              },
                              { track: (change) => change },
                              (change) =>
                                li(
                                  span(
                                    { class: imageEvidence.diffLine },
                                    change,
                                  ),
                                ),
                            ),
                          ),
                        ],
                      )
    ],
);
