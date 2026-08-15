import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');
const workspaceRoot = join(packageRoot, '../..');
const docsRoot = join(workspaceRoot, 'apps/docs');
const outFile = join(packageRoot, 'content/docs-index.json');

const SKIP_DIRS = new Set(['.vitepress', 'node_modules', 'tests', 'public']);

function walkMarkdown(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walkMarkdown(path, acc);
      continue;
    }
    if (extname(name) === '.md') acc.push(path);
  }
  return acc;
}

function stripFrontmatter(markdown) {
  if (!markdown.startsWith('---')) {
    return { body: markdown, description: undefined };
  }
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) {
    return { body: markdown, description: undefined };
  }
  const frontmatter = markdown.slice(3, end);
  const descriptionMatch = /^description:\s*(.+)$/m.exec(frontmatter);
  const description = descriptionMatch
    ? descriptionMatch[1].replace(/^['"]|['"]$/g, '').trim()
    : undefined;
  return { body: markdown.slice(end + 4).trimStart(), description };
}

function toDocsPath(filePath) {
  const rel = relative(docsRoot, filePath).replaceAll('\\', '/');
  let path = `/${rel.replace(/\.md$/, '')}`;
  if (path.endsWith('/index')) {
    path = path.slice(0, -'/index'.length) || '/';
  }
  return path;
}

function parsePage(filePath) {
  const { body, description } = stripFrontmatter(readFileSync(filePath, 'utf8'));
  const titleMatch = /^#\s+(.+)$/m.exec(body);
  return {
    path: toDocsPath(filePath),
    title: titleMatch?.[1]?.trim() ?? toDocsPath(filePath),
    description,
    body: body.replace(/^<<<.+$/gm, ''),
  };
}

const pages = walkMarkdown(docsRoot).map(parsePage).sort((a, b) =>
  a.path.localeCompare(b.path),
);

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(pages, null, 2)}\n`);
process.stdout.write(`Wrote ${pages.length} docs pages to ${outFile}\n`);
