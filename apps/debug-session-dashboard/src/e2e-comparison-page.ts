import {
  button,
  craftComponent,
  details,
  div,
  forNode,
  heading,
  iframe,
  li,
  p,
  pre,
  safeResourceUrl,
  span,
  strong,
  summary,
  ul,
} from '@craft-ts/component';
import {
  craftComputed,
  rawReactiveValue,
} from '@craft-ts/core';
import {
  describeSessionTraceFinding,
  sessionTraceFindingAnchors,
  sessionTraceFindingLabel,
  type SessionTraceFinding,
} from '@craft-ts/session-trace';
import {
  E2eComparison,
  type E2eComparisonError,
  type E2eComparisonReport,
} from './e2e-comparison.service';
import { ui } from './dashboard.style';
import {
  goToHash,
  seekE2eComparisonFrame,
} from './replay-browser';
import { page } from './replay-state';
import { buttonUi } from '@craft-ts/ui/style';

const DASHBOARD_URL =
  import.meta.env['VITE_CRAFT_SESSION_DASHBOARD_URL'] ??
  'http://localhost:4210/';

function comparisonSummary(result: E2eComparisonReport | E2eComparisonError | undefined, exception: unknown): string {
  if (result && 'error' in result) return `Chargement impossible · ${result.error}`;
  if (!result && exception !== undefined)
    return `Chargement impossible · ${typeof exception === 'string' ? exception : JSON.stringify(exception)}`;
  if (!result) return 'Chargement des runs et de leur historique…';
  const references = result.baselineCount > 1 ? `${result.baselineCount} références vertes` : `${result.baselineCount} référence verte`;
  const single = result.baselineCount === 1 ? ' · une seule référence : les variations normales ne sont pas connues' : '';
  return `${result.comparison.findings.length} trouvailles · ${references}${single}.`;
}

/** The two replay frames: the latest green reference and the observed run. */
function replayFramesOf(result: E2eComparisonReport | E2eComparisonError | undefined) {
  if (!result || 'error' in result || !result.baselineSource || !result.observedSource) return [];
  const dashboard = new URL(result.dashboardUrl || DASHBOARD_URL);
  const replayUrl = (source: string) => {
    const url = new URL(dashboard);
    url.hash = `#/e2e-replay?${new URLSearchParams({ source }).toString()}`;
    return url.toString();
  };
  return [
    { side: 'baseline', label: 'Référence verte', src: replayUrl(result.baselineSource), origin: dashboard.origin },
    { side: 'observed', label: 'Run observé', src: replayUrl(result.observedSource), origin: dashboard.origin },
  ];
}

/** Places both replays on the steps a finding is about. */
function seekFinding(finding: SessionTraceFinding): void {
  const anchors = sessionTraceFindingAnchors(finding);
  if (anchors.baseline?.eventId) seekE2eComparisonFrame('baseline', anchors.baseline.eventId);
  if (anchors.observed?.eventId) seekE2eComparisonFrame('observed', anchors.observed.eventId);
}

