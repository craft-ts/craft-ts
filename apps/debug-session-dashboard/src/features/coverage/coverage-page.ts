import { i18n } from '../../shared/util/catalog';
import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  li,
  p,
  span,
  ul,
} from '@craft-ts/component';
import { CraftRouter, craftComputed, rawReactiveValue } from '@craft-ts/core';
import { badgeUi, buttonUi } from '@craft-ts/ui/style';
import { ui } from '../../shared/ui/dashboard.style';
import { BehaviorCoverageArchive } from '../../shared/data-access/behavior-coverage.service';
import {
  COVERAGE_SECTIONS,
  coverageView,
  type CoverageSection,
} from '../../shared/util/behavior-coverage';

/** What each section says, and what to do about the behaviours in it. */
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

/** The tone of a section's count: what needs work stands out. */
const SECTION_TONE: Readonly<Record<CoverageSection, string>> = {
  hollow: 'danger',
  seen: 'warning',
  unseenHappy: 'warning',
  unseenException: 'warning',
  waived: 'tip',
  proven: 'important',
};

/**
 * The behaviours each app owes a test for, sorted by what to do next: a proof
 * that does not look at its behaviour, a behaviour seen in a recorded session
 * and never tested (open the session, resume there, get an e2e), one never
 * seen at all, then what is excused and what is proven.
 */
export const CoveragePage = craftComponent('CoveragePage', {}, function* () {
  const archive = yield* BehaviorCoverageArchive();
  const apps = rawReactiveValue(archive.coverageApps);
  const loading = rawReactiveValue(archive.coverageLoading);
  const unreachable = rawReactiveValue(archive.coverageUnreachable);

  const coverageSummaries = yield* craftComputed(
    'coverageSummaries',
    () => coverageView(apps()).summaries,
  );
  const severalApps = yield* craftComputed(
    'severalApps',
    () => apps().length > 1,
  );
  const coverageSections = yield* craftComputed('coverageSections', () => {
    const view = coverageView(apps());
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

  const summaryList = ul(
    { class: ui.rowChips, 'data-lab': 'coverage-summaries' },
    forNode(coverageSummaries, { track: (summary) => summary.app }, (summary) =>
      li({ class: ui.fact }, [
        span({ class: ui.factLabel }, function* () {
          return (yield* summary()).app;
        }),
        span({ class: ui.factValue }, function* () {
          return (yield* summary()).text;
        }),
      ]),
    ),
  );

  const sectionList = div(
    { class: ui.sectionStack, 'data-lab': 'coverage-sections' },
    forNode(coverageSections, { track: (block) => block.section }, (block) =>
      div(
        {
          class: ui.sideSection,
          'data-lab': function* () {
            return `coverage-${(yield* block()).section}`;
          },
        },
        [
          p({ class: ui.sideSectionTitle }, [
            span(function* () {
              return (yield* block()).title;
            }),
            span(
              {
                class: badgeUi.root,
                'data-tone': function* () {
                  return (yield* block()).tone;
                },
              },
              function* () {
                return (yield* block()).count;
              },
            ),
          ]),
          p({ class: ui.lede }, function* () {
            return (yield* block()).hint;
          }),
          ul(
            { class: ui.sessions },
            forNode(
              function* () {
                return (yield* block()).rows;
              },
              { track: (row) => row.key },
              (row) =>
                li({ class: ui.row, 'data-lab': 'coverage-row' }, [
                  span({ class: ui.rowBody }, [
                    span({ class: ui.rowTitle }, [
                      span(function* () {
                        return (yield* row()).label;
                      }),
                      span({ class: badgeUi.root }, function* () {
                        return (yield* row()).kind;
                      }),
                      span(
                        {
                          class: badgeUi.root,
                          hidden: function* () {
                            return !(yield* severalApps());
                          },
                        },
                        function* () {
                          return (yield* row()).app;
                        },
                      ),
                    ]),
                    span({ class: ui.rowMeta }, function* () {
                      return (yield* row()).meta;
                    }),
                  ]),
                  button(
                    'openCoverageObservation',
                    {
                      type: 'button',
                      class: [buttonUi.root, ui.inlineAction],
                      'data-variant': 'link',
                      'data-lab': 'coverage-open-session',
                      hidden: function* () {
                        return (yield* row()).observation === undefined;
                      },
                      click: function* () {
                        const observation = (yield* row()).observation;
                        if (!observation) return;
                        yield* CraftRouter.navigate({
                          to: 'sessions/:sessionId',
                          params: { sessionId: observation.sessionId },
                          queryParams: { event: observation.eventId },
                        });
                      },
                    },
                    i18n.t('copy.copy197'),
                  ),
                  button(
                    'writeCoverageE2e',
                    {
                      type: 'button',
                      class: [buttonUi.root, ui.inlineAction],
                      'data-variant': 'link',
                      'data-lab': 'coverage-write-e2e',
                      hidden: function* () {
                        return (yield* row()).observation === undefined;
                      },
                      click: function* () {
                        const item = yield* row();
                        const observation = item.observation;
                        if (!observation) return;
                        yield* CraftRouter.navigate({
                          to: 'sessions/:sessionId',
                          params: { sessionId: observation.sessionId },
                          queryParams: {
                            event: observation.eventId,
                            behavior: item.id,
                            app: item.app,
                          },
                        });
                      },
                    },
                    i18n.t('copy.copy203'),
                  ),
                ]),
            ),
          ),
        ],
      ),
    ),
  );

  const empty = p(
    {
      class: ui.empty,
      'data-lab': 'empty-coverage',
      hidden: function* () {
        return loading() || unreachable() || apps().length > 0;
      },
    },
    i18n.t('copy.copy198'),
  );
  const unreachableNote = p(
    {
      class: ui.empty,
      'data-lab': 'coverage-unreachable',
      hidden: function* () {
        return !unreachable();
      },
    },
    i18n.t('copy.copy199'),
  );

  return div({ class: ui.scroll }, [
    div({ class: ui.listPage }, [
      div({ class: ui.listHead }, [
        div([
          heading({ class: ui.title }, i18n.t('copy.copy200')),
          p({ class: ui.lede }, i18n.t('copy.copy201')),
        ]),
      ]),
      summaryList,
      sectionList,
      empty,
      unreachableNote,
    ]),
  ]);
});
