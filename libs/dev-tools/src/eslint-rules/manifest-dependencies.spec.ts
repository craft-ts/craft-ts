import { readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rulesDirectory = import.meta.dirname;
const manifest = JSON.parse(
  readFileSync(join(rulesDirectory, '../../package.json'), 'utf8'),
) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

// `@craft-ts/dev-tools/eslint-rules` loads every `.cjs` rule eagerly, so a
// package the rules `require()` must be installed with dev-tools itself.
function packageName(specifier: string) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function requiredPackages() {
  const packages = new Map<string, string[]>();
  for (const file of readdirSync(rulesDirectory)) {
    if (!file.endsWith('.cjs')) continue;
    const source = readFileSync(join(rulesDirectory, file), 'utf8');
    for (const match of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const specifier = match[1];
      if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
      const name = packageName(specifier);
      if (builtinModules.includes(name)) continue;
      packages.set(name, [...(packages.get(name) ?? []), file]);
    }
  }
  return packages;
}

describe('@craft-ts/dev-tools manifest', () => {
  it('declares every package required by the shipped ESLint rules', () => {
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    const missing = [...requiredPackages()]
      .filter(([name]) => !declared.has(name))
      .map(([name, files]) => `${name} (${files.join(', ')})`);

    expect(missing).toEqual([]);
  });

  it('declares aria-query, used by valid-aria and role-has-required-aria', () => {
    expect(manifest.dependencies?.['aria-query']).toBe('^5.3.2');
    expect([...requiredPackages().keys()]).toContain('aria-query');
  });
});
