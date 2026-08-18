import { describe, expect, it } from 'vitest';
import { loadCraftMcpResources } from './resources.js';

describe('loadCraftMcpResources', () => {
  it('loads bundled docs, skills, and agent files from the package', () => {
    const resources = loadCraftMcpResources();
    expect(resources.pages.length).toBeGreaterThan(20);
    expect(resources.skills.map((skill) => skill.name)).toEqual([
      'craft-ts',
      'migrate-to-craft-ts',
      'craft-ts-architecture-tests',
      'craft-ts-routes',
      'craft-ts-service-migration',
      'translate-spec-to-craft-ts',
    ]);
    expect(resources.bestPractices).toContain('yield*');
    expect(resources.agentsMd).toContain('@craft-ts/core');
  });

  it('treats architecture tests as a baseline and anti-regression contract', () => {
    const resources = loadCraftMcpResources();
    const architecture = resources.skills.find(
      (skill) => skill.name === 'craft-ts-architecture-tests',
    );
    expect(architecture?.markdown).toContain('craft-migrate-architecture');
    expect(architecture?.markdown).toContain(
      'Do not add an architecture rule for the feature',
    );
    expect(resources.bestPractices).toContain('craft-ts-architecture-tests');
    expect(resources.bestPractices).toContain(
      'Do not add an architecture rule for the feature',
    );
    expect(resources.agentsMd).toContain('architecture/');
    expect(
      resources.skills.find((skill) => skill.name === 'translate-spec-to-craft-ts')
        ?.markdown,
    ).toContain('Baseline helper already covering this');
  });
});
