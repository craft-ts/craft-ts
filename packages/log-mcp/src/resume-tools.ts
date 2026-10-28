import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  resumePrerequisites,
  resumeRecordedCall,
  resumeStory,
  resumeTarget,
  type ResumeArchive,
} from '@craft-ts/session-trace';
import { exportResumeRecipeToPlaywright } from './resume-playwright-export.js';

type ResumeRequest = Readonly<{
  id: string;
  sessionId: string;
  participantId?: string;
  beforeSequence?: number;
  eventId?: string;
  note?: string;
  createdAt: string;
}>;

type ResumePoint = Readonly<{
  sessionId: string;
  beforeSequence?: number;
  participantId?: string;
  /** Set when the point comes from the dashboard's latest "resume here". */
  requestId?: string;
}>;

const pointSchema = {
  sessionId: z
    .string()
    .uuid()
    .optional()
    .describe('Archived session; the latest resume request when omitted'),
  beforeSequence: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('The point is just before this event; the end of the session when omitted'),
  participantId: z
    .string()
    .min(1)
    .optional()
    .describe('Keep one browser tab of a multi-tab session'),
};

/**
 * Read-only tools that tell the AI what the person did up to a point of a
 * recorded session, so it can bring the app it drives to the same place.
 */
export function registerResumeTools(server: McpServer): void {
  server.registerTool(
    'resume.request',
    {
      description:
        'Read the latest "resume here" left from the debug session dashboard: which session and which point the person wants to resume from, a summary of that session, and any failed recipe run that needs repair. Call it first when asked to resume a session; the session.* tools use it when no sessionId is given.',
      inputSchema: {
        sessionId: z.string().uuid().optional().describe('Only a request for this session'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ sessionId }) =>
      guarded(async () => {
        const request = await latestRequest(sessionId);
        if (!request) return { request: null, hint: NO_REQUEST_HINT };
        const archive = await fetchArchive(request.sessionId);
        const recipeQuery = new URLSearchParams({ sessionId: request.sessionId });
        if (request.beforeSequence !== undefined) recipeQuery.set('beforeSequence', String(request.beforeSequence));
        const recipeResponse = await fetch(`${logServerUrl()}/sessions/recipes?${recipeQuery}`);
        let repair: Readonly<Record<string, unknown>> | null = null;
        if (recipeResponse.ok) {
          const recipes = (await recipeResponse.json() as { recipes?: unknown }).recipes;
          const failed = Array.isArray(recipes) ? recipes.flatMap((value) => {
            if (!isRecord(value) || !Array.isArray(value['runs'])) return [];
            return value['runs'].flatMap((run) => {
              if (!isRecord(run) || run['status'] !== 'failed') return [];
              const events = Array.isArray(run['events']) ? run['events'] : [];
              const failure = [...events].reverse().find((event) => isRecord(event) && event['kind'] === 'failed');
              return [{ recipeId: value['id'], runId: run['id'], failedStep: run['currentStep'], startedAt: run['startedAt'], failure }];
            });
          }) : [];
          repair = failed.sort((left, right) => String(right['startedAt']).localeCompare(String(left['startedAt'])))[0] ?? null;
        }
        return {
          request,
          repair,
          session: {
            startUrl: archive.startUrl,
            events: archive.events.length,
            participants: archive.participants?.length ?? 0,
          },
          method: RESUME_METHOD,
        };
      }),
  );

  server.registerTool(
    'recipe.list',
    {
      description: 'List durable guided-resume recipes, optionally for one session and event, newest revision first.',
      inputSchema: {
        sessionId: z.string().uuid().optional(),
        beforeSequence: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ sessionId, beforeSequence }) => guarded(async () => {
      const query = new URLSearchParams({
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(beforeSequence === undefined ? {} : { beforeSequence: String(beforeSequence) }),
      });
      const response = await fetch(`${logServerUrl()}/sessions/recipes${query.size ? `?${query}` : ''}`);
      if (!response.ok) throw new Error(`Could not list recipes (HTTP ${response.status}).`);
      return (await response.json()) as unknown;
    }),
  );

  server.registerTool(
    'recipe.get',
    {
      description: 'Read one guided-resume recipe and the recorded runs for it.',
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ id }) => guarded(async () => {
      const base = logServerUrl();
      const [recipeResponse, runsResponse] = await Promise.all([
        fetch(`${base}/sessions/recipes/${encodeURIComponent(id)}`),
        fetch(`${base}/sessions/recipes/${encodeURIComponent(id)}/runs`),
      ]);
      if (!recipeResponse.ok) throw new Error(`Could not read recipe (HTTP ${recipeResponse.status}).`);
      if (!runsResponse.ok) throw new Error(`Could not read recipe runs (HTTP ${runsResponse.status}).`);
      return { ...(await recipeResponse.json() as Record<string, unknown>), ...(await runsResponse.json() as Record<string, unknown>) };
    }),
  );

  server.registerTool(
    'recipe.exportPlaywright',
    {
      description: 'Export a recipe as an exploratory Playwright TypeScript scaffold. Human handoffs, server operations, Craft expectations and checkpoints are marked as TODOs; no secret values are exported.',
      inputSchema: { id: z.string().uuid() },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ id }) => guarded(async () => {
      const response = await fetch(`${logServerUrl()}/sessions/recipes/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(`Could not read recipe (HTTP ${response.status}).`);
      const body = await response.json() as { recipe?: unknown };
      if (!body.recipe) throw new Error('Recipe not found.');
      return { recipeId: id, ...exportResumeRecipeToPlaywright(body.recipe) };
    }),
  );

  server.registerTool(
    'resume.say',
    {
      description:
        'Write in the resume thread the dashboard shows next to the replay: a step you take, a question, a hand-off (say the same as app.handoff), or done. Returns what the person answered there since your previous message. Keep it to one or two sentences.',
      inputSchema: {
        text: z.string().min(1).max(2_000),
        kind: z.enum(['step', 'question', 'handoff', 'done']).optional(),
        requestId: z.string().uuid().optional().describe('The latest resume request when omitted'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ text, kind, requestId }) =>
      guarded(async () => {
        const id = requestId ?? (await latestRequest())?.id;
        if (!id) throw new Error(NO_REQUEST_HINT);
        const before = await threadOf(id);
        const response = await fetch(`${logServerUrl()}/sessions/resume-requests/${id}/messages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ from: 'ai', text, ...(kind ? { kind } : {}) }),
        });
        if (!response.ok) throw new Error(`Could not write in the thread (HTTP ${response.status}).`);
        const { message } = (await response.json()) as { message: ResumeMessage };
        return { message, replies: repliesAfterLastAi(before) };
      }),
  );

  server.registerTool(
    'resume.replies',
    {
      description:
        'Read what the person wrote in the resume thread of the dashboard, after a message id (all of it when omitted).',
      inputSchema: {
        since: z.number().int().nonnegative().optional(),
        requestId: z.string().uuid().optional().describe('The latest resume request when omitted'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ since, requestId }) =>
      guarded(async () => {
        const id = requestId ?? (await latestRequest())?.id;
        if (!id) throw new Error(NO_REQUEST_HINT);
        const thread = await threadOf(id, since);
        return { requestId: id, replies: thread.filter((message) => message.from === 'person') };
      }),
  );

  server.registerTool(
    'session.story',
    {
      description:
        'Tell what the person did up to the resume point, step by step at a human level: interactions (with typed values), method invocations, server calls and their status, route changes and errors. Use it to reproduce the path in the live app.',
      inputSchema: {
        ...pointSchema,
        limit: z.number().int().positive().max(1_000).optional().describe('Most recent steps kept (200 by default)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ limit, ...input }) =>
      guarded(async () => {
        const { point, archive } = await load(input);
        return { point, ...resumeStory(archive, { ...pointOptions(point), ...(limit ? { limit } : {}) }) };
      }),
  );

  server.registerTool(
    'session.target',
    {
      description:
        'Describe the state the app should reach at the resume point: route, primitive values by address, browser storage keys, pending tasks and calls still in flight. Compare it with what app.diff reports on the live app.',
      inputSchema: pointSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) =>
      guarded(async () => {
        const { point, archive } = await load(input);
        return { point, ...resumeTarget(archive, pointOptions(point)) };
      }),
  );

  server.registerTool(
    'session.prerequisites',
    {
      description:
        'List what must hold before resuming: the identity and role the person used, whether they were signed in, the entities the point depends on (route parameters, ids in state) and the server writes already made. Credentials are never recorded: when an identity is needed, hand control back to the person for that field (session.signedInWhen is the app.handoff condition). `probes` are ready for checkpoint.save: a recorded read sent again with the live token, so the point fails when its session expires.',
      inputSchema: pointSchema,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (input) =>
      guarded(async () => {
        const { point, archive } = await load(input);
        return { point, ...resumePrerequisites(archive, pointOptions(point)) };
      }),
  );

  server.registerTool(
    'session.recordedCall',
    {
      description:
        'Return one recorded server call with its request and answer, by event sequence or by call name (the last occurrence unless `occurrence` is given, 0-based). Use it to compare with what the live server answers.',
      inputSchema: {
        sessionId: pointSchema.sessionId,
        sequence: z.number().int().nonnegative().optional(),
        call: z.string().min(1).optional().describe('Server function id or "METHOD /path"'),
        occurrence: z.number().int().nonnegative().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ sessionId, sequence, call, occurrence }) =>
      guarded(async () => {
        if (sequence === undefined && call === undefined)
          throw new Error('Give either `sequence` or `call`.');
        const { point, archive } = await load({ ...(sessionId ? { sessionId } : {}) });
        const recorded = resumeRecordedCall(archive, {
          ...(sequence === undefined ? {} : { sequence }),
          ...(call === undefined ? {} : { call }),
          ...(occurrence === undefined ? {} : { occurrence }),
        });
        if (!recorded) throw new Error('No recorded call matches.');
        return { sessionId: point.sessionId, ...recorded };
      }),
  );
}

/**
 * The steps a resume goes through, returned with the request: an AI that
 * only read the request still knows which tools come next. Hosts that defer
 * MCP tools must load them first: their absence from the first tool list
 * does not mean they are unavailable.
 */
export const RESUME_METHOD: readonly string[] = [
  'Les outils resume.doctor, app.*, checkpoint.*, recipe.* et page viennent du serveur MCP du registre ; resume.*, session.*, recipe.list/get et resume.request viennent de celui des logs. Si ton hôte diffère le chargement des outils MCP, charge-les avant de conclure qu’ils manquent.',
  'Commencer par resume.doctor. Lire ensuite sans agir : session.story jusqu’au point et les quelques étapes qui le suivent, session.prerequisites, checkpoint.list et recipe.list. Choisir le meilleur chemin pour cet événement, sans encore le restaurer ni l’exécuter.',
  'Avant toute action dans l’app, faire l’entretien d’objectif en un message avec des réponses proposées depuis l’enregistrement : ce que la personne veut observer, ce qui doit être exact ou peut différer, si les écritures serveur sont permises, et si le parcours sera réutilisé. La stratégie autonome est le défaut sauf si le bug dépend d’une donnée précise existante. Écrire ces réponses dans la recette.',
  'Après l’entretien, restaurer et valider le point figé valide ; sinon exécuter la recette existante avec recipe.run ; seulement sans point ni recette appropriés, conduire une reprise guidée. Vérifier les données nécessaires sur le serveur vivant. Préférer les primitives et méthodes Craft via registry.* et app.replay ; utiliser page avec des contrôles nommés quand l’interface fait partie du scénario. Le navigateur et les captures servent à regarder ou montrer, jamais à agir. Raconter chaque étape avec resume.say.',
  'Rendre la main pour un secret : app.handoff avec until = session.prerequisites.session.signedInWhen, en disant où se connecter ; relancer si le délai expire.',
  'Écrire une recette autonome par défaut avec recipe.save : préparation et scénario séparés, attentes minimales essentielles/accessoires, remèdes, étapes humaines pour les secrets, variables vivantes, et nettoyage inverse de chaque création. Puis checkpoint.save avec goal, ttlMs/ttlReason, probes (session.prerequisites.probes plus une pour les données de l’objectif), created, deviations ; checkpoint.validate et resume.say kind done.',
  'À l’échec d’une attente essentielle sans remède, la recette s’arrête et nettoie les créations. Réparer depuis l’étape en échec avec recipe.repair ; ne pas rejouer tout le parcours. Les attentes accessoires violées sont consignées comme écarts.',
  'Si resume.request.repair indique une exécution échouée, lire la recette et son journal, réparer à partir de failedStep avec recipe.repair, puis relancer avec le runId fourni.',
];

type ResumeMessage = Readonly<{
  id: number;
  at: string;
  from: 'ai' | 'person';
  kind: string;
  text: string;
}>;

async function threadOf(requestId: string, since = 0): Promise<readonly ResumeMessage[]> {
  const response = await fetch(
    `${logServerUrl()}/sessions/resume-requests/${requestId}/messages?since=${since}`,
  );
  if (!response.ok) throw new Error(`Could not read the thread (HTTP ${response.status}).`);
  return ((await response.json()) as { messages: ResumeMessage[] }).messages;
}

/** What the person wrote after the AI last spoke. */
function repliesAfterLastAi(thread: readonly ResumeMessage[]): readonly ResumeMessage[] {
  const lastAi = thread.reduce((last, message, index) => (message.from === 'ai' ? index : last), -1);
  return thread.slice(lastAi + 1).filter((message) => message.from === 'person');
}

const NO_REQUEST_HINT =
  'Nobody asked to resume yet: ask the person to click « Reprendre ici » on an event of the debug session dashboard, or to give a session id.';

async function load(
  input: Readonly<{ sessionId?: string; beforeSequence?: number; participantId?: string }>,
): Promise<{ point: ResumePoint; archive: ResumeArchive }> {
  const point = await resolvePoint(input);
  return { point, archive: await fetchArchive(point.sessionId) };
}

async function resolvePoint(
  input: Readonly<{ sessionId?: string; beforeSequence?: number; participantId?: string }>,
): Promise<ResumePoint> {
  if (input.sessionId) return { ...input, sessionId: input.sessionId };
  const request = await latestRequest();
  if (!request) throw new Error(NO_REQUEST_HINT);
  // What the call names wins over what the dashboard left.
  const beforeSequence = input.beforeSequence ?? request.beforeSequence;
  const participantId = input.participantId ?? request.participantId;
  return {
    sessionId: request.sessionId,
    ...(beforeSequence === undefined ? {} : { beforeSequence }),
    ...(participantId === undefined ? {} : { participantId }),
    requestId: request.id,
  };
}

function pointOptions(point: ResumePoint) {
  return {
    ...(point.beforeSequence === undefined ? {} : { beforeSequence: point.beforeSequence }),
    ...(point.participantId === undefined ? {} : { participantId: point.participantId }),
  };
}

async function latestRequest(sessionId?: string): Promise<ResumeRequest | undefined> {
  const query = sessionId ? `?${new URLSearchParams({ sessionId })}` : '';
  const response = await fetch(`${logServerUrl()}/sessions/resume-requests/latest${query}`);
  if (!response.ok) throw new Error(`Could not read resume requests (HTTP ${response.status}).`);
  const body = (await response.json()) as { request?: ResumeRequest | null };
  return body.request ?? undefined;
}

async function fetchArchive(sessionId: string): Promise<ResumeArchive> {
  const response = await fetch(`${logServerUrl()}/sessions/${encodeURIComponent(sessionId)}`);
  if (!response.ok) throw new Error(`Session ${sessionId} not found (HTTP ${response.status}).`);
  const session = (await response.json()) as Record<string, unknown>;
  const events = Array.isArray(session['events'])
    ? session['events'].filter(
        (event): event is Record<string, unknown> =>
          typeof event === 'object' && event !== null && !Array.isArray(event),
      )
    : [];
  return {
    events,
    ...(typeof session['startUrl'] === 'string' ? { startUrl: session['startUrl'] } : {}),
    ...(Array.isArray(session['participants'])
      ? { participants: session['participants'] as Record<string, unknown>[] }
      : {}),
  };
}

function logServerUrl(): string {
  return (process.env['LOG_SERVER_URL'] ?? 'http://127.0.0.1:4319').replace(/\/$/, '');
}

async function guarded(run: () => Promise<unknown>) {
  try {
    return toolResult(await run());
  } catch (error) {
    return toolResult({ error: error instanceof Error ? error.message : String(error) });
  }
}

function toolResult(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: { result },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
