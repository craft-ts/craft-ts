#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const roots = process.argv.slice(2).map((root) => resolve(root));

if (roots.length === 0) {
  throw new Error('Usage: node tools/production-smoke.mjs <dist-directory>...');
}

const forbiddenInDemo = [
  'startFunctionRegistryBridge',
  '__CRAFT_FUNCTION_REGISTRY_BRIDGE_URL__',
  'http://127.0.0.1:4319/logs',
];

for (const root of roots) {
  if (!existsSync(root)) {
    throw new Error(`Production output does not exist: ${root}`);
  }

  const files = listFiles(root);
  const javascript = files.filter((file) => /\.m?js$/.test(file));
  if (javascript.length === 0) {
    throw new Error(`Production output contains no JavaScript: ${root}`);
  }

  const sourceMaps = files.filter((file) => /\.map$/.test(file));
  if (sourceMaps.length > 0) {
    throw new Error(
      `Production output must not contain source maps: ${sourceMaps.join(', ')}`,
    );
  }

  if (root.endsWith('/demo')) {
    const contents = javascript
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const leaked = forbiddenInDemo.filter((marker) =>
      contents.includes(marker),
    );
    if (leaked.length > 0) {
      throw new Error(
        `Development-only demo code leaked into production: ${leaked.join(', ')}`,
      );
    }
  }

  console.log(
    `${root}: ${javascript.length} JavaScript file(s), no source maps`,
  );
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}
