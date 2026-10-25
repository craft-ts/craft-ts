#!/usr/bin/env node
import { delimiter, resolve } from 'node:path';
import { createLogHttpServer } from './http-server.js';
import { LogStore } from './log-store.js';
import { DebugSessionStore } from './debug-session-store.js';
import { createPlaywrightCapturer } from './thumbnails/playwright-capturer.js';
import { ThumbnailService } from './thumbnails/thumbnail-service.js';
import { ThumbnailStore } from './thumbnails/thumbnail-store.js';

const host = process.env['LOG_SERVER_HOST'] ?? '127.0.0.1';
const port = Number(process.env['LOG_SERVER_PORT'] ?? '4319');
const directory = resolve(
  process.env['LOG_SERVER_DIR'] ?? resolve(process.cwd(), '.logs'),
);
const maxFileSize = Number(
  process.env['LOG_SERVER_MAX_FILE_SIZE'] ?? String(5 * 1024 * 1024),
);
const maxFiles = Number(process.env['LOG_SERVER_MAX_FILES'] ?? '5');
const quiet = process.env['LOG_SERVER_QUIET'] === '1';
const sessionDirectory = resolve(
  process.env['DEBUG_SESSION_DIR'] ?? resolve(process.cwd(), '.debug-sessions'),
);
const allowedOrigins = process.env['LOG_SERVER_ALLOWED_ORIGINS']
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const sessionMaxSessions = Number(
  process.env['DEBUG_SESSION_MAX_SESSIONS'] ?? '100',
);
const sessionRetentionDays = Number(
  process.env['DEBUG_SESSION_RETENTION_DAYS'] ?? '30',
);
const e2eSessionRoots = process.env['CRAFT_E2E_SESSION_STORE']
  ?.split(delimiter).map((path) => path.trim()).filter(Boolean).map((path) => resolve(path));

const store = new LogStore({ directory, maxFileSize, maxFiles });
const sessionStore = new DebugSessionStore(sessionDirectory, {
  maxSessions: sessionMaxSessions,
  maxAgeMs: sessionRetentionDays * 24 * 60 * 60 * 1000,
});
const dashboardUrl =
  process.env['DEBUG_SESSION_DASHBOARD_URL'] ?? 'http://localhost:4210/';
const thumbnailsEnabled = process.env['DEBUG_SESSION_THUMBNAILS'] !== '0';
const thumbnails = new ThumbnailService({
  store: new ThumbnailStore(resolve(sessionDirectory, 'thumbnails')),
  sessions: sessionStore,
  ...(thumbnailsEnabled
    ? { capturer: createPlaywrightCapturer({ dashboardUrl }) }
    : { unavailableReason: 'Aperçus désactivés (DEBUG_SESSION_THUMBNAILS=0).' }),
  params: {
    maxPoints: Number(process.env['DEBUG_SESSION_THUMBNAIL_MAX'] ?? '20'),
    width: Number(process.env['DEBUG_SESSION_THUMBNAIL_WIDTH'] ?? '480'),
  },
});
const server = createLogHttpServer({
  store,
  sessionStore,
  ...(e2eSessionRoots ? { e2eSessionRoots } : {}),
  thumbnails,
  ...(allowedOrigins ? { allowedOrigins } : {}),
  onIngest: (count) => {
    if (!quiet && count > 0) {
      console.log(`[log-server] +${count} entries -> ${store.filePath}`);
    }
  },
});

server.listen(port, host, () => {
  console.log(`[log-server] listening on http://${host}:${port}`);
  console.log(`[log-server] writing to ${store.filePath}`);
  console.log(`[log-server] debug sessions: ${sessionDirectory}`);
  if (thumbnailsEnabled)
    console.log(`[log-server] thumbnails replay through ${dashboardUrl}`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
