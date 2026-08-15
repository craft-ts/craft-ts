import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOCS_ORIGIN, type DocPage, type SkillRecord } from './catalog.js';

export const LLMS_TXT_URL = `${DOCS_ORIGIN}/llms.txt`;
export const LLMS_FULL_TXT_URL = `${DOCS_ORIGIN}/llms-full.txt`;

export type CraftMcpResources = {
  pages: DocPage[];
  skills: SkillRecord[];
  bestPractices: string;
  agentsMd: string;
};

function packageRootFrom(moduleUrl: string): string {
  return join(dirname(fileURLToPath(moduleUrl)), '..');
}

function parseSkillFrontmatter(markdown: string): {
  name: string;
  description: string;
  body: string;
} {
  if (!markdown.startsWith('---')) {
    throw new Error('Skill is missing YAML frontmatter.');
  }
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) {
    throw new Error('Skill frontmatter is not closed.');
  }
  const frontmatter = markdown.slice(3, end);
  const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
  const description = /^description:\s*(.+)$/m
    .exec(frontmatter)?.[1]
    ?.trim();
  if (!name || !description) {
    throw new Error('Skill frontmatter must include name and description.');
  }
  return { name, description, body: markdown };
}

function loadSkill(directory: string): SkillRecord {
  const markdown = readFileSync(join(directory, 'SKILL.md'), 'utf8');
  const parsed = parseSkillFrontmatter(markdown);
  const references: Record<string, string> = {};
  const referencesDir = join(directory, 'references');
  if (existsSync(referencesDir)) {
    for (const file of readdirSync(referencesDir)) {
      if (!file.endsWith('.md')) continue;
      references[file] = readFileSync(join(referencesDir, file), 'utf8');
    }
  }
  return {
    name: parsed.name,
    description: parsed.description,
    markdown: parsed.body,
    references,
  };
}

export function loadCraftMcpResources(
  moduleUrl = import.meta.url,
): CraftMcpResources {
  const root = packageRootFrom(moduleUrl);
  const pages = JSON.parse(
    readFileSync(join(root, 'content/docs-index.json'), 'utf8'),
  ) as DocPage[];
  const skillsRoot = join(root, 'skills');
  const skills = readdirSync(skillsRoot)
    .map((name) => join(skillsRoot, name))
    .filter((directory) => existsSync(join(directory, 'SKILL.md')))
    .map(loadSkill)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    pages,
    skills,
    bestPractices: readFileSync(
      join(root, 'content/best-practices.md'),
      'utf8',
    ),
    agentsMd: readFileSync(join(root, 'content/agents.md'), 'utf8'),
  };
}
