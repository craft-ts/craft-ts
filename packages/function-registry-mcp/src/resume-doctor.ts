import type { RegistryBridgeBroker } from './bridge-broker.js';
import type { RegistryClient } from './protocol.js';
import type { BridgeRole } from './shared-bridge.js';

export type DoctorCheck = Readonly<{
  name: 'log-server' | 'bridge' | 'tab' | 'guided-resume' | 'resume-request';
  ok: boolean;
  detail: string;
  /** What to do, said to the person or done by the AI. */
  fix?: string;
}>;

export type DoctorReport = Readonly<{
  ready: boolean;
  checks: readonly DoctorCheck[];
  /** The tab to pass as clientId when several are ready. */
  clientId?: string;
  /** Where the app should be opened, from the latest resume request. */
  appUrl?: string;
}>;

export type DoctorContext = Readonly<{
  request: RegistryBridgeBroker['request'];
  fetch: typeof fetch;
  logServerUrl: string;
  requestId?: string;
  bridge?: Readonly<{
    role(): BridgeRole;
    address(): Readonly<{ host: string; port: number }>;
  }>;
}>;

/**
 * Everything a guided resume needs, checked in one call: the log server, the
 * bridge, one app tab on it with the guided resume installed. Each failed
 * check says what to do, so the AI repairs or asks in one sentence.
 */
