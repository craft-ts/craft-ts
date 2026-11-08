/**
 * The part of a recording its replay goes through: up to the first point it
 * cannot. The same rule as `cutUnfinishedTail` in `@craft-ts/component`, which
 * the dashboard applies before replaying; kept here, without dependencies, for
 * the readers that cannot import the component package (the log server). A
 * change to one is a change to both.
 *
 * - an operation with no result (a tab closed in the middle of a request):
 *   the action that started it is left out, with all that follows;
 * - a page loaded again (its participant announces a new initial state): the
 *   new app is not followed, everything before it is kept;
 * - a reload the app asked for (`BrowserLocationService … method:reload`): a
 *   session boundary, left out with the action that asked for it.
 */
export type ReplayablePartCut = Readonly<{
  reason: 'missing-result' | 'page-reload' | 'reload-requested';
  /** The first event left out. */
  atSequence: number;
}>;

type Event = Readonly<Record<string, unknown>>;

// The operations whose result a replay waits for. The last kind is joined so
// these sources never spell the Node global this package must not name.
const TERMINAL_OPERATION_KINDS = new Set(['http', 'navigation', 'route-load', 'async-proc' + 'ess']);
const STEP_KINDS = new Set(['dom', 'gesture', 'hover', 'scroll', 'viewport']);

export function replayablePart<Session extends Readonly<{ events: readonly Event[] }>>(
  session: Session,
): Readonly<{ session: Session; cut?: ReplayablePartCut }> {
  const events = [...session.events].sort((a, b) => sequenceOf(a) - sequenceOf(b));
  const steps = events.filter(isStep);
  const causeOf = (event: Event) => [...steps].reverse().find((step) => sequenceOf(step) <= sequenceOf(event)) ?? event;
  const candidates: ReplayablePartCut[] = [];

  const finished = new Set(
    events
      .filter((event) => event['phase'] === 'succeeded' || event['phase'] === 'failed')
      .flatMap((event) => (typeof event['operationId'] === 'string' ? [event['operationId']] : [])),
  );
  const unfinished = events.find((event) =>
    event['phase'] === 'started' &&
    TERMINAL_OPERATION_KINDS.has(String(event['kind'])) &&
    typeof event['operationId'] === 'string' &&
    !finished.has(event['operationId']));
  if (unfinished) candidates.push({ reason: 'missing-result', atSequence: sequenceOf(causeOf(unfinished)) });

  const booted = new Set<string>();
  const reboot = events.find((event) => {
    if (event['kind'] !== 'participant' || record(event['payload'])['initial'] !== true) return false;
    const participant = String(event['participantId'] ?? '');
    if (booted.has(participant)) return true;
    booted.add(participant);
    return false;
  });
  if (reboot) candidates.push({ reason: 'page-reload', atSequence: sequenceOf(reboot) });

  const reload = events.find((event) => {
    const invocation = record(record(event['payload'])['replayInvocation']);
    return event['kind'] === 'craft' && event['phase'] === 'started' &&
      /BrowserLocationService\b.*\bmethod:reload\b/.test(String(invocation['address'] ?? ''));
  });
  if (reload) candidates.push({ reason: 'reload-requested', atSequence: sequenceOf(causeOf(reload)) });

  const sorted = candidates.sort((left, right) => left.atSequence - right.atSequence)[0];
  if (!sorted) return { session };
  let at = sorted.atSequence;
  // An operation started before the cut and finished after it would be left
  // without its result: the cut moves back to the action that started it.
  for (;;) {
    const ended = new Set(events
      .filter((event) => sequenceOf(event) < at && (event['phase'] === 'succeeded' || event['phase'] === 'failed'))
      .flatMap((event) => (typeof event['operationId'] === 'string' ? [event['operationId']] : [])));
    const orphan = events.find((event) =>
      sequenceOf(event) < at &&
      event['phase'] === 'started' &&
      TERMINAL_OPERATION_KINDS.has(String(event['kind'])) &&
      typeof event['operationId'] === 'string' &&
      !ended.has(event['operationId']));
    if (!orphan) break;
    at = Math.min(at - 1, sequenceOf(causeOf(orphan)));
  }
  const cut = { ...sorted, atSequence: at };
  return {
    session: { ...session, events: events.filter((event) => sequenceOf(event) < cut.atSequence) },
    cut,
  };
}

function isStep(event: Event): boolean {
  if (event['kind'] === 'navigation' && event['phase'] === 'started' && record(record(event['payload'])['event'])['trigger'] === 'history')
    return true;
  return (event['kind'] === 'defer' && event['phase'] === 'started') ||
    (event['phase'] === 'emitted' && STEP_KINDS.has(String(event['kind'])));
}

function sequenceOf(event: Event): number {
  return typeof event['sequence'] === 'number' ? event['sequence'] : 0;
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
