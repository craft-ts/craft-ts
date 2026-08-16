import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('core production sources', () => {
  it('do not import @angular', () => {
    const out = execSync(
      "rg -l \"from '@angular/\" libs/core/src libs/component/src --glob '!*.spec.ts' || true",
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });
});
