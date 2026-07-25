#!/usr/bin/env node
import { resolve } from 'node:path';
import { createLogHttpServer } from './http-server.js';
import { LogStore } from './log-store.js';

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

const store = new LogStore({ directory, maxFileSize, maxFiles });
const server = createLogHttpServer({
  store,
  onIngest: (count) => {
    if (!quiet && count > 0) {
      console.log(`[log-server] +${count} entries -> ${store.filePath}`);
    }
  },
});

server.listen(port, host, () => {
  console.log(`[log-server] listening on http://${host}:${port}`);
  console.log(`[log-server] writing to ${store.filePath}`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
