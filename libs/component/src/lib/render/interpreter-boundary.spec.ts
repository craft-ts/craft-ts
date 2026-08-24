import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('interpreter package boundary', () => {
  it('does not import Angular core directly', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'libs/component/src/lib/render/interpreter.ts',
      ),
      'utf8',
    );

    expect(source).not.toMatch(/from ['"]@angular\/core['"]/);
  });
});
