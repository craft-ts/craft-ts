import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readDoc } from './read-doc';

describe('coding agents docs', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
  const page = readDoc('../resources/ai-agents.md');
  const home = readDoc('../index.md');
  const homePrompt = readFileSync(
    join(repoRoot, 'apps/docs/.vitepress/theme/CraftAgentPrompt.vue'),
    'utf8',
  );
  const learnNext = readDoc('../learn/next.md');
  const guide = readDoc('../guide/index.md');
  const reference = readDoc('../reference/index.md');

  it('documents llms.txt, the MCP server, and Agent Skills', () => {
    expect(page).toContain('# Coding agents');
    expect(page).toContain('/llms.txt');
    expect(page).toContain('/llms-full.txt');
    expect(page).toContain('@craft-ts/mcp');
    expect(page).toContain('get_best_practices');
    expect(page).toContain('search_documentation');
    expect(page).toContain('craft-ts-routes');
    expect(page).toContain('craft-ts-architecture-tests');
    expect(page).toContain('/guide/testing/architecture');
    expect(page).toContain('Do not add an architecture rule for the feature');
    expect(page).toContain('plugin.json');
  });

  it('is linked from the home page, Learn, Guide, and Reference', () => {
    expect(home).toContain('/resources/ai-agents');
    expect(home).toContain('@craft-ts/mcp');
    expect(learnNext).toContain('/resources/ai-agents');
    expect(guide).toContain('/resources/ai-agents');
    expect(reference).toContain('/resources/ai-agents');
  });

  it('offers Claude Code and its generated skills in the home prompt', () => {
    expect(homePrompt).toContain('Claude Code');
    expect(homePrompt).toContain('claude-code');
    expect(homePrompt).toContain('CraftTS skills');
    expect(homePrompt).not.toContain('Cloud Code');
  });
});
