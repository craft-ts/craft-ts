import {
  buildDebugSessionResumePlan,
  buildDebugSessionResumeManifest,
  buildDebugAppSnapshot,
  combineDebugSessionResumePlans,
  CRAFT_DEBUG_SNAPSHOT_QUERY_PARAM,
  isDebugSessionResumeOverrideList,
  planningDeclarationsOf,
  validateDebugSessionResumeOverrides,
  type DebugSessionResumeDescription,
  type DebugSessionResumeManifest,
  type DebugSessionResumePlan,
  type DebugSessionResumeSourceHashRecord,
  type DebugAppSnapshot,
  type ResumeOverride,
  type ResumeStepStatus,
  classifyResumeFidelity,
  RESUME_FIDELITY_LABELS,
  RESUME_STEP_STATUSES,
  debugSessionResumeResourcesRecord,
  normalizeDebugSessionResumeResource,
} from '@craft-ts/component';
import {
  frameHasWindow,
  newUuid,
  onWindowMessage,
  openLinkedTab,
  postToFrame,
  saveTextFile,
} from './replay-browser';
import { isRecord, parseLocalTarget, REPLAY_CHANNEL } from './replay-model';
import {
  activeReplayParticipantId,
  frameConnections,
  replayableEvents,
  replayIndex,
  replayParticipantIds,
  resumeParticipantIds,
  resumePlan,
  resumeAssistantProposals,
  resumePreflight,
  resumeExecution,
  resumeHeldCall,
  resumeClockPolicy,
  resumeProfile,
  resumeAssistantAutoApprove,
  routeSessionId,
  session,
  sessionForParticipant,
  status,
  targetUrl,
} from './replay-state';
import type { ResumePreflightDisplay } from './replay-state';
import type { ResumeAssistantProposal } from './replay-state';
import { SESSION_ARCHIVE_URL } from './session-archive.service';
import { isLoopbackResumeAssistantOrigin } from './resume-assistant-policy';
import { launchDueReplayParticipants } from './replay-playback';

type PendingResumePlan = Readonly<{
  participantId: string;
  archive: NonNullable<ReturnType<typeof sessionForParticipant>>;
  targetElapsedMs: number;
}>;

type ResumePlanBatch = {
  readonly participantIds: readonly string[];
  readonly targetElapsedMs: number;
  readonly failures: Map<string, string>;
};

const pendingResumePlans = new Map<string, PendingResumePlan>();
const resumePlanTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const resumePlanRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingResumePreflights = new Map<string, string>();
const resumePreflightTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
let currentResumePlan: DebugSessionResumePlan | undefined;
let currentResumeArchive: PendingResumePlan['archive'] | undefined;
let currentResumeParticipantId: string | undefined;
const currentResumePlans = new Map<
  string,
  { plan: DebugSessionResumePlan; archive: PendingResumePlan['archive'] }
>();
let currentResumePlanBatch: ResumePlanBatch | undefined;
let resumeAssistantPollTimer: ReturnType<typeof setTimeout> | undefined;
const autoApprovingResumeProposals = new Set<string>();

function clearPendingResumeRequests(): void {
  for (const timeout of resumePlanTimeouts.values()) clearTimeout(timeout);
  for (const timeout of resumePlanRetryTimers.values()) clearTimeout(timeout);
  for (const timeout of resumePreflightTimeouts.values()) clearTimeout(timeout);
  resumePlanTimeouts.clear();
  resumePlanRetryTimers.clear();
  resumePreflightTimeouts.clear();
  pendingResumePlans.clear();
  pendingResumePreflights.clear();
  currentResumePlans.clear();
  currentResumePlanBatch = undefined;
}

function publishResumeAssistantContext(
  phase: 'prepare' | 'execute',
  mismatches: readonly unknown[],
): void {
  const id = routeSessionId();
  if (!id) return;
  void fetch(
    `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(id)}/resume-assistant/context`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        phase,
        plan: resumePlan() ?? null,
        mismatches,
        updatedAt: new Date().toISOString(),
      }),
    },
  ).catch(() => undefined);
  pollResumeAssistantProposals(id);
}

function pollResumeAssistantProposals(id: string): void {
  if (resumeAssistantPollTimer) clearTimeout(resumeAssistantPollTimer);
  const poll = async (): Promise<void> => {
    if (routeSessionId() !== id) return;
    try {
      const response = await fetch(
        `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(id)}/resume-assistant/proposals`,
      );
      const payload: unknown = await response.json();
      const proposals = isRecord(payload) ? payload['proposals'] : undefined;
      if (response.ok && Array.isArray(proposals)) {
        const accepted = proposals.filter(isResumeAssistantProposal);
        resumeAssistantProposals.set(
          accepted,
        );
        if (
          resumeAssistantAutoApprove() &&
          isLoopbackResumeAssistantOrigin(window.location.origin)
        ) {
          for (const proposal of accepted) {
            if (
              (proposal.status === 'proposed' ||
                proposal.status === 'apply-requested') &&
              !autoApprovingResumeProposals.has(proposal.id)
            ) {
              autoApprovingResumeProposals.add(proposal.id);
              approveResumeAssistantProposal(proposal.id);
            }
          }
        }
      }
    } catch {
      // MCP is optional; keep replay and manual overrides usable offline.
    }
    resumeAssistantPollTimer = setTimeout(() => void poll(), 1800);
  };
  void poll();
}

function isResumeAssistantProposal(
  value: unknown,
): value is ResumeAssistantProposal {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['sessionId'] === 'string' &&
    typeof value['createdAt'] === 'string' &&
    ['proposed', 'apply-requested', 'accepted', 'rejected'].includes(
      String(value['status']),
    ) &&
    typeof value['rationale'] === 'string' &&
    Array.isArray(value['overrides'])
  );
}

