import { describe, expect, it } from 'vitest';
import { loadCraftMcpResources } from './resources.js';

describe('loadCraftMcpResources', () => {
  it('loads bundled docs, skills, and agent files from the package', () => {
    const resources = loadCraftMcpResources();
    expect(resources.pages.length).toBeGreaterThan(20);
    expect(resources.skills.map((skill) => skill.name)).toEqual([
      'craft-ng',
      'migrate-to-ng-craft',
      'ng-craft-routes',
      'ng-craft-service-migration',
      'translate-spec-to-ng-craft',
    ]);
    expect(resources.bestPractices).toContain('yield*');
    expect(resources.agentsMd).toContain('@craft-ng/core');
  });
});
