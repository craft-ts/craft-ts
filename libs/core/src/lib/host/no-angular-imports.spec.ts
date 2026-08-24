import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('core production sources', () => {
  it('do not import @angular', () => {
    const out = execSync(
      "rg -l \"from '@angular/\" libs/core/src libs/component/src --glob '!*.spec.ts' || true",
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });

  it('do not dynamically require @angular', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'craft-compat.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/@angular\//);
  });

  it('do not import @craft-ts/angular from component production sources', () => {
    const out = execSync(
      "rg -l \"from '@craft-ts/angular'\" libs/component/src --glob '!*.spec.ts' || true",
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });
});