/** Applies only after the dashboard user confirms the proposed data. */
export function approveResumeAssistantProposal(proposalId: string): void {
  const proposal = resumeAssistantProposals().find(
    (item) => item.id === proposalId,
  );
  const recording = session();
  if (!proposal || !recording || proposal.sessionId !== routeSessionId())
    return;
  const proposedOverrides: unknown[] = proposal.overrides.map((override) => ({
    ...override,
    frozen: true,
    assistedBy: 'ai' as const,
  }));
  if (!isDebugSessionResumeOverrideList(proposedOverrides)) {
    status.set('Proposition IA refusée : format de surcharge invalide.');
    return;
  }
  const validatedOverrides = proposedOverrides as ResumeOverride[];
  const issues = validateDebugSessionResumeOverrides(
    recording,
    validatedOverrides,
  );
  if (issues.length) {
    const issue = issues[0]!;
    status.set(
      issue.reason === 'missing-recorded-response'
        ? `Proposition IA refusée : aucune réponse enregistrée pour ${issue.call}.`
        : `Proposition IA refusée : la forme de ${issue.call} ne correspond pas à l’archive.`,
    );
    void decideResumeAssistantProposal(proposal, 'rejected');
    return;
  }
  const existing = resumeProfile()?.acceptedOverrides ?? [];
  const byCall = new Map(existing.map((override) => [override.call, override]));
  for (const override of validatedOverrides)
    byCall.set(override.call, override);
  resumeProfile.set({
    format: 'craft-debug-session-resume-profile',
    version: 1,
    clockPolicy: resumeClockPolicy(),
    acceptedOverrides: [...byCall.values()],
  });
  const held = resumeHeldCall();
  const heldOverride = held
    ? validatedOverrides.find((override) => override.call === held.call)
    : undefined;
  if (held && heldOverride)
    decideHeldResumeCall('override', heldOverride);
  void decideResumeAssistantProposal(proposal, 'accepted');
  status.set(
    'Surcharge IA approuvée en mémoire. Utilise « Enregistrer le profil » pour la figer.',
  );
}

export function rejectResumeAssistantProposal(proposalId: string): void {
  const proposal = resumeAssistantProposals().find(
    (item) => item.id === proposalId,
  );
  if (proposal) void decideResumeAssistantProposal(proposal, 'rejected');
}

async function decideResumeAssistantProposal(
  proposal: ResumeAssistantProposal,
  decision: 'accepted' | 'rejected',
): Promise<void> {
  const response = await fetch(
    `${SESSION_ARCHIVE_URL}/sessions/${encodeURIComponent(proposal.sessionId)}/resume-assistant/proposals/${encodeURIComponent(proposal.id)}/decision`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    },
  ).catch(() => undefined);
  if (response?.ok) pollResumeAssistantProposals(proposal.sessionId);
}

function isResumeDescription(
  value: unknown,
): value is DebugSessionResumeDescription {
  if (
    !isRecord(value) ||
    value['format'] !== 'craft-debug-session-resume-description' ||
    value['version'] !== 1
  )
    return false;
  const graph = value['graph'];
  return (
    isRecord(graph) &&
    graph['format'] === 'craft-resume-graph' &&
    Array.isArray(graph['nodes']) &&
    Array.isArray(graph['edges']) &&
    isRecord(value['declarations']) &&
    Array.isArray(value['personas'])
  );
}

/** Requests live declarations from every app frame and computes per-tab plans. */
export function planResumeAtReplay(
  targetSequence?: number,
  targetParticipantId?: string,
): void {
  clearPendingResumeRequests();
  currentResumePlan = undefined;
  currentResumeArchive = undefined;
  currentResumeParticipantId = undefined;
  resumePlan.set(undefined);
  resumeAssistantProposals.set([]);
  resumePreflight.set(undefined);
  resumeExecution.set(undefined);
  const participantIds = resumeParticipantIds();
  const next = replayableEvents()[replayIndex()];
  const selectedEvent =
    targetSequence === undefined
      ? next
      : targetParticipantId
        ? sessionForParticipant(targetParticipantId)?.events.find(
            (event) => event.sequence === targetSequence,
          )
        : undefined;
  const target = parseLocalTarget(targetUrl().trim());
  if (replayParticipantIds().length !== participantIds.length) {
    status.set(
      'Pour préparer la reprise complète, affiche et connecte tous les onglets participants du replay.',
    );
    return;
  }
  if (
    participantIds.length === 0 ||
    !target.ok ||
    participantIds.some(
      (participantId) =>
        !sessionForParticipant(participantId) ||
        !frameConnections.has(participantId) ||
        !frameHasWindow(participantId),
    )
  ) {
    status.set(
      'Impossible de préparer la reprise : chaque onglet archivé doit avoir une application locale connectée.',
    );
    return;
  }
  const targetElapsedMs = selectedEvent
    ? (selectedEvent.globalElapsedMs ?? selectedEvent.elapsedMs ?? 0)
    : Math.max(
        0,
        ...participantIds.flatMap(
          (participantId) =>
            sessionForParticipant(participantId)?.events.map(
              (event) => event.globalElapsedMs ?? event.elapsedMs ?? 0,
            ) ?? [],
        ),
      );
  const batch = currentResumePlanBatch = {
    participantIds,
    targetElapsedMs,
    failures: new Map(),
  };
  const preferredParticipant = activeReplayParticipantId();
  currentResumeParticipantId =
    (targetParticipantId && participantIds.includes(targetParticipantId)
      ? targetParticipantId
      : selectedEvent?.participantId &&
          participantIds.includes(selectedEvent.participantId)
        ? selectedEvent.participantId
      : undefined) ??
    (preferredParticipant && participantIds.includes(preferredParticipant)
      ? preferredParticipant
      : participantIds[0]);
  currentResumeArchive = currentResumeParticipantId
    ? sessionForParticipant(currentResumeParticipantId)
    : undefined;
  // Participants that start later in the recorded timeline are normally
  // kept behind a placeholder until playback reaches their offset. A resume
  // plan needs every app bridge now, so materialize all archived tabs before
  // asking them for their declarations.
  launchDueReplayParticipants(Number.MAX_SAFE_INTEGER);
  status.set('Connexion des onglets archivés avant la préparation…');
  void waitForResumeFrames(participantIds).then((ready) => {
    if (currentResumePlanBatch !== batch) return;
    if (!ready) {
      for (const participantId of participantIds) {
        if (frameConnections.get(participantId)?.connected) continue;
        batch.failures.set(
          participantId,
          'Le pont de l’application ne s’est pas connecté pour la reprise.',
        );
      }
      finishResumePlanBatchIfReady();
      return;
    }
    requestResumeDescriptions(participantIds, targetElapsedMs, target.url.origin);
  });
}

