import { sessionDate } from '../../shared/util/replay-labels';
import { isRecord } from '../../shared/util/replay-model';

export type ReplayTitleSummary = Readonly<{ createdAt: string }>;
export type ReplayTitleSession =
  | Readonly<{
      participants?: readonly Readonly<{ title?: string }>[];
      events: readonly Readonly<{ kind: string; payload?: unknown }>[];
    }>
  | undefined;

function recordedAppName(recorded: ReplayTitleSession): string | undefined {
  const titled = recorded?.participants?.find(
    (participant) => participant.title && !/^Onglet\s/i.test(participant.title),
  )?.title;
  if (titled) return titled;
  const appShell = recorded?.events.find(
    (event) =>
      event.kind === 'component-lifecycle' &&
      isRecord(event.payload) &&
      typeof event.payload['componentName'] === 'string' &&
      event.payload['componentName'].endsWith('AppShell'),
  );
  const shellName = isRecord(appShell?.payload)
    ? appShell.payload['componentName']
    : undefined;
  return typeof shellName === 'string'
    ? shellName.replace(/AppShell$/, '')
    : undefined;
}

/** The page title combines the recorded app name with the recording date. */
export function replaySessionTitle(
  summary: ReplayTitleSummary | undefined,
  recorded: ReplayTitleSession,
): string {
  const date = summary
    ? sessionDate.format(new Date(summary.createdAt))
    : 'Session importée';
  const appName = recordedAppName(recorded);
  return appName ? `${appName} · ${date}` : date;
}
