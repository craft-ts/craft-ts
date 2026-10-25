import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  iframe,
  li,
  p,
  pre,
  ul,
} from '@craft-ts/component';
import {
  craftComputed,
  rawReactiveValue,
} from '@craft-ts/core';
import { E2eComparison } from './e2e-comparison.service';
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

type E2eFinding = Readonly<{
  kind: string;
  expected?: Readonly<{ key: string; elapsedMs: number }>;
  observed?: Readonly<{ key: string; elapsedMs: number }>;
  step?: Readonly<{ key: string; elapsedMs: number }>;
}>;

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
      const result = report() as
        | { testId?: string; project?: string; sessionId?: string }
        | undefined;
      return result?.testId
        ? `Comparaison · ${result.testId} · ${result.project ?? ''}`
        : 'Comparaison de session E2E';
    });
    const summary = yield* craftComputed('comparisonSummary', () => {
      const result = report() as
        | {
            baselineCount?: number;
            comparison?: { findings?: readonly unknown[]; firstDivergence?: unknown };
          }
        | undefined;
      if (!result) {
        const exception = queryException();
        if (exception !== undefined)
          return `Chargement impossible · ${typeof exception === 'string' ? exception : JSON.stringify(exception)}`;
        return 'Chargement des runs et de leur historique…';
      }
      const divergence = result.comparison?.firstDivergence
        ? 'Une divergence stable a été détectée.'
        : 'Aucune divergence stable détectée.';
      return `${divergence} · ${result.baselineCount ?? 0} références vertes · ${result.comparison?.findings?.length ?? 0} trouvailles.`;
    });
    const reportText = yield* craftComputed('reportText', () => {
      const result = report();
      return result ? JSON.stringify(result, null, 2) : 'En attente du serveur local…';
    });
    const replayFrames = yield* craftComputed('replayFrames', () => {
      const result = report() as
        | { baselineSource?: string; observedSource?: string; dashboardUrl?: string }
        | undefined;
      if (!result?.baselineSource || !result.observedSource) return [];
      const replayUrl = (source: string) => {
        const url = new URL(result.dashboardUrl ?? DASHBOARD_URL);
        url.hash = `#/e2e-replay?${new URLSearchParams({ source }).toString()}`;
        return url.toString();
      };
      return [
        { label: 'Référence verte', src: replayUrl(result.baselineSource) },
        { label: 'Run observé', src: replayUrl(result.observedSource) },
      ];
    });
    const findings = yield* craftComputed('findings', () => {
      const result = report() as
        | {
            comparison?: { findings?: readonly E2eFinding[] };
          }
        | undefined;
      return result?.comparison?.findings ?? [];
    });
    return div(
      { class: ui.page, hidden, 'data-lab': 'e2e-comparison-page' },
      [
        div({ class: ui.listHead }, [
          div([
            heading({ class: ui.title }, title),
            p({ class: ui.lede, role: 'status' }, summary),
          ]),
        ]),
        div({ class: ui.gap }, [
          p(
            {},
            'Le rapport aligne les événements stables de tous les runs verts avec le run observé. Les événements variables entre références sont conservés comme bruit.',
          ),
          div({ class: ui.e2eComparisonLayout }, [
            div(
              { class: ui.e2eComparisonFrames, 'data-lab': 'e2e-replay-frames' },
              forNode(
                replayFrames,
                { track: (frame) => frame.label },
                (frame, index) =>
                  div({ class: ui.e2eComparisonFrame, 'data-replay-side': index === 0 ? 'baseline' : 'observed' }, [
                    p(function* () {
                      return (yield* frame()).label;
                    }),
                    iframe({
                      title: function* () {
                        return (yield* frame()).label;
                      },
                      src: function* () {
                        return (yield* frame()).src;
                      },
                      loading: 'lazy',
                      'data-lab': `e2e-replay-${index === 0 ? 'baseline' : 'observed'}`,
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
                    { track: (_finding, index) => index },
                    (finding, index) =>
                      li({ class: ui.row }, [
                        button(
                          'seekComparisonFinding',
                          {
                            type: 'button',
                            class: ui.rowOpen,
                            'data-lab': 'e2e-comparison-finding',
                            click: function* () {
                              const item = yield* finding();
                              const result = report() as {
                                baselineDurationMs?: number;
                                observedDurationMs?: number;
                              } | undefined;
                              const findingStep = item.step;
                              const baselineMs = item.expected?.elapsedMs ?? findingStep?.elapsedMs ?? 0;
                              const observedMs = item.observed?.elapsedMs ?? findingStep?.elapsedMs ?? baselineMs;
                              seekE2eComparisonFrame(
                                'baseline',
                                (baselineMs / Math.max(1, result?.baselineDurationMs ?? 1)),
                              );
                              seekE2eComparisonFrame(
                                'observed',
                                (observedMs / Math.max(1, result?.observedDurationMs ?? 1)),
                              );
                            },
                          },
                          function* () {
                            const item = yield* finding();
                            return `${index + 1}. ${item.kind} · ${item.expected?.key ?? item.observed?.key ?? item.step?.key ?? 'étape'}`;
                          },
                        ),
                      ]),
                  ),
                ),
              ],
            ),
          ]),
          pre({ class: ui.code, 'data-lab': 'e2e-comparison-json' }, reportText),
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