function waitForResumeFrames(participantIds: readonly string[]): Promise<boolean> {
  const deadline = Date.now() + 12_000;
  return new Promise((resolve) => {
    const check = (): void => {
      if (
        participantIds.every(
          (participantId) =>
            frameConnections.get(participantId)?.connected === true,
        )
      ) {
        resolve(true);
        return;
      }
      if (
        Date.now() >= deadline ||
        participantIds.some(
          (participantId) =>
            frameConnections.get(participantId)?.status === 'error' &&
            !frameConnections.get(participantId)?.connected,
        )
      ) {
        resolve(false);
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

function requestResumeDescriptions(
  participantIds: readonly string[],
  targetElapsedMs: number,
  origin: string,
): void {
  status.set('Lecture des déclarations de reprise de tous les onglets…');
  for (const participantId of participantIds) {
    const archive = sessionForParticipant(participantId)!;
    const requestId = newUuid();
    pendingResumePlans.set(requestId, {
      participantId,
      archive,
      targetElapsedMs,
    });
    const sent = postToFrame(
      participantId,
      { channel: REPLAY_CHANNEL, type: 'resume-describe', requestId },
      origin,
    );
    if (!sent) {
      pendingResumePlans.delete(requestId);
      currentResumePlanBatch?.failures.set(
        participantId,
        'Impossible de joindre le pont de reprise.',
      );
      continue;
    }
    let retries = 0;
    const retry = (): void => {
      if (!pendingResumePlans.has(requestId) || retries >= 8) return;
      const timer = setTimeout(() => {
        resumePlanRetryTimers.delete(requestId);
        if (!pendingResumePlans.has(requestId)) return;
        retries += 1;
        postToFrame(
          participantId,
          { channel: REPLAY_CHANNEL, type: 'resume-describe', requestId },
          origin,
        );
        retry();
      }, 300);
      resumePlanRetryTimers.set(requestId, timer);
    };
    retry();
    resumePlanTimeouts.set(
      requestId,
      setTimeout(() => {
        if (!pendingResumePlans.delete(requestId)) return;
        resumePlanTimeouts.delete(requestId);
        const retryTimer = resumePlanRetryTimers.get(requestId);
        if (retryTimer) clearTimeout(retryTimer);
        resumePlanRetryTimers.delete(requestId);
        currentResumePlanBatch?.failures.set(
          participantId,
          'Le pont de l’application n’a pas répondu.',
        );
        finishResumePlanBatchIfReady();
      }, 8_000),
    );
  }
  finishResumePlanBatchIfReady();
}

function finishResumePlanBatchIfReady(): void {
  const batch = currentResumePlanBatch;
  if (!batch) return;
  const pendingParticipants = new Set(
    [...pendingResumePlans.values()].map(({ participantId }) => participantId),
  );
  if (
    batch.participantIds.some(
      (participantId) =>
        pendingParticipants.has(participantId) &&
        !batch.failures.has(participantId),
    )
  )
    return;
  const plans = batch.participantIds.flatMap((participantId) => {
    const result = currentResumePlans.get(participantId);
    return result ? [{ participantId, plan: result.plan }] : [];
  });
  const combined = combineDebugSessionResumePlans({
    participantIds: batch.participantIds,
    targetElapsedMs: batch.targetElapsedMs,
    clockPolicy: resumeClockPolicy(),
    plans,
    failures: Array.from(batch.failures, ([participantId, message]) => ({
      participantId,
      message,
    })),
  });
  currentResumePlan = combined;
  resumePlan.set(combined);
  const leader = currentResumeParticipantId ?? batch.participantIds[0];
  currentResumeArchive = leader ? sessionForParticipant(leader) : undefined;
  publishResumeAssistantContext('prepare', combined.problems);
  status.set(
    `Plans de reprise ${combined.status === 'ready' ? 'prêts' : 'refusés'} · ${plans.length}/${batch.participantIds.length} onglets · ${combined.steps.length} étape(s).`,
  );
}

/** Called only after replay-bridge has checked the exact frame and origin. */
export function acceptResumeDescription(
  participantId: string,
  requestId: string,
  value: unknown,
): void {
  const pending = pendingResumePlans.get(requestId);
  if (!pending || pending.participantId !== participantId) return;
  pendingResumePlans.delete(requestId);
  const retryTimer = resumePlanRetryTimers.get(requestId);
  if (retryTimer) clearTimeout(retryTimer);
  resumePlanRetryTimers.delete(requestId);
  const timeout = resumePlanTimeouts.get(requestId);
  if (timeout) clearTimeout(timeout);
  resumePlanTimeouts.delete(requestId);
  if (!isResumeDescription(value)) {
    currentResumePlanBatch?.failures.set(
      participantId,
      'La description de reprise est invalide.',
    );
    finishResumePlanBatchIfReady();
    return;
  }
  const plan = buildDebugSessionResumePlan({
    archive: pending.archive,
    targetElapsedMs: pending.targetElapsedMs,
    graph: value.graph,
    declarations: planningDeclarationsOf(value.declarations),
    personas: value.personas,
    ...(value.expectations ? { expectations: value.expectations } : {}),
    sourceHashes: archivedResumeSourceHashes(
      pending.archive,
      pending.targetElapsedMs,
      value,
    ),
    clockPolicy: resumeClockPolicy(),
  });
  currentResumePlans.set(participantId, { plan, archive: pending.archive });
  finishResumePlanBatchIfReady();
}

function archivedResumeSourceHashes(
  archive: NonNullable<ReturnType<typeof sessionForParticipant>>,
  targetElapsedMs: number,
  description: DebugSessionResumeDescription,
): Readonly<Record<string, string>> | undefined {
  const event = [...archive.events]
    .filter(
      (candidate) =>
        candidate.kind === 'snapshot' &&
        candidate.name === 'resume-source-hashes' &&
        (candidate.globalElapsedMs ?? candidate.elapsedMs ?? 0) <=
          targetElapsedMs,
    )
    .at(-1);
  if (!isRecord(event?.payload) || event.payload['version'] !== 1) return;
  const records = Array.isArray(event.payload['records'])
    ? event.payload['records'].filter(isResumeSourceHashRecord)
    : [];
  const hashes: Record<string, string> = {};
  for (const [address] of Object.entries(description.declarations)) {
    const node = description.graph.nodes.find(
      (candidate) => candidate.id === address,
    );
    const resume = node?.details?.['resume'];
    if (!node || !isRecord(resume)) continue;
    const matches = records.filter(
      (record) =>
        record.label === node.label &&
        record.resource === resume['resource'] &&
        record.role === resume['role'] &&
        record.path === resume['path'] &&
        record.persona === resume['persona'],
    );
    if (matches.length === 1) hashes[address] = matches[0]!.hash;
  }
  return Object.keys(hashes).length > 0 ? hashes : undefined;
}

function isResumeSourceHashRecord(
  value: unknown,
): value is DebugSessionResumeSourceHashRecord {
  return (
    isRecord(value) &&
    typeof value['label'] === 'string' &&
    typeof value['resource'] === 'string' &&
    typeof value['role'] === 'string' &&
    typeof value['hash'] === 'string' &&
    (value['path'] === undefined || typeof value['path'] === 'string') &&
    (value['persona'] === undefined || typeof value['persona'] === 'string')
  );
}

export function plannedResume(): DebugSessionResumePlan | undefined {
  return currentResumePlan;
}

/** Runs the app-configured, read-only backend checks for the current plan. */
export function preflightResumeAtReplay(): void {
  if (
    !currentResumePlan ||
    !currentResumeArchive ||
    !currentResumeParticipantId
  ) {
    status.set('Prépare d’abord un plan de reprise avant le pré-vol.');
    return;
  }
  const participantId = currentResumeParticipantId;
  const connection = frameConnections.get(participantId);
  const target = parseLocalTarget(targetUrl().trim());
  if (!connection || !target.ok || !frameHasWindow(participantId)) {
    status.set('Impossible de joindre l’application pour le pré-vol.');
    return;
  }
  const requestId = newUuid();
  const manifest = buildDebugSessionResumeManifest(
    currentResumePlan,
    session() ?? currentResumeArchive,
  );
  pendingResumePreflights.set(requestId, participantId);
  resumePreflight.set(undefined);
  if (
    !postToFrame(
      participantId,
      {
        channel: REPLAY_CHANNEL,
        type: 'resume-preflight',
        requestId,
        manifest,
      },
      target.url.origin,
    )
  ) {
    pendingResumePreflights.delete(requestId);
    status.set('Impossible d’envoyer le pré-vol à l’application.');
    return;
  }
  status.set('Pré-vol read-only en cours dans l’application…');
  resumePreflightTimeouts.set(
    requestId,
    setTimeout(() => {
      if (!pendingResumePreflights.delete(requestId)) return;
      resumePreflightTimeouts.delete(requestId);
      status.set('Le backend n’a pas répondu au pré-vol read-only.');
    }, 10_000),
  );
}

/** Called after replay-bridge validates the frame window and exact origin. */
export function acceptResumePreflight(
  participantId: string,
  requestId: string,
  value: unknown,
): void {
  if (pendingResumePreflights.get(requestId) !== participantId) return;
  pendingResumePreflights.delete(requestId);
  const timeout = resumePreflightTimeouts.get(requestId);
  if (timeout) clearTimeout(timeout);
  resumePreflightTimeouts.delete(requestId);
  if (
    !isRecord(value) ||
    (value['status'] !== 'passed' && value['status'] !== 'failed') ||
    !Array.isArray(value['checked']) ||
    !Array.isArray(value['missing'])
  ) {
    status.set('L’application a envoyé un résultat de pré-vol invalide.');
    return;
  }
  const result: ResumePreflightDisplay = {
    status: value['status'],
    checked: value['checked'].filter(isPreflightFact),
    missing: value['missing'].filter(isPreflightFact),
    ...(typeof value['error'] === 'string' ? { error: value['error'] } : {}),
  };
  resumePreflight.set(result);
  publishResumeAssistantContext('prepare', result.missing);
  status.set(
    result.status === 'passed'
      ? `Pré-vol réussi · ${result.checked.length} fait(s) vérifié(s).`
      : `Pré-vol refusé · ${result.missing.length} fait(s) requis manquant(s).${result.error ? ` ${result.error}` : ''}`,
  );
}

function isPreflightFact(
  value: unknown,
): value is ResumePreflightDisplay['checked'][number] {
  return (
    isRecord(value) &&
    typeof value['kind'] === 'string' &&
    typeof value['name'] === 'string' &&
    (value['detail'] === undefined || typeof value['detail'] === 'string')
  );
}

/** Exports the redacted, read-only staging checklist for the current plan. */
export function exportResumeManifest(): void {
  if (!currentResumePlan || !currentResumeArchive) {
    status.set(
      'Prépare d’abord un plan de reprise avant d’exporter le pré-vol.',
    );
    return;
  }
  const manifest = buildDebugSessionResumeManifest(
    currentResumePlan,
    session() ?? currentResumeArchive,
  );
  saveTextFile(
    'craft-resume-manifest.json',
    'application/json',
    JSON.stringify(manifest, null, 2),
  );
  saveTextFile(
    'craft-resume-checklist.md',
    'text/markdown',
    manifest.checklistMarkdown,
  );
  status.set('Manifeste JSON et checklist Markdown exportés.');
}

/**
 * Debug launches: the app opened in its own tab, live, from the state a
 * recording had at one point. The tab asks this window for its snapshot once
 * it has loaded (`snapshot-request`) and holds its bootstrap until it arrives.
 */
type DebugLaunch = Readonly<{
  tab: Window;
  origin: string;
  snapshot: DebugAppSnapshot;
  participantId: string;
  resumePlan?: DebugSessionResumePlan;
  resumeManifest?: DebugSessionResumeManifest;
  resumeOverrides?: readonly ResumeOverride[];
  resumeGroupId?: string;
  resumeLeader?: boolean;
  deferResume?: boolean;
}>;

type ResumeLaunchGroup = {
  leaderLaunchId?: string;
  readonly childLaunchIds: string[];
};

const launches = new Map<string, DebugLaunch>();
/** Completed resumes whose declared outcomes are still being observed. */
const resumeOutcomeOrigins = new Map<string, DebugLaunch>();
const resumeLaunchGroups = new Map<string, ResumeLaunchGroup>();
const sharedResumeResources = new Map<string, unknown>();
let listening = false;

function listenToDebugTabs(): void {
  if (listening) return;
  listening = true;
  onWindowMessage((message) => {
    const data = message.data;
    if (!isRecord(data) || data['channel'] !== REPLAY_CHANNEL) return;
    const launchId = data['launchId'];
    if (typeof launchId !== 'string') return;
    const launch =
      launches.get(launchId) ??
      (data['type'] === 'resume-outcome'
        ? resumeOutcomeOrigins.get(launchId)
        : undefined);
    if (
      !launch ||
      message.source !== launch.tab ||
      message.origin !== launch.origin
    )
      return;
    switch (data['type']) {
      case 'resume-outcome': {
        if (typeof data['id'] !== 'string' || !isResumeStepStatus(data['status']))
          return;
        const report = resumeExecution();
        if (!report) return;
        const step = {
          id: `${launch.participantId} · ${data['id']}`,
          status: data['status'],
          ...(typeof data['detail'] === 'string' ? { detail: data['detail'] } : {}),
        };
        const steps = [...report.steps, step];
        const classOrder = ['real', 'assisted', 'partially-simulated', 'refused'] as const;
        const stepClass = classifyResumeFidelity([step]);
        const classification =
          classOrder.indexOf(stepClass) >
          classOrder.indexOf(report.classification ?? 'real')
            ? stepClass
            : (report.classification ?? 'real');
        resumeExecution.set({
          ...report,
          classification,
          steps,
          ...(step.status === 'blocked'
            ? { blocked: [...report.blocked, step.id] }
            : {}),
          ...(step.status === 'drifted' || step.status === 'skipped'
            ? {
                warnings: [
                  ...(report.warnings ?? []),
                  `${step.id} · ${step.detail ?? step.status}`,
                ],
              }
            : {}),
        });
        status.set(`Résultat observé · ${step.id} · ${step.detail ?? step.status}`);
        return;
      }
      case 'snapshot-request':
        launch.tab.postMessage(
          {
            channel: REPLAY_CHANNEL,
            type: 'restore-app-snapshot',
            launchId,
            snapshot: launch.snapshot,
            ...(launch.resumePlan
              ? {
                  deferResume: launch.deferResume ?? false,
                  resumeResources: debugSessionResumeResourcesRecord(
                    sharedResumeResources,
                  ),
                }
              : {}),
            ...(launch.resumePlan
              ? {
                  resumePlan: launch.resumePlan,
                  resumeManifest: launch.resumeManifest,
                  resumeOverrides: launch.resumeOverrides ?? [],
                }
              : {}),
          },
          launch.origin,
        );
        return;
      case 'resume-resource': {
        if (!launch.resumePlan) return;
        const resource = normalizeDebugSessionResumeResource(data);
        if (!resource) return;
        sharedResumeResources.set(resource.resource, resource.value);
        for (const [otherLaunchId, otherLaunch] of launches) {
          if (otherLaunchId === launchId || !otherLaunch.resumePlan) continue;
          try {
            otherLaunch.tab.postMessage(
              {
                channel: REPLAY_CHANNEL,
                type: 'resume-resource',
                launchId: otherLaunchId,
                ...resource,
              },
              otherLaunch.origin,
            );
          } catch {
            // A tab may have closed while the leader was acquiring a resource.
          }
        }
        return;
      }
      case 'snapshot-restored': {
        // Work to relaunch reports back once the app has done it.
        if (!launch.snapshot.inFlight && !launch.resumePlan)
          launches.delete(launchId);
        const warnings = Array.isArray(data['warnings'])
          ? data['warnings'].filter((entry) => typeof entry === 'string')
          : [];
        status.set(
          [
            'Application lancée en mode debug à l’état choisi.',
            ...(launch.resumePlan
              ? [
                  launch.deferResume
                    ? 'Application restaurée · en attente des acquisitions de tête…'
                    : 'Exécution guidée démarrée…',
                ]
              : launch.snapshot.inFlight
                ? ['Relance des opérations en cours…']
                : []),
            ...warnings,
          ].join(' '),
        );
        return;
      }
      case 'resume-started':
        resumeExecution.set({
          status: 'running',
          steps: launch.resumeLeader ? [] : (resumeExecution()?.steps ?? []),
          blocked: launch.resumeLeader
            ? []
            : (resumeExecution()?.blocked ?? []),
        });
        resumeHeldCall.set(undefined);
        status.set(
          `Reprise guidée · ${String(data['total'] ?? 0)} étape(s) prévues…`,
        );
        return;
      case 'resume-hold':
        if (
          typeof data['holdId'] === 'string' &&
          typeof data['call'] === 'string'
        ) {
          resumeHeldCall.set({
            holdId: data['holdId'],
            launchId,
            call: data['call'],
          });
          publishResumeAssistantContext('execute', [
            { kind: 'held-call', participantId: launch.participantId, call: data['call'] },
          ]);
          status.set(`Appel retenu en attente de décision · ${data['call']}.`);
        }
        return;
      case 'resume-step':
        if (typeof data['id'] === 'string' && isResumeStepStatus(data['status'])) {
          const previous = resumeExecution();
          resumeExecution.set({
            status: 'running',
            steps: [
              ...(previous?.steps ?? []),
              {
                id: `${launch.participantId} · ${data['id']}`,
                status: data['status'],
                ...(typeof data['detail'] === 'string'
                  ? { detail: data['detail'] }
                  : {}),
              },
            ],
            blocked: previous?.blocked ?? [],
          });
        }
        status.set(
          `Reprise ${launch.participantId} · ${String(data['index'] ?? 0)}/${String(data['total'] ?? '')} · ${String(data['status'] ?? 'en cours')} · ${String(data['id'] ?? 'étape')}`,
        );
        return;
      case 'resume-completed': {
        launches.delete(launchId);
        resumeOutcomeOrigins.delete(launchId);
        resumeHeldCall.set(undefined);
        const classification = String(data['classification'] ?? 'refused');
        const steps = Array.isArray(data['steps']) ? data['steps'] : [];
        const blocked = Array.isArray(data['blocked']) ? data['blocked'] : [];
        const allowedClassifications = [
          'real',
          'assisted',
          'partially-simulated',
          'refused',
        ] as const;
        const safeClassification =
          allowedClassifications.find((item) => item === classification) ??
          'refused';
        const safeSteps = steps.flatMap(
          (
            step,
          ): {
            id: string;
            status: ResumeStepStatus;
            detail?: string;
          }[] =>
            isRecord(step) &&
            typeof step['id'] === 'string' &&
            isResumeStepStatus(step['status'])
              ? [
                  {
                    id: `${launch.participantId} · ${step['id']}`,
                    status: step['status'],
                    ...(typeof step['detail'] === 'string'
                      ? { detail: step['detail'] }
                      : {}),
                  },
                ]
              : [],
        );
        const safeBlocked = blocked
          .filter((item): item is string => typeof item === 'string')
          .map((item) => `${launch.participantId} · ${item}`);
        const safeOverrides: {
          participantId: string;
          call: string;
          assistedBy?: 'human' | 'ai';
        }[] = Array.isArray(data['overrides'])
          ? data['overrides'].flatMap((item) =>
              isRecord(item) && typeof item['call'] === 'string'
                ? [
                    {
                      participantId: launch.participantId,
                      call: item['call'],
                      ...(item['assistedBy'] === 'ai' ||
                      item['assistedBy'] === 'human'
                        ? {
                            assistedBy: item['assistedBy'] as
                              | 'human'
                              | 'ai',
                          }
                        : {}),
                    },
                  ]
                : [],
            )
          : [];
        const previousReport = launch.resumeLeader
          ? undefined
          : resumeExecution();
        const classifications = [
          previousReport?.classification,
          safeClassification,
        ].filter(
          (item): item is NonNullable<typeof item> => item !== undefined,
        );
        const classOrder = [
          'real',
          'assisted',
          'partially-simulated',
          'refused',
        ] as const;
        const combinedClassification = classifications.reduce(
          (leastReal, candidate) =>
            classOrder.indexOf(candidate) > classOrder.indexOf(leastReal)
              ? candidate
              : leastReal,
          'real' as (typeof classOrder)[number],
        );
        const currentParticipantPrefix = `${launch.participantId} · `;
        const previousSteps = (previousReport?.steps ?? []).filter(
          (step) => !step.id.startsWith(currentParticipantPrefix),
        );
        const previousOverrides = (previousReport?.overrides ?? []).filter(
          (override) => override.participantId !== launch.participantId,
        );
        const safeWarnings = (
          Array.isArray(data['warnings']) ? data['warnings'] : []
        )
          .filter((item): item is string => typeof item === 'string')
          .map((item) => `${launch.participantId} · ${item}`);
        resumeExecution.set({
          status: 'completed',
          classification: combinedClassification,
          steps: [...previousSteps, ...safeSteps],
          overrides: [...previousOverrides, ...safeOverrides],
          blocked: [...(previousReport?.blocked ?? []), ...safeBlocked],
          warnings: [
            ...(previousReport?.warnings ?? []).filter(
              (warning) => !warning.startsWith(currentParticipantPrefix),
            ),
            ...safeWarnings,
          ],
        });
        publishResumeAssistantContext('execute', safeBlocked);
        updateResumeLaunchGroup(
          launch,
          launchId,
          safeClassification !== 'refused',
        );
        status.set(
          `Reprise ${launch.participantId} terminée · fidélité ${RESUME_FIDELITY_LABELS[safeClassification]} · ${safeSteps.length} étape(s) · ${safeBlocked.length} blocage(s).`,
        );
        // Declared outcomes are still compared after the user takes over.
        resumeOutcomeOrigins.set(launchId, launch);
        return;
      }
      case 'resume-error':
        launches.delete(launchId);
        resumeHeldCall.set(undefined);
        updateResumeLaunchGroup(launch, launchId, false);
        resumeExecution.set({
          status: 'completed',
          classification: 'refused',
          steps: (launch.resumeLeader ? [] : resumeExecution()?.steps) ?? [],
          blocked: [
            ...(launch.resumeLeader ? [] : (resumeExecution()?.blocked ?? [])),
            `${launch.participantId} · ${String(data['message'])}`,
          ],
        });
        publishResumeAssistantContext('execute', [String(data['message'])]);
        status.set(`La reprise guidée a échoué : ${String(data['message'])}`);
        return;
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
        updateResumeLaunchGroup(launch, launchId, false);
        status.set(
          `Le lancement en mode debug a échoué : ${String(data['message'])}`,
        );
        return;
    }
  });
}

function isResumeStepStatus(value: unknown): value is ResumeStepStatus {
  return RESUME_STEP_STATUSES.includes(value as ResumeStepStatus);
}

function updateResumeLaunchGroup(
  launch: DebugLaunch,
  launchId: string,
  participantSucceeded: boolean,
): void {
  const groupId = launch.resumeGroupId;
  if (!groupId) return;
  const group = resumeLaunchGroups.get(groupId);
  if (!group) return;
  if (!participantSucceeded) {
    const firstAbortedIndex = launch.resumeLeader
      ? 0
      : Math.max(0, group.childLaunchIds.indexOf(launchId) + 1);
    for (const childLaunchId of group.childLaunchIds.slice(firstAbortedIndex))
      postResumeGroupMessage(childLaunchId, 'resume-abort');
    resumeLaunchGroups.delete(groupId);
    return;
  }
  const nextChildIndex = launch.resumeLeader
    ? 0
    : group.childLaunchIds.indexOf(launchId) + 1;
  const nextChildId = group.childLaunchIds[nextChildIndex];
  if (!nextChildId) {
    resumeLaunchGroups.delete(groupId);
    return;
  }
  postResumeGroupMessage(nextChildId, 'resume-start');
}

function postResumeGroupMessage(
  launchId: string,
  type: 'resume-start' | 'resume-abort',
): void {
  const child = launches.get(launchId);
  if (!child) return;
  try {
    child.tab.postMessage(
      { channel: REPLAY_CHANNEL, type, launchId },
      child.origin,
    );
  } catch {
    // Closing a participant tab must not interrupt the others.
  }
}

/** Plans a resume immediately before a selected journal event. */
export function planResumeBeforeEvent(
  sequence: number,
  participantId: string,
): void {
  planResumeAtReplay(sequence, participantId);
}

/**
 * Starts the app in debug mode, in a new tab, from the state it had just
 * before the event with this sequence — or at the end of the recording when
 * omitted. `participantId` picks which tab of a multi-tab recording.
 */
export function launchDebugApp(
  beforeSequence?: number,
  participantId?: string,
  resume?: Readonly<{
    plan: DebugSessionResumePlan;
    manifest: DebugSessionResumeManifest;
    overrides?: readonly ResumeOverride[];
    groupId?: string;
    leader?: boolean;
    defer?: boolean;
  }>,
  preopenedTab?: Window,
): string | undefined {
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
  const tab = preopenedTab ?? openLinkedTab(url.href);
  if (!tab) {
    status.set(
      'Le navigateur a bloqué l’ouverture de l’onglet de debug. Autorise les fenêtres surgissantes pour ce dashboard.',
    );
    return;
  }
  if (preopenedTab) {
    try {
      preopenedTab.location.href = url.href;
    } catch {
      preopenedTab.close();
      status.set('Impossible de naviguer vers l’application de reprise.');
      return;
    }
  }
  launches.set(launchId, {
    tab,
    origin: target.url.origin,
    snapshot,
    participantId: owner,
    ...(resume
      ? { resumePlan: resume.plan, resumeManifest: resume.manifest }
      : {}),
    ...(resume ? { resumeOverrides: resume.overrides ?? [] } : {}),
    ...(resume?.groupId ? { resumeGroupId: resume.groupId } : {}),
    ...(resume ? { resumeLeader: resume.leader ?? false } : {}),
    ...(resume ? { deferResume: resume.defer ?? false } : {}),
  });
  status.set(`Ouverture de l’application sur ${snapshot.route}…`);
  return launchId;
}

/** Opens a new app tab only after planning and the read-only preflight pass. */
export function launchResumeAtReplay(): void {
  const preflight = resumePreflight();
  const participantIds = resumeParticipantIds();
  if (
    !currentResumePlan ||
    currentResumePlan.status !== 'ready' ||
    !currentResumeArchive ||
    !currentResumeParticipantId ||
    !participantIds.every((participantId) =>
      currentResumePlans.has(participantId),
    ) ||
    preflight?.status !== 'passed'
  ) {
    status.set(
      'Prépare un plan prêt et réussis le pré-vol avant de lancer la reprise.',
    );
    return;
  }
  const acceptedOverrides = resumeProfile()?.acceptedOverrides ?? [];
  const overrideIssues = validateDebugSessionResumeOverrides(
    session() ?? currentResumeArchive,
    acceptedOverrides,
  );
  if (overrideIssues.length) {
    const issue = overrideIssues[0]!;
    status.set(
      issue.reason === 'missing-recorded-response'
        ? `Surcharge refusée : aucun schéma de réponse JSON exploitable pour ${issue.call}.`
        : `Surcharge refusée : la réponse de ${issue.call} ne respecte pas la forme enregistrée.`,
    );
    return;
  }
  const target = parseLocalTarget(targetUrl().trim());
  if (!target.ok) {
    status.set(target.error);
    return;
  }
  const orderedParticipants = [
    currentResumeParticipantId,
    ...participantIds.filter((id) => id !== currentResumeParticipantId),
  ];
  const targetElapsedMs = currentResumePlan.targetElapsedMs;
  const openedTabs: { participantId: string; tab: Window }[] = [];
  for (const participantId of orderedParticipants) {
    const tab = openLinkedTab('about:blank');
    if (!tab) {
      for (const opened of openedTabs) opened.tab.close();
      status.set(
        'Le navigateur doit autoriser une fenêtre par onglet archivé pour reprendre la session complète.',
      );
      return;
    }
    openedTabs.push({ participantId, tab });
  }

  sharedResumeResources.clear();
  const sharedSubstitutions = [
    ...new Map(
      [...currentResumePlans.values()]
        .flatMap(({ plan }) => plan.substitutions)
        .map((item) => [`${item.resource}:${item.fingerprint}`, item] as const),
    ).values(),
  ];
  const groupId = newUuid();
  const group: ResumeLaunchGroup = { childLaunchIds: [] };
  resumeLaunchGroups.set(groupId, group);
  for (const { participantId, tab } of openedTabs) {
    const participantPlan = currentResumePlans.get(participantId);
    if (!participantPlan) {
      tab.close();
      continue;
    }
    const beforeSequence = participantPlan.archive.events.find(
      (event) =>
        (event.globalElapsedMs ?? event.elapsedMs ?? 0) >= targetElapsedMs,
    )?.sequence;
    // Origin storage is shared by the tabs: a tab may restore a value that
    // another tab recorded, so every tab knows every placeholder.
    const plan = {
      ...participantPlan.plan,
      substitutions: sharedSubstitutions,
    };
    const launchId = launchDebugApp(
      beforeSequence,
      participantId,
      {
        plan,
        manifest: buildDebugSessionResumeManifest(
          plan,
          participantPlan.archive,
        ),
        overrides: acceptedOverrides,
        groupId,
        leader: participantId === currentResumeParticipantId,
        defer: participantId !== currentResumeParticipantId,
      },
      tab,
    );
    if (!launchId) {
      for (const opened of openedTabs) opened.tab.close();
      for (const childLaunchId of group.childLaunchIds)
        launches.delete(childLaunchId);
      if (group.leaderLaunchId) launches.delete(group.leaderLaunchId);
      resumeLaunchGroups.delete(groupId);
      return;
    }
    if (participantId === currentResumeParticipantId)
      group.leaderLaunchId = launchId;
    else group.childLaunchIds.push(launchId);
  }
  status.set(
    `Reprise ouverte dans ${openedTabs.length} onglet(s) · l’onglet de tête acquiert les ressources avant les suivants.`,
  );
}

/** Approves or refuses one outbound call held by the resume barrier. */
export function decideHeldResumeCall(
  decision: 'live' | 'abort' | 'override',
  override?: ResumeOverride,
): void {
  const held = resumeHeldCall();
  if (!held) return;
  if (decision === 'override' && (!override || override.call !== held.call))
    return;
  const launch = launches.get(held.launchId);
  if (launch) {
    launch.tab.postMessage(
      {
        channel: REPLAY_CHANNEL,
        type: 'resume-hold-decision',
        launchId: held.launchId,
        holdId: held.holdId,
        decision,
        ...(decision === 'override' && override ? { override } : {}),
      },
      launch.origin,
    );
    resumeHeldCall.set(undefined);
    status.set(
      decision === 'live'
        ? `Appel autorisé · ${held.call}.`
        : decision === 'override'
          ? `Appel retenu servi par une surcharge approuvée · ${held.call}.`
          : `Appel refusé · ${held.call}.`,
    );
    return;
  }
  resumeHeldCall.set(undefined);
  status.set('La reprise qui détenait cet appel n’est plus connectée.');
}

/**
 * The state the replay is at: just before the next action it will run, or the
 * end of the recording once it has run them all.
 */
export function launchDebugAppAtReplay(): void {
  const next = replayableEvents()[replayIndex()];
  launchDebugApp(
    next?.sequence,
    next?.participantId ?? activeReplayParticipantId(),
  );
}
