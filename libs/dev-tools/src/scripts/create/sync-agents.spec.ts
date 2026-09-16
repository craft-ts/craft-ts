import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectAgents, runAgentSync } from './sync-agents';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

/** A project created by an older CraftTS, with work of its own already in it. */
async function existingProject(
  files: Record<string, string> = {},
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-agents-sync-'));
  temporaryDirectories.push(root);
  const contents: Record<string, string> = {
    'package.json': JSON.stringify(
      {
        name: 'shop',
        scripts: { dev: 'node scripts/dev.mjs', 'logs:mcp': 'craft-ts-log-mcp' },
        devDependencies: { '@craft-ts/dev-tools': '^0.7.0-beta.9' },
      },
      null,
      2,
    ),
    '.mcp.json': JSON.stringify(
      {
        mcpServers: {
          'craft-ts-logs': { command: 'npx', args: ['craft-ts-log-mcp'] },
        },
      },
      null,
      2,
    ),
    '.gitignore': 'node_modules/\ndist/\n',
    '.claude/skills/craft-ts-project/SKILL.md': '# existing project skill\n',
    ...files,
  };
  await Promise.all(
    Object.entries(contents).map(async ([file, body]) => {
      await mkdir(join(root, file, '..'), { recursive: true });
      await writeFile(join(root, file), body, 'utf8');
    }),
  );
  return root;
}

const read = async (root: string, file: string) =>
  readFile(join(root, file), 'utf8');

describe('craft agents sync', () => {
  it('detects the agents a project already uses', async () => {
    const root = await existingProject({ '.cursor/rules/craft-ts.mdc': 'x\n' });

    expect(detectAgents(root)).toEqual(['cursor', 'claude-code']);
  });

  it('adds the graph wiring without disturbing what the project already has', async () => {
    const root = await existingProject();

    const result = runAgentSync({ rootDir: root });

    expect(result.agents).toEqual(['claude-code']);
    expect(result.changed).toBe(true);

    const mcp = JSON.parse(await read(root, '.mcp.json')) as {
      mcpServers: Record<string, unknown>;
    };
    expect(Object.keys(mcp.mcpServers)).toEqual([
      'craft-ts-logs',
      'craft-ts-graph',
    ]);

    const packageJson = JSON.parse(await read(root, 'package.json')) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(packageJson.scripts).toMatchObject({
      dev: 'node scripts/dev.mjs',
      'logs:mcp': 'craft-ts-log-mcp',
      graph: expect.stringContaining('craft-graph'),
      'graph:mcp': 'craft-ts-graph-mcp',
    });
    // The version follows the Craft packages the project already pins.
    expect(packageJson.devDependencies['@craft-ts/graph-mcp']).toBe(
      '^0.7.0-beta.9',
    );

    expect(await read(root, '.gitignore')).toBe(
      'node_modules/\ndist/\ncraft-dependency-graph.*\n',
    );
    expect(await read(root, '.claude/skills/craft-ts-graph-mcp/SKILL.md')).toContain(
      'name: craft-ts-graph-mcp',
    );
    expect(await read(root, '.claude/hooks/graph-first.mjs')).toContain(
      'graph.search',
    );
    // The project's own skill is left alone.
    expect(await read(root, '.claude/skills/craft-ts-project/SKILL.md')).toBe(
      '# existing project skill\n',
    );
  });

  it('keeps hooks the project already declared', async () => {
    const root = await existingProject({
      '.claude/settings.json': JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              { matcher: 'Bash', hooks: [{ type: 'command', command: './audit.sh' }] },
            ],
          },
          permissions: { allow: ['Bash(npm test)'] },
        },
        null,
        2,
      ),
    });

    runAgentSync({ rootDir: root });

    const settings = JSON.parse(await read(root, '.claude/settings.json')) as {
      hooks: { PreToolUse: { matcher: string }[] };
      permissions: unknown;
    };
    expect(settings.hooks.PreToolUse.map((entry) => entry.matcher)).toEqual([
      'Bash',
      'Grep|Glob',
    ]);
    expect(settings.permissions).toEqual({ allow: ['Bash(npm test)'] });
  });

  it('changes nothing on a second run', async () => {
    const root = await existingProject();
    runAgentSync({ rootDir: root });

    const second = runAgentSync({ rootDir: root });

    expect(second.changed).toBe(false);
    expect(second.changes.every((change) => change.action !== 'created')).toBe(
      true,
    );
  });

  it('writes nothing on a dry run', async () => {
    const root = await existingProject();

    const result = runAgentSync({ rootDir: root, dryRun: true });

    expect(result.changed).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(existsSync(join(root, '.claude/hooks/graph-first.mjs'))).toBe(false);
    expect(await read(root, '.gitignore')).toBe('node_modules/\ndist/\n');
  });

  it('accepts agents the project has no directory for yet', async () => {
    const root = await existingProject();

    const result = runAgentSync({ rootDir: root, agents: ['codex'] });

    expect(result.agents).toEqual(['codex']);
    expect(
      await read(root, '.agents/skills/craft-ts-graph-mcp/SKILL.md'),
    ).toContain('name: craft-ts-graph-mcp');
    expect(JSON.parse(await read(root, '.codex/hooks.json'))).toMatchObject({
      hooks: { SessionStart: [{ matcher: 'startup' }] },
    });
  });

  it('reports a directory without a package.json instead of failing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'craft-agents-sync-bare-'));
    temporaryDirectories.push(root);

    const result = runAgentSync({ rootDir: root, agents: ['claude-code'] });

    expect(
      result.changes.find((change) => change.file === 'package.json'),
    ).toMatchObject({ action: 'skipped' });
  });
});
