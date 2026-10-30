import {
  buildDebugAppSnapshot,
  CRAFT_GUIDED_RESUME_REQUEST_QUERY_PARAM,
  CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM,
  type DebugAppSnapshot,
} from '@craft-ts/component';
import { newUuid, onWindowMessage, openLinkedTab } from './replay-browser';
import { isRecord, parseLocalTarget, REPLAY_CHANNEL } from './replay-model';
import {
  activeReplayParticipantId,
  replayableEvents,
  replayIndex,
  replayParticipantIds,
  sessionForParticipant,
  status,
  targetUrl,
} from './replay-state';

/**
 * Debug launches: the app opened in its own tab, live, from the state a
 * recording had at one point. The tab asks this window for its snapshot once
 * it has loaded (`snapshot-request`) and holds its bootstrap until it arrives.
 */
type DebugLaunch = Readonly<{
  tab: Window;
  origin: string;
  snapshot: DebugAppSnapshot;
}>;

const launches = new Map<string, DebugLaunch>();
let listening = false;

function listenToDebugTabs(): void {
  if (listening) return;
  listening = true;
  onWindowMessage((message) => {
    const data = message.data;
    if (!isRecord(data) || data['channel'] !== REPLAY_CHANNEL) return;
    const launchId = data['launchId'];
    if (typeof launchId !== 'string') return;
    const launch = launches.get(launchId);
    if (
      !launch ||
      message.source !== launch.tab ||
      message.origin !== launch.origin
    )
      return;
    switch (data['type']) {
      case 'snapshot-request':
        launch.tab.postMessage(
          {
            channel: REPLAY_CHANNEL,
            type: 'restore-app-snapshot',
            launchId,
            snapshot: launch.snapshot,
          },
          launch.origin,
        );
        return;
      case 'snapshot-restored': {
        // Work to relaunch reports back once the app has done it.
        if (!launch.snapshot.inFlight) launches.delete(launchId);
        const warnings = Array.isArray(data['warnings'])
          ? data['warnings'].filter((entry) => typeof entry === 'string')
          : [];
        status.set(
          [
            'Application lancée en mode debug à l’état choisi.',
            ...(launch.snapshot.inFlight
              ? ['Relance des opérations en cours…']
              : []),
            ...warnings,
          ].join(' '),
        );
        return;
      }
      case 'snapshot-inflight': {
        launches.delete(launchId);
        const names = (value: unknown): readonly string[] =>
          Array.isArray(value)
            ? value.filter((entry) => typeof entry === 'string')
            : [];
        const relaunched = names(data['relaunched']);
        const failed = names(data['failed']);
        status.set(
          [
            `Application lancée en mode debug. ${relaunched.length} opération(s) en cours relancée(s).`,
            ...(failed.length ? [`Non relancées : ${failed.join(', ')}.`] : []),
            ...launch.snapshot.warnings,
          ].join(' '),
        );
        return;
      }
      case 'snapshot-error':
        launches.delete(launchId);
        status.set(
          `Le lancement en mode debug a échoué : ${String(data['message'])}`,
        );
        return;
    }
  });
}

/**
 * Starts the app in debug mode, in a new tab, from the state it had just
 * before the event with this sequence — or at the end of the recording when
 * omitted. `participantId` picks which tab of a multi-tab recording.
 */
export function launchDebugApp(
  beforeSequence?: number,
  participantId?: string,
): void {
  const owner = participantId ?? replayParticipantIds()[0];
  const recording = owner ? sessionForParticipant(owner) : undefined;
  if (!recording) {
    status.set('Aucune session à ouvrir en mode debug.');
    return;
  }
  const target = parseLocalTarget(targetUrl().trim());
  if (!target.ok) {
    status.set(target.error);
    return;
  }
  const snapshot = buildDebugAppSnapshot(recording, beforeSequence);
  const launchId = newUuid();
  const url = new URL(snapshot.route, target.url.origin);
  url.searchParams.set(CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM, launchId);
  listenToDebugTabs();
  const tab = openLinkedTab(url.href);
  if (!tab) {
    status.set(
      'Le navigateur a bloqué l’ouverture de l’onglet de debug. Autorise les fenêtres surgissantes pour ce dashboard.',
    );
    return;
  }
  launches.set(launchId, { tab, origin: target.url.origin, snapshot });
  status.set(`Ouverture de l’application sur ${snapshot.route}…`);
}

/** Opens a clean, dedicated app tab for one immutable guided-resume request. */
export function launchGuidedResumeTab(
  beforeSequence: number | undefined,
  participantId: string | undefined,
  requestId: string,
  sourceSessionId: string,
): Readonly<{ url: string; opened: boolean; tab: Window | null }> {
  const owner = participantId ?? replayParticipantIds()[0];
  const recording = owner ? sessionForParticipant(owner) : undefined;
  if (!recording) {
    status.set('Aucune session à ouvrir pour la reprise guidée.');
    return { url: '', opened: false, tab: null };
  }
  const target = parseLocalTarget(targetUrl().trim());
  if (!target.ok) {
    status.set(target.error);
    return { url: '', opened: false, tab: null };
  }
  const snapshot = buildDebugAppSnapshot(recording, beforeSequence);
  const url = new URL(snapshot.route, target.url.origin);
  url.searchParams.set(CRAFT_GUIDED_RESUME_REQUEST_QUERY_PARAM, requestId);
  url.searchParams.set('craft-resume-session', sourceSessionId);
  if (beforeSequence !== undefined)
    url.searchParams.set('craft-resume-before', String(beforeSequence));
  if (participantId)
    url.searchParams.set('craft-resume-participant', participantId);
  const tab = openLinkedTab(url.href);
  status.set(
    tab
      ? `Onglet de reprise ouvert sur ${snapshot.route}.`
      : 'Le navigateur a bloqué l’ouverture de l’onglet de reprise. Autorise les fenêtres surgissantes pour ce dashboard.',
  );
  return { url: url.href, opened: tab !== null, tab };
}

/** Starts a saved recipe in a clean application tab. The app runner reads the
 * recipe id from its URL and reports each execution to the local archive. */
export function launchResumeRecipeTab(
  recipeId: string,
  origin: string,
): boolean {
  const target = parseLocalTarget(origin);
  if (!target.ok) {
    status.set(target.error);
    return false;
  }
  const url = new URL('/', target.url.origin);
  url.searchParams.set('craft-resume-recipe', recipeId);
  url.searchParams.set('craft-resume-recipe-launch', newUuid());
  const tab = openLinkedTab(url.href);
  status.set(
    tab
      ? 'Prévalidation ouverte dans un nouvel onglet. Le statut de la recette suivra les attentes et le point d’observation.'
      : 'Le navigateur a bloqué l’ouverture de la recette. Autorise les fenêtres surgissantes pour ce dashboard.',
  );
  return tab !== null;
}

/**
 * The state the replay is at: just before the next action it will run, or the
 * end of the recording once it has run them all.
 */
export function launchDebugAppAtReplay(): void {
  const point = replayPoint();
  launchDebugApp(point.beforeSequence, point.participantId);
}

/** Where the replay is: before the next action, in the tab that will run it. */
export function replayPoint(): Readonly<{
  beforeSequence?: number;
  participantId?: string;
}> {
  const next = replayableEvents()[replayIndex()];
  const participantId = next?.participantId ?? activeReplayParticipantId();
  return {
    ...(next?.sequence === undefined ? {} : { beforeSequence: next.sequence }),
    ...(participantId === undefined ? {} : { participantId }),
  };
}
