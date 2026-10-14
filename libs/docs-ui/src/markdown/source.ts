/**
 * A page as the Markdown an agent reads: the source, with what only the site
 * understands written out.
 *
 * `<<< @/path/file.ts#region` is a build-time import of the site's pipeline; an agent
 * that fetches the `.md` of a page has no pipeline, so each import becomes the
 * fenced code block it stands for, and a line that is only a layout tag or a component
 * of the site is dropped (what is between them stays). Everything else is left as
 * written, the `:::` containers included: they read as plain text. Of the frontmatter
 * only the description is kept, after the `url`.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { extractRegion, parseSnippetDirective } from './snippet.ts';

export interface MarkdownSourceOptions {
  /** The docs folder: `@/` in an import is relative to it. */
  readonly srcRoot: string;
  /** The page's own file, for an import written relative to it. */
  readonly filePath: string;
  /** Where the Markdown is served, written at the top of the file: `https://…/guide/a.md`. */
  readonly url: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const FENCE = /^\s*(`{3,}|~{3,})/;
/** A line that is only a layout tag or a component of the site: `<div style=…>`, `</div>`, `<img … />`, `<AuthorNote />`. */
const LAYOUT_TAG = /^\s*<\/?(?:div|img|[A-Z]\w*)\b[^>]*>\s*$/;

/** What the page says about itself, the one thing of its frontmatter an agent can use. */
const descriptionOf = (frontmatter: string | undefined): string => {
  if (!frontmatter) return '';
  try {
    const data: unknown = parseYaml(frontmatter);
    const description = (data as { description?: unknown } | null)?.description;
    return typeof description === 'string' && description.trim()
      ? stringifyYaml({ description })
      : '';
  } catch {
    return '';
  }
};

const languageOfFile = (file: string): string => path.extname(file).replace('.', '');

/** A fence longer than any run of backticks in the code, so the code cannot end it. */
const fenceFor = (lines: readonly string[]): string => {
  const longest = lines.reduce(
    (most, line) => Math.max(most, ...(line.match(/`+/g) ?? []).map((run) => run.length)),
    0,
  );
  return '`'.repeat(Math.max(3, longest + 1));
};

export const renderMarkdownSource = (
  source: string,
  options: MarkdownSourceOptions,
): string => {
  const description = descriptionOf(FRONTMATTER.exec(source)?.[1]);
  const body = source.replace(FRONTMATTER, '');
  const out: string[] = [];
  let fence: string | undefined;

  for (const line of body.split(/\r?\n/)) {
    const opens = FENCE.exec(line)?.[1];
    if (fence) {
      if (opens && opens[0] === fence[0] && opens.length >= fence.length) fence = undefined;
      out.push(line);
      continue;
    }
    if (opens) {
      fence = opens;
      out.push(line);
      continue;
    }
    if (LAYOUT_TAG.test(line)) continue;
    const directive = parseSnippetDirective(line);
    if (!directive) {
      out.push(line);
      continue;
    }
    const resolved = directive.path.startsWith('@/')
      ? path.join(options.srcRoot, directive.path.slice(2))
      : path.resolve(path.dirname(options.filePath), directive.path);
    let text: string;
    try {
      text = readFileSync(resolved, 'utf8');
    } catch {
      // The parser reports a missing import; the Markdown keeps the line.
      out.push(line);
      continue;
    }
    const extracted = extractRegion(text, directive.region);
    if (!extracted.found) {
      out.push(line);
      continue;
    }
    const mark = fenceFor(extracted.lines);
    const language = directive.language ?? languageOfFile(resolved);
    out.push(
      `${mark}${language}${directive.title ? ` [${directive.title}]` : ''}`,
      ...extracted.lines,
      mark,
    );
  }

  return `---\nurl: ${options.url}\n${description}---\n${out.join('\n').replace(/^\n+/, '')}`;
};
