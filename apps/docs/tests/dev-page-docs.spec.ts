import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readDoc } from './read-doc';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('live page MCP docs', () => {
  const page = readDoc('../guide/ai/dev-page.md');
  const home = readDoc('../index.md');
  const agents = readDoc('../resources/ai-agents.md');
  const reference = readDoc('../reference/index.md');
  const publishedMcp = readFileSync(
    join(repoRoot, 'packages/mcp/src/mcp-server.ts'),
    'utf8',
  );

  it('splits page vs registry.* vs @craft-ng/mcp', () => {
    expect(page).toContain('# Live page MCP');
    expect(page).toContain('**Use it when**');
    expect(page).toContain('**Not when**');
    expect(page).toContain('registry.*');
    expect(page).toContain('@craft-ng/mcp');
    expect(page).toContain('function-registry');
    expect(page).toContain('data-craft-name="save"');
    expect(page).toContain('assertInteractiveElementNamed');
  });

  it('is the first home feature and is linked from agents and reference', () => {
    expect(home).toContain('Agents drive the tab you already have open');
    expect(home).toContain('/guide/ai/dev-page');
    expect(home).toMatch(
      /features:\n {2}- title: Agents drive the tab you already have open/,
    );
    expect(agents).toContain('Live page MCP');
    expect(agents).toContain('Dev only');
    expect(agents).toContain('/guide/ai/dev-page');
    expect(reference).toContain('/guide/ai/dev-page');
  });

  it('does not expose a page tool on the published @craft-ng/mcp server', () => {
    expect(publishedMcp).not.toContain("registerTool(\n    'page'");
    expect(publishedMcp).not.toMatch(/registerTool\(\s*'page'/);
    expect(publishedMcp).toContain("name: 'craft-ng'");
    expect(publishedMcp).toContain('get_best_practices');
  });
});
