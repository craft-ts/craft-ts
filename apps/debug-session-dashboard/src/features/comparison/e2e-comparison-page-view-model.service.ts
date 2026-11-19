import { craftComputed, craftService } from '@craft-ts/core';
import { CraftRouter } from '@craft-ts/core';
import {
  describeSessionTraceFinding,
  sessionTraceFindingLabel,
} from '@craft-ts/session-trace';
import {
  E2eComparison,
  type E2eComparisonError,
  type E2eComparisonReport,
} from '../../shared/data-access/e2e-comparison.service';
import { httpFailureReason } from '../../shared/data-access/session-archive.service';
import { page } from '../../shared/state/replay-state';
import { i18n } from '../../shared/util/catalog';
import { dashboardHref } from '../../shared/util/replay-browser';

function comparisonSummary(
  result: E2eComparisonReport | E2eComparisonError | undefined,
  exception: unknown,
): string {
  if (result && 'error' in result)
    return i18n.t('copy.copy005') + result.error + '';
  if (!result && exception !== undefined)
    return (
      i18n.t('copy.copy006') +
      (typeof exception === 'string'
        ? exception
        : httpFailureReason(exception)) +
      i18n.t('copy.copy007')
    );
  if (!result) return i18n.t('copy.copy008');
  const references = i18n.t(
    result.baselineCount > 1 ? 'greenReferencesMany' : 'greenReferencesOne',
    { count: result.baselineCount },
  );
  const single =
    result.baselineCount === 1 ? i18n.t('singleReferenceNote') : '';
  return (
    i18n.t('copy.copy009') +
    result.comparison.findings.length +
    i18n.t('copy.copy010') +
    references +
    i18n.t('copy.copy011') +
    single +
    '.'
  );
}

function replayFramesOf(
  result: E2eComparisonReport | E2eComparisonError | undefined,
  router: CraftRouter,
) {
  if (
    !result ||
    'error' in result ||
    !result.baselineSource ||
    !result.observedSource
  )
    return [];
  const dashboard = new URL(
    result.dashboardUrl || dashboardHref() || 'http://localhost/',
  );
  const replayUrl = (source: string) => {
    const serialized = router.serializeUrl(
      router.createUrlTree({ to: 'e2e-replay', queryParams: { source } }),
    );
    if (!result.dashboardUrl) return serialized;
    const hashAt = serialized.indexOf('#');
    if (hashAt < 0) return new URL(serialized, dashboard).toString();
    const url = new URL(dashboard.href);
    url.hash = serialized.slice(hashAt + 1);
    return url.toString();
  };
  return [
    {
      side: 'baseline',
      label: i18n.t('greenReferenceFrame'),
      src: replayUrl(result.baselineSource),
      origin: dashboard.origin,
    },
    {
      side: 'observed',
      label: i18n.t('observedRunFrame'),
      src: replayUrl(result.observedSource),
      origin: dashboard.origin,
    },
  ];
}

export const { E2eComparisonPageViewModel } = craftService(
  { name: 'e2eComparisonPageViewModel', providedIn: 'global' },
  function* () {
    const { comparison: query } = yield* E2eComparison();
    const report = query.value;
    const queryException = query.exception;
    yield* craftComputed('pageHidden', () => page() !== 'compare');

    yield* craftComputed('title', function* () {
      const result = yield* report();
      return result && !('error' in result)
        ? i18n.t('copy.copy012') +
            result.testId +
            i18n.t('copy.copy013') +
            result.project +
            ''
        : i18n.t('copy.copy014');
    });
    yield* craftComputed('summaryText', function* () {
      return comparisonSummary(yield* report(), yield* queryException());
    });
    yield* craftComputed('firstDivergenceLabel', function* () {
      const result = yield* report();
      const first =
        result && !('error' in result) ? result.comparison.firstDivergence : undefined;
      return first
        ? i18n.t('findingHeading', {
            findingLabel: sessionTraceFindingLabel(first),
          })
        : i18n.t('copy.copy016');
    });
    yield* craftComputed('firstDivergenceText', function* () {
      const result = yield* report();
      const first =
        result && !('error' in result) ? result.comparison.firstDivergence : undefined;
      return first
        ? i18n.t('findingDetails', {
            findingDetails: describeSessionTraceFinding(first),
          })
        : i18n.t('copy.copy017');
    });
    yield* craftComputed('reportText', function* () {
      const result = yield* report();
      const current = result && !('error' in result) ? result.comparison : undefined;
      return current
        ? JSON.stringify(current, null, 2)
        : i18n.t('copy.copy018');
    });
    yield* craftComputed('replayFrames', function* () {
      return replayFramesOf(yield* report(), yield* CraftRouter());
    });
    yield* craftComputed('findings', function* () {
      const result = yield* report();
      const current = result && !('error' in result) ? result.comparison : undefined;
      const first = current?.firstDivergence
        ? JSON.stringify(current.firstDivergence)
        : undefined;
      const firstIndex = (current?.findings ?? []).findIndex(
        (finding) => JSON.stringify(finding) === first,
      );
      return (current?.findings ?? []).map((finding, index) => ({
        finding,
        label: i18n.t('findingLabelText', {
          findingLabel: sessionTraceFindingLabel(finding),
        }),
        text: ` · ${describeSessionTraceFinding(finding)}`,
        first: index === firstIndex ? 'true' : 'false',
      }));
    });
    yield* craftComputed(
      'hiddenFirstDivergence',
      function* () {
        const result = yield* report();
        return !result || 'error' in result;
      },
    );
  },
);
