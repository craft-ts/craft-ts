import { isRecord } from './replay-model';
import { sessionDate } from './replay-labels';
import { i18n } from './catalog';

/**
 * The coverage page reads what each app's architecture suite computed — the
 * behaviours its tests owe, what proves each one — and what the archive found
 * in the recorded sessions. This module sorts it into what to do next.
 */

export type BehaviorObservation = Readonly<{
  sessionId: string;
  createdAt: string;
  eventId: string;
}>;

export type BehaviorCoverageEntry = Readonly<{
  id: string;
  kind: string;
  file?: string;
  status: 'proven' | 'waived' | 'unproven';
  provenBy: readonly string[];
  waiver?: string;
  mutant?: 'killed' | 'survived' | 'not-reached';
  observations: readonly BehaviorObservation[];
}>;

export type AppBehaviorCoverage = Readonly<{
  app: string;
  behaviors: readonly BehaviorCoverageEntry[];
}>;

function isObservation(value: unknown): value is BehaviorObservation {
  return (
    isRecord(value) &&
    typeof value['sessionId'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['eventId'] === 'string'
  );
}

function isEntry(value: unknown): value is BehaviorCoverageEntry {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['kind'] === 'string' &&
    ['proven', 'waived', 'unproven'].includes(String(value['status'])) &&
    Array.isArray(value['provenBy']) &&
    Array.isArray(value['observations']) &&
    value['observations'].every(isObservation)
  );
}

/** `GET /sessions/behavior-coverage`; what cannot be read is left out. */
export const behaviorCoverageDecoder = {
  decode(input: unknown): readonly AppBehaviorCoverage[] {
    const apps = isRecord(input) ? input['apps'] : undefined;
    if (!Array.isArray(apps)) return [];
    return apps.flatMap((app) =>
      isRecord(app) &&
      typeof app['app'] === 'string' &&
      Array.isArray(app['behaviors'])
        ? [{ app: app['app'], behaviors: app['behaviors'].filter(isEntry) }]
        : [],
    );
  },
};

/**
 * Where a behaviour stands, in the order the page lists them: what to fix
 * first, then what to write, then what is done.
 */
export type CoverageSection =
  | 'hollow'
  | 'seen'
  | 'unseenHappy'
  | 'unseenException'
  | 'waived'
  | 'proven';

export const COVERAGE_SECTIONS: readonly CoverageSection[] = [
  'hollow',
  'seen',
  'unseenHappy',
  'unseenException',
  'waived',
  'proven',
];

export type CoverageRow = Readonly<{
  key: string;
  /** The catalog id. */
  id: string;
  app: string;
  label: string;
  kind: string;
  /** One line under the label: the tests, the waiver, the session. */
  meta: string;
  /** The latest session that shows it, to open from the row. */
  observation?: BehaviorObservation;
}>;

export type CoverageSummary = Readonly<{
  app: string;
  text: string;
}>;

const KIND_LABEL: Readonly<Record<string, string>> = {
  route: i18n.t('coverageKindRoute'),
  guard: i18n.t('coverageKindGuard'),
  method: i18n.t('coverageKindMethod'),
  mutation: i18n.t('coverageKindMutation'),
  command: i18n.t('coverageKindCommand'),
  'async-process': i18n.t('coverageKindAsyncProcess'),
  'state-machine': i18n.t('coverageKindStateMachine'),
  'server-function': i18n.t('coverageKindServerFunction'),
  'http-exception': i18n.t('coverageKindHttpException'),
  declared: i18n.t('coverageKindDeclared'),
};

/**
 * `route:shop:formule/:id` → `/formule/:id`, `mutation:cart.add#success` →
 * `cart.add`, `http-exception:POST /orders#OutOfStock` → `POST /orders →
 * OutOfStock`: the catalog id, read by a person.
 */
