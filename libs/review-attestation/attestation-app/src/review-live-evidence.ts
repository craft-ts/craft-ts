import {
  button,
  craftComponent,
  details,
  div,
  figcaption,
  figure,
  forNode,
  heading,
  ifNode,
  iframe,
  img,
  label,
  li,
  option,
  p,
  safeResourceUrl,
  section,
  select,
  span,
  strong,
  summary,
  ul,
} from '@craft-ts/component';
import { assign, unit } from '@craft-ts/style';
import { annotation } from './annotation.style';
import { BypassCardEvidence } from './bypasses-view';
import { FolderLayoutView } from './folder-layout-view';
import {
  evidenceBox,
  imageEvidence,
  notice,
  reviewBits,
} from './review-card.style';
import {
  Inputs,
  ReviewLiveEvidenceView,
  provideReviewLiveEvidenceView,
} from './review-live-evidence.service';
import { TierLegend } from './tier-legend';

export const ReviewLiveEvidence = craftComponent(
  'ReviewLiveEvidence',
  {
    providers: [provideReviewLiveEvidenceView()],
  },
  function* (inputs: Inputs) {
    const {
      canShowBypass,
      bypassLabel,
      bypassLocation,
      bypassReason,
      bypassCode,
      bypassPreviousReason,
      t,
      canShowFolderLayout,
      folderEntries,
      folderSourceGraphHash,
      folderConfigHash,
      folderMoves,
      folderReviews,
      card,
      visualEvidenceHidden,
      viewportLabel,
      screenshotLabel,
      colorSchemeLabel,
      browserLabel,
      neverApprovedHidden,
      coverageLabel,
      cannotReplay,
      showingReplay,
      chooseReplay,
      imageViewPressed,
      chooseImage,
      overlayHint,
      overlayToggleHidden,
      hideChrome,
      toggleChrome,
      overlayLabel,
      zoom,
      changeZoomFromEvent,
      helpHidden,
      helpText,
      member,
      coveredCount,
      chrome,
      evidenceErrorHidden,
      warningHidden,
      warningText,
      replay,
      replayReport,
      canShowVisualEvidence,
      replayHolderHidden,
      replayFrameId,
      frameWidth,
      frameHeight,
      replaySource,
      inspectFrame,
      band,
      bandHidden,
      imageHidden,
      imageAlt,
      imageSource,
      foldHidden,
      noImageHidden,
      captionText,
    } = yield* ReviewLiveEvidenceView(inputs);
    return [
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
              function* () {
                return (yield* t()).neverApproved;
              },
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
                    'aria-pressed': function* () {
                      return String(yield* imageViewPressed());
                    },
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
                class: [imageEvidence.overlayToggle, annotation.hinted],
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
          span({ class: notice.icon, 'aria-hidden': 'true' }, '!'),
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
              summary({ class: notice.detailSummary }, function* () {
                return `${(yield* t()).fidelityDetail} (${(yield* replay()).report.length})`;
              }),
              ul(
                forNode(
                  replayReport,
                  { track: (entry) => entry.line },
                  (entry) =>
                    li({ class: reviewBits.code }, function* () {
                      return (yield* entry()).line;
                    }),
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
                    src: function* () {
                      return safeResourceUrl(yield* replaySource());
                    },
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
                        ...assign(
                          evidenceBox.left,
                          unit.px((yield* band())?.x ?? 0),
                        ),
                        ...assign(
                          evidenceBox.top,
                          unit.px((yield* band())?.y ?? 0),
                        ),
                        ...assign(
                          evidenceBox.width,
                          unit.px((yield* band())?.width ?? 0),
                        ),
                        ...assign(
                          evidenceBox.height,
                          unit.px((yield* band())?.height ?? 0),
                        ),
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
                  src: function* () {
                    return safeResourceUrl(yield* imageSource());
                  },
                }),
                // Where the viewport ended. Everything below it is
                // attested and was never on anybody's screen.
                div({
                  class: imageEvidence.fold,
                  'data-testid': 'fold',
                  hidden: foldHidden,
                  style: function* () {
                    return {
                      ...assign(
                        evidenceBox.left,
                        unit.pct(
                          (((yield* card()).members[0]?.metadata?.visibleBand
                            ?.x ?? 0) /
                            ((yield* card()).members[0]?.metadata?.screenshot
                              ?.width ?? 1)) *
                            100,
                        ),
                      ),
                      ...assign(
                        evidenceBox.top,
                        unit.pct(
                          (((yield* card()).members[0]?.metadata?.visibleBand
                            ?.y ?? 0) /
                            ((yield* card()).members[0]?.metadata?.screenshot
                              ?.height ?? 1)) *
                            100,
                        ),
                      ),
                      ...assign(
                        evidenceBox.width,
                        unit.pct(
                          (((yield* card()).members[0]?.metadata?.visibleBand
                            ?.width ?? 0) /
                            ((yield* card()).members[0]?.metadata?.screenshot
                              ?.width ?? 1)) *
                            100,
                        ),
                      ),
                      ...assign(
                        evidenceBox.height,
                        unit.pct(
                          (((yield* card()).members[0]?.metadata?.visibleBand
                            ?.height ?? 0) /
                            ((yield* card()).members[0]?.metadata?.screenshot
                              ?.height ?? 1)) *
                            100,
                        ),
                      ),
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
            figcaption({ class: imageEvidence.caption }, captionText),
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
              (change) => li(span({ class: imageEvidence.diffLine }, change)),
            ),
          ),
        ],
      ),
    ];
  },
);
