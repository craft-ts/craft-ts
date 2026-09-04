import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALCHEMY_RESOURCE_EXPORTS,
  createAlchemyStackSource,
} from './alchemy-runtime.js';

describe('Alchemy 2 runtime adapter', () => {
  it('maps current resource modules and nested exports', () => {
    expect(ALCHEMY_RESOURCE_EXPORTS['cloudflare:R2.Bucket']).toEqual({
      module: 'alchemy/Cloudflare',
      path: ['R2', 'Bucket'],
    });
  });

  it('generates syntactically valid Effect-first stacks with typed bindings', () => {
    const source = createAlchemyStackSource('demo', 'staging', [
      {
        type: 'cloudflare:R2.Bucket',
        name: 'demo-staging-uploads',
        properties: { binding: 'UPLOADS' },
      },
      {
        type: 'cloudflare:Worker',
        name: 'demo-staging-worker',
        properties: {
          entrypoint: 'dist/worker.js',
          bindings: ['UPLOADS'],
          environment: 'API_URL',
        },
      },
    ]);
    const directory = mkdtempSync(join(tmpdir(), 'craft-alchemy-source-'));
    const file = join(directory, 'stack.mjs');

    try {
      writeFileSync(file, source, 'utf8');
      execFileSync(process.execPath, ['--check', file]);
      expect(source).toContain('Cloudflare.R2.ReadWriteBucket(resource0)');
      expect(source).toContain('process.env["API_URL"]');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