export async function diagnoseGuidedResume(
  context: DoctorContext,
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const base = context.logServerUrl.replace(/\/$/, '');

  let appUrl: string | undefined;
  let resolvedRequestId: string | undefined;
  try {
    const health = await context.fetch(`${base}/health`);
    checks.push(
      health.ok
        ? { name: 'log-server', ok: true, detail: `${base} répond.` }
        : {
            name: 'log-server',
            ok: false,
            detail: `${base} répond HTTP ${health.status}.`,
            fix: 'Lancer le log-server (npm run logs:server) avec le même port que LOG_SERVER_URL.',
          },
    );
    const requestUrl = context.requestId
      ? `${base}/sessions/resume-requests/${encodeURIComponent(context.requestId)}`
      : `${base}/sessions/resume-requests/latest`;
    const response = await context.fetch(requestUrl);
    if (response.status === 404 && context.requestId) {
      checks.push({
        name: 'resume-request',
        ok: false,
        detail: `La demande ${context.requestId} est introuvable ou a expiré.`,
        fix: 'Reclique « Reprendre ici » dans le dashboard pour créer une nouvelle demande, puis colle son prompt dans la conversation active.',
      });
    } else if (!response.ok) {
      throw new Error(
        `Lecture de la demande impossible (HTTP ${response.status}).`,
      );
    } else {
      const latest = (await response.json()) as {
        request?: {
          id?: string;
          sessionId?: string;
          beforeSequence?: number;
        } | null;
      };
      if (latest.request?.sessionId) {
        resolvedRequestId = latest.request.id ?? context.requestId;
        const archive = (await (
          await context.fetch(
            `${base}/sessions/${encodeURIComponent(latest.request.sessionId)}`,
          )
        ).json()) as { startUrl?: unknown };
        if (typeof archive.startUrl === 'string') appUrl = archive.startUrl;
        checks.push({
          name: 'resume-request',
          ok: true,
          detail: `Demande ${latest.request.id ?? context.requestId ?? 'la plus récente'} : session ${latest.request.sessionId}${
            latest.request.beforeSequence === undefined
              ? ''
              : `, avant l’événement ${latest.request.beforeSequence}`
          }.`,
        });
      } else {
        checks.push({
          name: 'resume-request',
          ok: false,
          detail: 'Aucune demande de reprise.',
          fix: 'Demander à la personne de cliquer « Reprendre ici » dans le dashboard au moment voulu, ou un id de session.',
        });
      }
    }
  } catch (error) {
    checks.push({
      name: 'log-server',
      ok: false,
      detail: `${base} injoignable (${error instanceof Error ? error.message : String(error)}).`,
      fix: 'Lancer le log-server (npm run logs:server) et vérifier LOG_SERVER_URL.',
    });
  }

  const address = context.bridge?.address();
  const role = context.bridge?.role();
  checks.push(
    role === 'connecting'
      ? {
          name: 'bridge',
          ok: false,
          detail: `Le pont ${address?.host}:${address?.port} se reconnecte.`,
          fix: 'Réessayer dans une seconde.',
        }
      : {
          name: 'bridge',
          ok: true,
          detail:
            role === 'relay'
              ? `Pont ${address?.host}:${address?.port} tenu par une autre session ; ses appels y sont relayés.`
              : `Pont ${address?.host ?? ''}:${address?.port ?? ''} tenu par ce serveur.`,
        },
  );

  let clients: readonly RegistryClient[] = [];
  try {
    clients = (await context.request(
      'registry/clients',
    )) as readonly RegistryClient[];
  } catch {
    clients = [];
  }
  const ready = clients.filter((client) => client.status === 'ready');
  const targetRequestId = context.requestId ?? resolvedRequestId;
  const marked = targetRequestId
    ? ready.filter((client) => {
        if (!client.pageUrl) return false;
        try {
          return (
            new URL(client.pageUrl).searchParams.get('craft-resume-request') ===
            targetRequestId
          );
        } catch {
          return false;
        }
      })
    : [];
  const selected = targetRequestId
    ? marked.length === 1
      ? marked[0]
      : undefined
    : ready.length === 1
      ? ready[0]
      : undefined;
  const bridgeUrl = address
    ? `ws://${address.host}:${address.port}`
    : 'le port du pont';
  const where = appUrl ?? 'l’URL de l’app';
  if (targetRequestId && marked.length === 0)
    checks.push({
      name: 'tab',
      ok: false,
      detail: `Aucun onglet prêt n’est associé à la demande ${targetRequestId}.`,
      fix: `Ouvrir l’onglet dédié depuis le dashboard, vérifier qu’il charge ${where}, puis relancer resume.doctor avec requestId ${targetRequestId}.`,
    });
  else if (targetRequestId && marked.length > 1)
    checks.push({
      name: 'tab',
      ok: false,
      detail: `${marked.length} onglets portent la demande ${targetRequestId}.`,
      fix: 'Fermer les onglets en doublon de cette reprise puis relancer resume.doctor.',
    });
  else if (selected)
    checks.push({
      name: 'tab',
      ok: true,
      detail: `Onglet dédié à la reprise : ${selected.clientId} (${selected.pageUrl ?? '?'}).`,
    });
  else if (ready.length === 0)
    checks.push({
      name: 'tab',
      ok: false,
      detail: 'Aucun onglet de l’app n’est relié au pont.',
      fix: `Ouvrir ${where} dans un navigateur que tu pilotes (ou demander à la personne de l’ouvrir), puis relancer resume.doctor. L’app doit viser ${bridgeUrl} (provideCraftDevTools({ mcpBridgeUrl }) ou VITE_CRAFT_MCP_BRIDGE_URL).`,
    });
  else if (ready.length > 1)
    checks.push({
      name: 'tab',
      ok: false,
      detail: `${ready.length} onglets prêts : ${ready.map((client) => `${client.clientId} (${client.pageUrl ?? '?'})`).join(', ')}.`,
      fix: 'Choisir l’onglet à piloter et passer son clientId à app.* et page, ou faire fermer les autres (un replay du dashboard compte comme un onglet).',
    });
  else
    checks.push({
      name: 'tab',
      ok: true,
      detail: `Onglet prêt : ${ready[0]?.pageUrl ?? ready[0]?.clientId}.`,
    });

  const clientsToCheck = selected ? [selected] : targetRequestId ? [] : ready;
  for (const client of clientsToCheck) {
    try {
      await context.request('app/writes', {
        clientId: client.clientId,
        timeoutMs: 5_000,
      });
      checks.push({
        name: 'guided-resume',
        ok: true,
        detail: `La reprise guidée répond dans ${client.pageUrl ?? client.clientId}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push({
        name: 'guided-resume',
        ok: false,
        detail: `${client.pageUrl ?? client.clientId} : ${message}`,
        fix: /does not answer/.test(message)
          ? 'Installer la reprise guidée dans l’app, en développement : ...provideCraftGuidedResume({ logServerUrl }) à côté de provideCraftDevTools().'
          : 'Recharger l’onglet, puis relancer resume.doctor.',
      });
    }
  }

  const onlyTab = selected;
  return {
    ready: checks.every(
      (check) =>
        check.ok || (!context.requestId && check.name === 'resume-request'),
    ),
    checks,
    ...(onlyTab ? { clientId: onlyTab.clientId } : {}),
    ...(appUrl ? { appUrl } : {}),
  };
}