/** Read-only report view for a failed Playwright run and its green history. */
export const E2eComparisonPage = craftComponent(
  'E2eComparisonPage',
  {},
  function* () {
    const service = yield* E2eComparison();
    const report = rawReactiveValue(service.comparison.value);
    const queryException = rawReactiveValue(service.comparison.exception);
    const hidden = yield* craftComputed('hidden', () => page() !== 'compare');
    const title = yield* craftComputed('title', () => {
      const result = report();
      return result && !('error' in result)
        ? `Comparaison · ${result.testId} · ${result.project}`
        : 'Comparaison de session E2E';
    });
    const summaryText = yield* craftComputed('summaryText', () => comparisonSummary(report(), queryException()));
    const comparison = () => {
      const result = report();
      return result && !('error' in result) ? result.comparison : undefined;
    };
    const firstDivergenceLabel = yield* craftComputed('firstDivergenceLabel', () => {
      const first = comparison()?.firstDivergence;
      return first ? `Première divergence · ${sessionTraceFindingLabel(first)}` : 'Aucune divergence bloquante';
    });
    const firstDivergenceText = yield* craftComputed('firstDivergenceText', () => {
      const first = comparison()?.firstDivergence;
      return first ? describeSessionTraceFinding(first) : 'Les pas stables des runs verts se retrouvent dans le run observé.';
    });
    const reportText = yield* craftComputed('reportText', () => {
      const current = comparison();
      return current ? JSON.stringify(current, null, 2) : 'En attente du serveur local…';
    });
    const replayFrames = yield* craftComputed('replayFrames', () => replayFramesOf(report()));
    const findings = yield* craftComputed('findings', () => {
      const current = comparison();
      // Decoded from JSON, the first divergence is a copy of one finding, not the same object.
      const first = current?.firstDivergence ? JSON.stringify(current.firstDivergence) : undefined;
      const firstIndex = (current?.findings ?? []).findIndex((finding) => JSON.stringify(finding) === first);
      return (current?.findings ?? []).map((finding, index) => ({
        finding,
        label: sessionTraceFindingLabel(finding),
        text: ` · ${describeSessionTraceFinding(finding)}`,
        first: index === firstIndex ? 'true' : 'false',
      }));
    });
    const hiddenFirstDivergence = yield* craftComputed('hiddenFirstDivergence', () => comparison() === undefined);
    return div(
      { class: ui.page, hidden, 'data-lab': 'e2e-comparison-page' },
      [
        div({ class: ui.listHead }, [
          div([
            heading({ class: ui.title }, title),
            p({ class: ui.lede, role: 'status' }, summaryText),
          ]),
        ]),
        div({ class: ui.gap }, [
          div(
            {
              class: ui.e2eFirstDivergence,
              'data-lab': 'e2e-first-divergence',
              hidden: hiddenFirstDivergence,
            },
            [
              strong({}, firstDivergenceLabel),
              p({}, firstDivergenceText),
            ],
          ),
          div({ class: ui.e2eComparisonLayout }, [
            div(
              { class: ui.e2eComparisonFrames, 'data-lab': 'e2e-replay-frames' },
              forNode(
                replayFrames,
                { track: (frame) => frame.label },
                (frame) =>
                  div({ class: ui.e2eComparisonFrame, 'data-replay-side': function* () { return (yield* frame()).side; } }, [
                    p(function* () {
                      return (yield* frame()).label;
                    }),
                    iframe({
                      title: function* () {
                        return (yield* frame()).label;
                      },
                      src: function* () {
                        const item = yield* frame();
                        return safeResourceUrl(item.src, { allowedOrigins: [item.origin] });
                      },
                      loading: 'lazy',
                      'data-lab': function* () {
                        return `e2e-replay-${(yield* frame()).side}`;
                      },
                      class: ui.e2eComparisonIframe,
                      sandbox: 'allow-scripts allow-same-origin',
                    }),
                  ]),
              ),
            ),
            div(
              {
                class: ui.e2eComparisonFindings,
                role: 'complementary',
                'aria-label': 'Trouvailles du comparateur',
                'data-lab': 'e2e-comparison-findings-panel',
              },
              [
                p({}, 'Trouvailles'),
                ul(
                  { class: ui.sessions, 'data-lab': 'e2e-comparison-findings' },
                  forNode(
                    findings,
                    { track: (_item, index) => index },
                    (item) =>
                      li({ class: ui.row }, [
                        button(
                          'seekComparisonFinding',
                          {
                            type: 'button',
                            class: ui.rowOpen,
                            'data-lab': 'e2e-comparison-finding',
                            'data-first': function* () {
                              return (yield* item()).first;
                            },
                            click: function* () {
                              seekFinding((yield* item()).finding);
                            },
                          },
                          [
                            strong({}, function* () {
                              return (yield* item()).label;
                            }),
                            span({}, function* () {
                              return (yield* item()).text;
                            }),
                          ],
                        ),
                      ]),
                  ),
                ),
              ],
            ),
          ]),
          details({ 'data-lab': 'e2e-comparison-raw' }, [
            summary('Comparaison brute (JSON)'),
            pre({ class: ui.code, 'data-lab': 'e2e-comparison-json' }, reportText),
          ]),
          div({ class: ui.listHeadActions }, [
            button(
              'backToSessions',
              {
                type: 'button',
                class: buttonUi.root,
                'data-variant': 'secondary',
                click: function* () {
                  goToHash('#/');
                },
              },
              'Retour aux sessions',
            ),
          ]),
        ]),
      ],
    );
  },
);
