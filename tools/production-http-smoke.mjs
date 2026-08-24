#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const serverEntry = resolve('dist/apps/demo-ssr/server/server.js');
const port = await findFreePort();
const child = spawn(process.execPath, [serverEntry], {
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (chunk) => {
  output += chunk;
});
child.stderr.on('data', (chunk) => {
  output += chunk;
});

try {
  await waitForListening(child, () => output);
  await expectStatus('/health', 200);
  await expectStatus('/ready', 200);
  const page = await expectStatus('/', 200);
  if (!page.headers.get('content-security-policy')) {
    throw new Error('SSR response is missing Content-Security-Policy.');
  }
  if (page.headers.get('cache-control') !== 'no-store') {
    throw new Error('SSR response must not be cached by default.');
  }
  const manifest = JSON.parse(
    await readFile(resolve('dist/apps/demo-ssr/.vite/manifest.json'), 'utf8'),
  );
  const entry = manifest['index.html'];
  const script = await expectStatus(`/${entry.file}`, 200);
  const stylesheet = await expectStatus(`/${entry.css[0]}`, 200);
  for (const asset of [script, stylesheet]) {
    if (
      asset.headers.get('cache-control') !==
      'public, max-age=31536000, immutable'
    ) {
      throw new Error('Hashed SSR assets must use immutable public caching.');
    }
  }
  await expectStatus('/api/unknown', 404);
  const wrongMethod = await expectStatus('/api/deferred', 405, {
    method: 'POST',
  });
  if (wrongMethod.headers.get('allow') !== 'GET') {
    throw new Error('API route did not advertise its allowed method.');
  }
  await expectStatus('/missing', 404);
  await expectStatus('/api/deferred', 200);
  console.log(`Production SSR smoke passed on http://127.0.0.1:${port}`);
} finally {
  child.kill('SIGTERM');
  await onceExit(child);
  if (child.exitCode !== 0) {
    throw new Error(
      `Production SSR server exited with ${child.exitCode}.\n${output}`,
    );
  }
}

async function expectStatus(pathname, expected, init) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, init);
  if (response.status !== expected) {
    throw new Error(
      `${pathname} returned ${response.status}; expected ${expected}.`,
    );
  }
  return response;
}

async function waitForListening(processHandle, getOutput) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(
        `Production SSR server exited before listening.\n${getOutput()}`,
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      if (response.status === 200) return;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
  }
  throw new Error(
    `Timed out waiting for production SSR server.\n${getOutput()}`,
  );
}

function onceExit(processHandle) {
  return new Promise((resolvePromise) => {
    if (processHandle.exitCode !== null) {
      resolvePromise();
      return;
    }
    processHandle.once('exit', resolvePromise);
  });
}

function findFreePort() {
  return new Promise((resolvePromise, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close();
        reject(new Error('Could not allocate a free TCP port.'));
        return;
      }
      const selectedPort = address.port;
      probe.close((error) =>
        error ? reject(error) : resolvePromise(selectedPort),
      );
    });
  });
}
