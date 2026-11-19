import { craftComputed, craftService } from '@craft-ts/core';
import { BehaviorCoverageArchive } from '../../shared/data-access/behavior-coverage.service';
import {
  COVERAGE_SECTIONS,
  coverageView,
  type CoverageSection,
} from '../../shared/util/behavior-coverage';
import { i18n } from '../../shared/util/catalog';

const SECTION_COPY: Readonly<
  Record<CoverageSection, { title: string; hint: string }>
> = {
  hollow: { title: i18n.t('copy.copy185'), hint: i18n.t('copy.copy186') },
  seen: { title: i18n.t('copy.copy187'), hint: i18n.t('copy.copy188') },
  unseenHappy: { title: i18n.t('copy.copy189'), hint: i18n.t('copy.copy190') },
  unseenException: {
    title: i18n.t('copy.copy191'),
    hint: i18n.t('copy.copy192'),
  },
  waived: { title: i18n.t('copy.copy193'), hint: i18n.t('copy.copy194') },
  proven: { title: i18n.t('copy.copy195'), hint: i18n.t('copy.copy196') },
};

const SECTION_TONE: Readonly<Record<CoverageSection, string>> = {
  hollow: 'danger',
  seen: 'warning',
  unseenHappy: 'warning',
  unseenException: 'warning',
  waived: 'tip',
  proven: 'important',
};

export const { CoveragePageView } = craftService(
  { name: 'coveragePageView', providedIn: 'global' },
  function* () {
    const { coverage } = yield* BehaviorCoverageArchive();
    yield* craftComputed('coverageSummaries', function* () {
      return coverageView(yield* coverage.coverageApps()).summaries;
    });
    yield* craftComputed('severalApps', function* () {
      return (yield* coverage.coverageApps()).length > 1;
    });
    yield* craftComputed('coverageSections', function* () {
      const view = coverageView(yield* coverage.coverageApps());
      return COVERAGE_SECTIONS.filter(
        (section) => view.sections[section].length > 0,
      ).map((section) => ({
        section,
        ...SECTION_COPY[section],
        tone: SECTION_TONE[section],
        count: String(view.sections[section].length),
        rows: view.sections[section],
      }));
    });
    yield* craftComputed('coverageLoading', function* () {
      return yield* coverage.coverageLoading();
    });
    yield* craftComputed('coverageUnreachable', function* () {
      return yield* coverage.coverageUnreachable();
    });
    yield* craftComputed('coverageHasApps', function* () {
      return (yield* coverage.coverageApps()).length > 0;
    });
  },
);
