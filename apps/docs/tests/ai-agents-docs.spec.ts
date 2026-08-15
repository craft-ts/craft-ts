import { describe, expect, it } from 'vitest';
import { readDoc } from './read-doc';

describe('coding agents docs', () => {
  const page = readDoc('../resources/ai-agents.md');
  const home = readDoc('../index.md');
  const learnNext = readDoc('../learn/next.md');
  const guide = readDoc('../guide/index.md');
  const reference = readDoc('../reference/index.md');

  it('documents llms.txt, the MCP server, and Agent Skills', () => {
    expect(page).toContain('# Coding agents');
    expect(page).toContain('/llms.txt');
    expect(page).toContain('/llms-full.txt');
    expect(page).toContain('@craft-ng/mcp');
    expect(page).toContain('get_best_practices');
    expect(page).toContain('search_documentation');
    expect(page).toContain('ng-craft-routes');
    expect(page).toContain('plugin.json');
  });

  it('is linked from the home page, Learn, Guide, and Reference', () => {
    expect(home).toContain('/resources/ai-agents');
    expect(home).toContain('@craft-ng/mcp');
    expect(learnNext).toContain('/resources/ai-agents');
    expect(guide).toContain('/resources/ai-agents');
    expect(reference).toContain('/resources/ai-agents');
  });
});
