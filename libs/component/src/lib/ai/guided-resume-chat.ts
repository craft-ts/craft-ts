import { provideAppInitializer } from '@craft-ts/core';
import type { Provider } from '../host-runtime';
import { CRAFT_GUIDED_RESUME_REQUEST_QUERY_PARAM } from './guided-resume';

type ResumeMessage = Readonly<{
  id: number;
  at: string;
  from: 'ai' | 'person';
  kind: 'step' | 'question' | 'handoff' | 'done' | 'reply';
  text: string;
}>;

const POLL_MS = 1_500;
const CHAT_ATTRIBUTE = 'data-craft-guided-resume-chat';
const DEFAULT_LOG_SERVER_URL = 'http://127.0.0.1:4319';

/** Options for the read-only message panel shown in a guided-resume app tab. */
export type CraftGuidedResumeChatOptions = Readonly<{
  /** The log server holding the resume request thread. */
  logServerUrl?: string;
}>;

/**
 * Shows the agent's progress thread inside the app tab opened by the replay
 * dashboard. It is inert on ordinary app visits and does not accept replies.
 */
export function provideCraftGuidedResumeChat(
  options: CraftGuidedResumeChatOptions = {},
): Provider[] {
  const logServerUrl = (options.logServerUrl ?? DEFAULT_LOG_SERVER_URL).replace(
    /\/$/,
    '',
  );
  return [
    provideAppInitializer(() => {
      if (typeof window === 'undefined') return;
      const requestId = new URLSearchParams(location.search).get(
        CRAFT_GUIDED_RESUME_REQUEST_QUERY_PARAM,
      );
      if (!requestId) return;
      mountResumeChat(logServerUrl, requestId);
    }),
  ];
}

