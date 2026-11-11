/**
 * Replays sessions as the regression suite does, through the log server
 * (`POST /sessions/:id/suite-replay`), one after the other. The answer an
 * agent reads after an edit: which sessions still replay, and for the others
 * the gap they stop on (a call a click no longer makes, a state the code no
 * longer produces).
 */
export type SessionReplayOutcome = Readonly<{
  sessionId: string;
  status: string;
  replayIndex?: number;
  total?: number;
  message?: string;
  difference?: unknown;
  unprovenInteractions?: readonly string[];
  /** The end of the recording left out of the replay: not checked. */
  tailCut?: Readonly<{ reason: string; keptSteps: number; droppedSteps: number }>;
  durationMs?: number;
}>;

export async function replaySessions(
  sessionIds: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Readonly<{ passed: boolean; counts: Readonly<Record<string, number>>; results: readonly SessionReplayOutcome[] }>> {
  const base = (process.env['LOG_SERVER_URL'] ?? 'http://127.0.0.1:4319').replace(/\/$/, '');
  const results: SessionReplayOutcome[] = [];
  for (const sessionId of sessionIds) {
    try {
      const response = await fetchImpl(`${base}/sessions/${encodeURIComponent(sessionId)}/suite-replay`, { method: 'POST' });
      const body = await response.json() as Record<string, unknown>;
      if (response.status === 404) results.push({ sessionId, status: 'not-found', message: 'Session absente de l’archive.' });
      else {
        const { notes: _notes, ...outcome } = body;
        results.push({ ...(outcome as SessionReplayOutcome), sessionId });
      }
    } catch (error) {
      results.push({ sessionId, status: 'unreachable', message: `Log server injoignable (${error instanceof Error ? error.message : String(error)}).` });
    }
  }
  const counts: Record<string, number> = {};
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  // A replay that went through on invoked methods did not prove its clicks.
  // One whose recording ends unfinished passes on the part it replayed: its
  // `tailCut` says how much was left out.
  const passed = results.length > 0 && results.every((result) => result.status === 'completed' && (result.unprovenInteractions?.length ?? 0) === 0);
  return { passed, counts, results };
}