export function behaviorLabel(id: string, kind: string): string {
  const rest = id.slice(id.indexOf(':') + 1);
  if (kind === 'route') return `/${rest.slice(rest.indexOf(':') + 1)}`;
  if (kind === 'guard') return rest.slice(rest.indexOf(':') + 1);
  if (kind === 'http-exception') {
    const cut = rest.lastIndexOf('#');
    return `${rest.slice(0, cut)} → ${rest.slice(cut + 1)}`;
  }
  return rest.replace(/#success$/, '');
}

export function sectionOf(entry: BehaviorCoverageEntry): CoverageSection {
  if (entry.status === 'proven')
    return entry.mutant === 'survived' ? 'hollow' : 'proven';
  if (entry.status === 'waived') return 'waived';
  if (entry.observations.length > 0) return 'seen';
  return entry.kind === 'http-exception' ? 'unseenException' : 'unseenHappy';
}

const MUTANT_LABEL: Readonly<Record<string, string>> = {
  killed: i18n.t('mutantKilled'),
  survived: i18n.t('mutantSurvived'),
  'not-reached': i18n.t('mutantNotReached'),
};

function testsLabel(tests: readonly string[]): string {
  const shown = tests.slice(0, 2).join(' · ');
  return tests.length > 2 ? `${shown} · +${tests.length - 2}` : shown;
}

function metaOf(
  entry: BehaviorCoverageEntry,
  section: CoverageSection,
): string {
  const latest = entry.observations[0];
  switch (section) {
    case 'hollow':
    case 'proven':
      return [
        testsLabel(entry.provenBy),
        ...(entry.mutant ? [MUTANT_LABEL[entry.mutant]] : []),
      ].join(' · ');
    case 'waived':
      return entry.waiver ?? '';
    case 'seen':
      return latest
        ? i18n.t('coverageSeenOn', {
            date: sessionDate.format(new Date(latest.createdAt)),
          }) +
          (entry.observations.length > 1
            ? i18n.t('coverageSeenInSessions', {
                count: entry.observations.length,
              })
            : '')
        : '';
    default:
      return entry.file ?? '';
  }
}

export type CoverageView = Readonly<{
  summaries: readonly CoverageSummary[];
  sections: Readonly<Record<CoverageSection, readonly CoverageRow[]>>;
}>;

export function coverageView(
  apps: readonly AppBehaviorCoverage[],
): CoverageView {
  const sections: Record<CoverageSection, CoverageRow[]> = {
    hollow: [],
    seen: [],
    unseenHappy: [],
    unseenException: [],
    waived: [],
    proven: [],
  };
  const summaries = apps.map((app) => {
    // Nested route collections all have a `/` page: the collection tells them apart.
    const labels = app.behaviors.map((entry) =>
      behaviorLabel(entry.id, entry.kind),
    );
    const repeated = new Set(
      labels.filter((label, index) => labels.indexOf(label) !== index),
    );
    app.behaviors.forEach((entry, index) => {
      const section = sectionOf(entry);
      const observation = entry.observations[0];
      const label = labels[index] ?? entry.id;
      sections[section].push({
        key: `${app.app}\u0000${entry.id}`,
        id: entry.id,
        app: app.app,
        label:
          repeated.has(label) && entry.kind === 'route'
            ? `${entry.id.split(':')[1]} ${label}`
            : label,
        kind: KIND_LABEL[entry.kind] ?? entry.kind,
        meta: metaOf(entry, section),
        ...(section === 'seen' && observation ? { observation } : {}),
      });
    });
    const proven = app.behaviors.filter(
      (entry) => entry.status === 'proven',
    ).length;
    const hollow = app.behaviors.filter(
      (entry) => sectionOf(entry) === 'hollow',
    ).length;
    const seen = app.behaviors.filter(
      (entry) => sectionOf(entry) === 'seen',
    ).length;
    return {
      app: app.app,
      text: [
        i18n.t('coverageProvenOf', {
          count: proven,
          total: app.behaviors.length,
        }),
        ...(hollow > 0
          ? [
              i18n.t(hollow > 1 ? 'coverageHollowMany' : 'coverageHollowOne', {
                count: hollow,
              }),
            ]
          : []),
        ...(seen > 0
          ? [
              i18n.t(seen > 1 ? 'coverageSeenMany' : 'coverageSeenOne', {
                count: seen,
              }),
            ]
          : []),
      ].join(' · '),
    };
  });
  return { summaries, sections };
}

/**
 * What « Reprendre ici » asks the agent when the coverage page sent the
 * person: a Playwright test that proves this one obligation, written from the
 * session that showed it. The kind is the id's prefix.
 */
export function coverageE2eIntent(app: string, id: string): string {
  const label = behaviorLabel(id, id.slice(0, id.indexOf(':')));
  return [
    `Écrire un test e2e Playwright qui prouve le comportement « ${label} » de ${app} (obligation ${id}), vu dans cette session à ce moment.`,
    'Reproduis ce que la session a fait jusqu’ici, déclenche ce comportement, puis vérifie son effet visible par une assertion (`expect` des fixtures e2e, rôles et textes, pas de sélecteur CSS).',
    'Annote le test avec craftSession({ id }) et lance-le : sa référence dans e2e/__sessions__ doit prouver l’obligation dans la suite d’architecture de l’app.',
  ].join(' ');
}