function mountResumeChat(logServerUrl: string, requestId: string): void {
  const document = globalThis.document;
  document.querySelector(`[${CHAT_ATTRIBUTE}]`)?.remove();

  const root = document.createElement('aside');
  root.setAttribute(CHAT_ATTRIBUTE, '');
  root.setAttribute('data-craft-ai-overlay', '');
  root.setAttribute('aria-label', 'Messages de la reprise');
  Object.assign(root.style, {
    position: 'fixed',
    right: '16px',
    bottom: '88px',
    zIndex: '2147483646',
    width: 'min(380px, calc(100vw - 32px))',
    color: '#18221d',
    font: '14px/1.45 system-ui, sans-serif',
  });

  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.textContent = 'Messages de l’agent';
  Object.assign(launcher.style, {
    display: 'block',
    marginLeft: 'auto',
    padding: '10px 14px',
    border: '1px solid #315342',
    borderRadius: '999px',
    background: '#1f3d2d',
    color: '#fff',
    font: '600 14px/1.2 system-ui, sans-serif',
    boxShadow: '0 5px 18px rgb(0 0 0 / 24%)',
    cursor: 'pointer',
  });

  const panel = document.createElement('section');
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Fil de messages de l’agent');
  Object.assign(panel.style, {
    display: 'none',
    flexDirection: 'column',
    maxHeight: 'min(68vh, 560px)',
    marginBottom: '10px',
    overflow: 'hidden',
    border: '1px solid #c7d2ca',
    borderRadius: '14px',
    background: '#fbfcfa',
    boxShadow: '0 10px 32px rgb(0 0 0 / 24%)',
  });

  const header = document.createElement('header');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 14px',
    borderBottom: '1px solid #e0e7e1',
    background: '#f1f5f1',
  });
  const heading = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'Reprise guidée';
  const subtitle = document.createElement('div');
  subtitle.textContent = 'Messages de l’agent';
  subtitle.style.color = '#59665e';
  subtitle.style.fontSize = '12px';
  heading.append(title, subtitle);
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Masquer';
  close.setAttribute('aria-label', 'Masquer les messages de l’agent');
  Object.assign(close.style, {
    padding: '6px 9px',
    border: '1px solid #b8c5bc',
    borderRadius: '7px',
    background: '#fff',
    color: '#24362b',
    font: 'inherit',
    cursor: 'pointer',
  });
  header.append(heading, close);

  const messages = document.createElement('div');
  messages.setAttribute('aria-live', 'polite');
  messages.setAttribute('aria-relevant', 'additions');
  Object.assign(messages.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '9px',
    minHeight: '96px',
    padding: '12px',
    overflowY: 'auto',
  });
  const empty = document.createElement('p');
  empty.textContent = 'En attente du premier message de l’agent…';
  empty.style.margin = '0';
  empty.style.color = '#59665e';
  messages.append(empty);

  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.style.padding = '0 12px 10px';
  status.style.color = '#7a3b24';
  status.style.fontSize = '12px';

  panel.append(header, messages, status);
  root.append(panel, launcher);
  document.body.append(root);

  let lastMessageId = 0;
  let initialized = false;
  let unread = 0;
  let disposed = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let activeRequest: AbortController | undefined;
  let didAutoOpen = false;

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    // `hidden` is overridden by the panel's flex layout in some browsers.
    panel.style.display = open ? 'flex' : 'none';
    launcher.setAttribute('aria-expanded', String(open));
    if (open) {
      unread = 0;
      updateLauncher();
      messages.scrollTop = messages.scrollHeight;
    }
  };
  const updateLauncher = () => {
    launcher.textContent = unread
      ? `Messages de l’agent (${unread})`
      : 'Messages de l’agent';
  };
  launcher.addEventListener('click', () =>
    setOpen(panel.style.display !== 'flex'),
  );
  close.addEventListener('click', () => {
    setOpen(false);
    launcher.focus();
  });

  const append = (message: ResumeMessage) => {
    if (message.from !== 'ai') return false;
    if (messages.contains(empty)) empty.remove();
    const article = document.createElement('article');
    Object.assign(article.style, {
      padding: '9px 10px',
      border: '1px solid #dce5de',
      borderRadius: '10px',
      background: message.kind === 'handoff' ? '#fff8e6' : '#fff',
    });
    const line = document.createElement('div');
    Object.assign(line.style, {
      display: 'flex',
      justifyContent: 'space-between',
      gap: '8px',
      marginBottom: '4px',
      color: '#526258',
      fontSize: '11px',
    });
    const kind = document.createElement('strong');
    kind.textContent = messageLabel(message.kind);
    const time = document.createElement('time');
    time.dateTime = message.at;
    time.textContent = formatTime(message.at);
    line.append(kind, time);
    const body = document.createElement('p');
    body.textContent = message.text;
    Object.assign(body.style, {
      margin: '0',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
    });
    article.append(line, body);
    messages.append(article);
    return true;
  };

  const accept = (incoming: readonly ResumeMessage[]) => {
    let added = 0;
    let shouldOpen = false;
    for (const message of incoming) {
      lastMessageId = Math.max(lastMessageId, message.id);
      if (!append(message)) continue;
      added++;
      shouldOpen ||=
        message.kind === 'question' ||
        message.kind === 'handoff' ||
        message.kind === 'done';
    }
    if (!added) return;
    if (panel.style.display === 'flex') {
      messages.scrollTop = messages.scrollHeight;
    } else {
      unread += added;
      updateLauncher();
      shouldOpen ||= !didAutoOpen;
    }
    if (shouldOpen) {
      didAutoOpen = true;
      setOpen(true);
    }
  };

  const schedule = (delay = POLL_MS) => {
    if (disposed || document.visibilityState === 'hidden') return;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => void poll(), delay);
  };
  const poll = async () => {
    if (disposed || document.visibilityState === 'hidden') return;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    try {
      const path = !initialized
        ? `/sessions/resume-requests/${encodeURIComponent(requestId)}`
        : `/sessions/resume-requests/${encodeURIComponent(requestId)}/messages?since=${lastMessageId}`;
      const response = await fetch(`${logServerUrl}${path}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok && !initialized && response.status === 404) {
        status.textContent = 'En attente de la demande de reprise…';
        return;
      }
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? 'Cette demande de reprise a expiré.'
            : `Le fil de reprise est indisponible (HTTP ${response.status}).`,
        );
      const body = (await response.json()) as {
        messages?: unknown;
      };
      initialized = true;
      status.textContent = '';
      accept(readMessages(body.messages));
    } catch (error) {
      if (controller.signal.aborted) return;
      status.textContent =
        error instanceof Error
          ? `${error.message} Nouvelle tentative…`
          : 'Le fil de reprise est indisponible. Nouvelle tentative…';
    } finally {
      if (activeRequest === controller) {
        activeRequest = undefined;
        schedule(status.textContent ? 4_000 : POLL_MS);
      }
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = undefined;
      activeRequest?.abort();
    } else {
      void poll();
    }
  };
  const dispose = () => {
    disposed = true;
    if (pollTimer) clearTimeout(pollTimer);
    activeRequest?.abort();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    globalThis.removeEventListener('pagehide', dispose);
    root.remove();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  globalThis.addEventListener('pagehide', dispose, { once: true });
  void poll();
}

function readMessages(value: unknown): readonly ResumeMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isResumeMessage).sort((a, b) => a.id - b.id);
}

function isResumeMessage(value: unknown): value is ResumeMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message['id'] === 'number' &&
    Number.isFinite(message['id']) &&
    typeof message['at'] === 'string' &&
    (message['from'] === 'ai' || message['from'] === 'person') &&
    (message['kind'] === 'step' ||
      message['kind'] === 'question' ||
      message['kind'] === 'handoff' ||
      message['kind'] === 'done' ||
      message['kind'] === 'reply') &&
    typeof message['text'] === 'string'
  );
}

function messageLabel(kind: ResumeMessage['kind']): string {
  switch (kind) {
    case 'question':
      return 'À faire';
    case 'handoff':
      return 'À vous';
    case 'done':
      return 'Terminé';
    case 'reply':
      return 'Réponse';
    default:
      return 'Avancement';
  }
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}
