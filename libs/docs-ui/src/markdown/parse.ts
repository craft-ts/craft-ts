/**
 * Markdown → document tree, with the VitePress extensions the docs rely on:
 * `:::` containers, GitHub alerts, `<<<` code imports, fence meta and
 * `[!code …]` line markers.
 *
 * Node-side and build-time: it reads files (`<<<`) and loads grammars. The tree
 * it returns is plain data; nothing here touches a component.
 */
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import MarkdownIt from 'markdown-it';
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import type { CalloutTone } from '../callout/callout.ts';
import {
  languageOf,
  type CodeHighlighter,
} from './highlight.ts';
import {
  extractRegion,
  parseLineRanges,
  parseSnippetDirective,
} from './snippet.ts';
import type {
  Block,
  CodeBlock,
  Diagnostic,
  Inline,
  Outline,
  ParsedPage,
} from './tree.ts';

export interface ParseOptions {
  /** What `@/` means in a `<<<` import: the docs source root. */
  readonly srcRoot: string;
  /** The page being parsed, for relative `<<<` paths and for messages. */
  readonly filePath?: string;
  readonly highlighter: CodeHighlighter;
}

// ─── block rules ────────────────────────────────────────────────────────────

const CONTAINER_OPEN = /^(:{3,})\s*([a-z][a-z-]*)(?:\s+(.*))?$/;
const CONTAINER_CLOSE = /^:{3,}$/;

function containerRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
  const first = state.src
    .slice(
      state.bMarks[startLine]! + state.tShift[startLine]!,
      state.eMarks[startLine]!,
    )
    .trimEnd();
  const match = CONTAINER_OPEN.exec(first);
  if (!match) return false;
  if (silent) return true;

  const markerLength = (match[1] as string).length;
  let nextLine = startLine;
  let closed = false;
  while (++nextLine < endLine) {
    const from = state.bMarks[nextLine]! + state.tShift[nextLine]!;
    const to = state.eMarks[nextLine]!;
    if (from < to && state.sCount[nextLine]! < state.blkIndent) break;
    const line = state.src.slice(from, to).trim();
    if (CONTAINER_CLOSE.test(line) && line.length >= markerLength) {
      closed = true;
      break;
    }
  }

  const parentType = state.parentType;
  const lineMax = state.lineMax;
  state.parentType = 'container' as typeof state.parentType;
  state.lineMax = nextLine;

  const open = state.push('container_open', 'div', 1);
  open.block = true;
  open.map = [startLine, nextLine];
  open.meta = { name: match[2] as string, title: (match[3] ?? '').trim() };
  state.md.block.tokenize(state, startLine + 1, nextLine);
  const close = state.push('container_close', 'div', -1);
  close.block = true;

  state.parentType = parentType;
  state.lineMax = lineMax;
  state.line = nextLine + (closed ? 1 : 0);
  return true;
}

function snippetRule(
  state: StateBlock,
  startLine: number,
  _endLine: number,
  silent: boolean,
): boolean {
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
  const line = state.src
    .slice(
      state.bMarks[startLine]! + state.tShift[startLine]!,
      state.eMarks[startLine]!,
    )
    .trimEnd();
  if (!line.startsWith('<<<')) return false;
  const directive = parseSnippetDirective(line);
  if (!directive) return false;
  if (silent) return true;

  const token = state.push('snippet', 'code', 0);
  token.block = true;
  token.map = [startLine, startLine + 1];
  token.meta = directive;
  state.line = startLine + 1;
  return true;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const GITHUB_ALERTS: Readonly<Record<string, CalloutTone>> = {
  NOTE: 'info',
  TIP: 'tip',
  IMPORTANT: 'important',
  WARNING: 'warning',
  CAUTION: 'danger',
};

const CONTAINER_TONES: Readonly<Record<string, CalloutTone>> = {
  info: 'info',
  tip: 'tip',
  warning: 'warning',
  danger: 'danger',
};

const PLAIN_LANGUAGES = new Set(['', 'text', 'txt', 'plaintext', 'plain']);

const isExternal = (href: string): boolean =>
  /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');

const closeOf = (tokens: readonly Token[], open: number): number => {
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    depth += tokens[index]!.nesting;
    if (depth === 0) return index;
  }
  return tokens.length - 1;
};

/** The `</div>` block that closes the `<div>` block at `open`, or -1. */
const matchingDiv = (tokens: readonly Token[], open: number): number => {
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.type !== 'html_block') continue;
    const html = token.content.trim();
    if (/^<div\b[^>]*>$/.test(html)) depth += 1;
    else if (html === '</div>') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
};

const rowLayout = (html: string): 'start' | 'between' | 'end' =>
  /justify-content:\s*space-between/.test(html)
    ? 'between'
    : /text-align:\s*right/.test(html)
      ? 'end'
      : 'start';

const textOf = (inlines: readonly Inline[]): string =>
  inlines
    .map((node) => {
      switch (node.t) {
        case 'text':
        case 'code':
        case 'kbd':
          return node.text;
        case 'strong':
        case 'em':
        case 'del':
        case 'link':
          return textOf(node.children);
        case 'image':
          return node.alt;
        case 'break':
          return ' ';
      }
    })
    .join('');

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Scalars only (`layout: home`, `outline: false`): all the docs use. */
const parseFrontmatter = (
  source: string,
): { body: string; data: Record<string, string | number | boolean> } => {
  const match = FRONTMATTER.exec(source);
  if (!match) return { body: source, data: {} };
  const data: Record<string, string | number | boolean> = {};
  for (const line of (match[1] as string).split(/\r?\n/)) {
    const pair = /^([\w-]+):\s*(.*?)\s*$/.exec(line);
    if (!pair) continue;
    const raw = (pair[2] as string).replace(/^['"]|['"]$/g, '');
    data[pair[1] as string] =
      raw === 'true' ? true : raw === 'false' ? false : /^-?\d+$/.test(raw) ? Number(raw) : raw;
  }
  return { body: source.slice(match[0].length), data };
};

// ─── the parser ─────────────────────────────────────────────────────────────

export async function parsePage(
  source: string,
  options: ParseOptions,
): Promise<ParsedPage> {
  const { body, data } = parseFrontmatter(source);
  const md = new MarkdownIt({ html: true, linkify: false });
  md.block.ruler.before('fence', 'doc_container', containerRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.block.ruler.before('fence', 'doc_snippet', snippetRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });

  const diagnostics: Diagnostic[] = [];
  const outline: Outline[] = [];
  const seen = new Map<string, number>();
  const report = (diagnostic: Diagnostic) => {
    diagnostics.push(diagnostic);
  };

  const uniqueId = (text: string): string => {
    const base = slugify(text) || 'section';
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  };

  const inlines = (tokens: readonly Token[]): Inline[] => {
    const root: Inline[] = [];
    const stack: { open: Token | undefined; children: Inline[] }[] = [
      { open: undefined, children: root },
    ];
    const push = (node: Inline) => stack[stack.length - 1]!.children.push(node);

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!;
      switch (token.type) {
        case 'text':
          push({ t: 'text', text: token.content });
          break;
        case 'code_inline':
          push({ t: 'code', text: token.content });
          break;
        case 'softbreak':
          push({ t: 'text', text: ' ' });
          break;
        case 'hardbreak':
          push({ t: 'break' });
          break;
        case 'image':
          push({
            t: 'image',
            src: token.attrGet('src') ?? '',
            alt: token.content,
          });
          break;
        case 'strong_open':
        case 'em_open':
        case 's_open':
        case 'link_open':
          stack.push({ open: token, children: [] });
          break;
        case 'strong_close':
        case 'em_close':
        case 's_close':
        case 'link_close': {
          const frame = stack.pop()!;
          const href = frame.open?.attrGet('href') ?? '';
          push(
            token.type === 'strong_close'
              ? { t: 'strong', children: frame.children }
              : token.type === 'em_close'
                ? { t: 'em', children: frame.children }
                : token.type === 's_close'
                  ? { t: 'del', children: frame.children }
                  : {
                      t: 'link',
                      href,
                      external: isExternal(href),
                      children: frame.children,
                    },
          );
          break;
        }
        case 'html_inline': {
          const tag = token.content.trim().toLowerCase();
          if (tag === '<kbd>') {
            const text = tokens[index + 1];
            const close = tokens[index + 2];
            if (
              text?.type === 'text' &&
              close?.type === 'html_inline' &&
              close.content.trim().toLowerCase() === '</kbd>'
            ) {
              push({ t: 'kbd', text: text.content });
              index += 2;
              break;
            }
          }
          if (/^<br\s*\/?>$/.test(tag)) {
            push({ t: 'break' });
            break;
          }
          report({
            kind: 'html-inline',
            message: `Inline HTML ${token.content.trim()} has no component.`,
          });
          break;
        }
        default:
          break;
      }
    }
    return root;
  };

  const codeBlock = (
    code: readonly string[],
    language: string | undefined,
    highlight: readonly number[],
    extra: { filename?: string; numbered?: boolean; firstLine?: number } = {},
  ): CodeBlock => {
    if (language && !PLAIN_LANGUAGES.has(language) && !languageOf(language)) {
      report({
        kind: 'unknown-language',
        message: `No grammar for '${language}': rendered as plain text.`,
      });
    }
    return {
      t: 'code',
      lines: options.highlighter.lines(code, language, highlight, 1),
      filename: extra.filename ?? '',
      language: language && !PLAIN_LANGUAGES.has(language) ? language : '',
      numbered: extra.numbered ?? false,
      firstLine: extra.firstLine ?? 1,
    };
  };

  const fenceBlock = (token: Token): CodeBlock => {
    const info = token.info.trim();
    const language = /^[\w+#-]+/.exec(info)?.[0];
    const meta = language ? info.slice(language.length) : info;
    const numbered =
      /:line-numbers/.test(meta) && !/:no-line-numbers/.test(meta);
    const highlight = parseLineRanges(/\{([\d,\- ]+)\}/.exec(meta)?.[1]);
    const title = /\[(.*?)\]/.exec(meta)?.[1];
    const code = token.content.replace(/\n$/, '').split('\n');
    return codeBlock(code, language, highlight, {
      numbered,
      ...(title ? { filename: title } : {}),
    });
  };

  const snippetBlock = (token: Token): Block => {
    const directive = token.meta as ReturnType<typeof parseSnippetDirective> & {
      path: string;
    };
    const resolved = directive.path.startsWith('@/')
      ? path.join(options.srcRoot, directive.path.slice(2))
      : path.resolve(
          path.dirname(options.filePath ?? options.srcRoot),
          directive.path,
        );
    let text: string;
    try {
      text = readFileSync(resolved, 'utf8');
    } catch {
      report({
        kind: 'snippet-missing',
        message: `Cannot read ${directive.path} (${resolved}).`,
        ...(token.map ? { line: token.map[0] + 1 } : {}),
      });
      return codeBlock([`// missing snippet: ${directive.path}`], 'ts', []);
    }
    const extracted = extractRegion(text, directive.region);
    if (!extracted.found) {
      report({
        kind: 'snippet-region-missing',
        message: `Region '${directive.region}' not found in ${directive.path}.`,
        ...(token.map ? { line: token.map[0] + 1 } : {}),
      });
    }
    const language =
      directive.language ?? path.extname(resolved).replace('.', '');
    return codeBlock(extracted.lines, language, directive.highlight ?? [], {
      ...(directive.title ? { filename: directive.title } : {}),
    });
  };

  const blocks = (tokens: readonly Token[]): Block[] => {
    const out: Block[] = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!;
      switch (token.type) {
        case 'heading_open': {
          const level = Number(token.tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6;
          const children = inlines(tokens[index + 1]?.children ?? []);
          const text = textOf(children);
          const id = uniqueId(text);
          if (level === 2 || level === 3) outline.push({ level, id, text });
          out.push({ t: 'heading', level, id, children });
          index += 2;
          break;
        }
        case 'paragraph_open':
          out.push({
            t: 'paragraph',
            children: inlines(tokens[index + 1]?.children ?? []),
          });
          index += 2;
          break;
        case 'bullet_list_open':
        case 'ordered_list_open': {
          const end = closeOf(tokens, index);
          const items: Block[][] = [];
          for (let item = index + 1; item < end; item += 1) {
            if (tokens[item]!.type === 'list_item_open') {
              const itemEnd = closeOf(tokens, item);
              items.push(blocks(tokens.slice(item + 1, itemEnd)));
              item = itemEnd;
            }
          }
          out.push({
            t: 'list',
            ordered: token.type === 'ordered_list_open',
            items,
          });
          index = end;
          break;
        }
        case 'blockquote_open': {
          const end = closeOf(tokens, index);
          const inner = blocks(tokens.slice(index + 1, end));
          const alert = githubAlert(inner);
          out.push(alert ?? { t: 'quote', children: inner });
          index = end;
          break;
        }
        case 'hr':
          out.push({ t: 'rule' });
          break;
        case 'fence':
          out.push(fenceBlock(token));
          break;
        case 'snippet':
          out.push(snippetBlock(token));
          break;
        case 'container_open': {
          const end = closeOf(tokens, index);
          const meta = token.meta as { name: string; title: string };
          const children = blocks(tokens.slice(index + 1, end));
          const tone = CONTAINER_TONES[meta.name];
          if (tone) {
            out.push({ t: 'callout', tone, caption: meta.title, children });
          } else if (meta.name === 'details') {
            out.push({
              t: 'details',
              summary: meta.title || 'Details',
              children,
            });
          } else if (meta.name === 'raw') {
            out.push({ t: 'raw', children });
          } else {
            report({
              kind: meta.name === 'code-group' ? 'code-group' : 'unknown-container',
              message: `Container '${meta.name}' has no component: its content is kept, unwrapped.`,
              ...(token.map ? { line: token.map[0] + 1 } : {}),
            });
            out.push({ t: 'raw', children });
          }
          index = end;
          break;
        }
        case 'table_open': {
          const end = closeOf(tokens, index);
          const head: Inline[][] = [];
          const rows: Inline[][][] = [];
          let current: Inline[][] = [];
          let inHead = false;
          for (let cell = index + 1; cell < end; cell += 1) {
            const part = tokens[cell]!;
            if (part.type === 'thead_open') inHead = true;
            else if (part.type === 'thead_close') inHead = false;
            else if (part.type === 'tr_open') current = [];
            else if (part.type === 'tr_close') {
              if (inHead) head.push(...current.map((c) => c));
              else rows.push(current);
            } else if (part.type === 'inline') {
              current.push(inlines(part.children ?? []));
            }
          }
          out.push({ t: 'table', head, rows });
          index = end;
          break;
        }
        case 'html_block': {
          const html = token.content.trim();
          const component = /^<([A-Z][A-Za-z0-9]*)\s*\/?>(?:<\/\1>)?$/.exec(html);
          if (component) {
            out.push({ t: 'component', name: component[1] as string });
            break;
          }
          const figure =
            /^<div\b([^>]*)>\s*<img\b([^>]*?)\/?>\s*<\/div>$/.exec(html);
          if (figure) {
            const attr = (source: string, name: string) =>
              new RegExp(`\\b${name}="([^"]*)"`).exec(source)?.[1] ?? '';
            out.push({
              t: 'figure',
              src: attr(figure[2] as string, 'src'),
              alt: attr(figure[2] as string, 'alt'),
              variant: attr(figure[1] as string, 'class'),
            });
            break;
          }
          if (/^<div\b[^>]*>$/.test(html)) {
            const end = matchingDiv(tokens, index);
            if (end > index) {
              out.push({
                t: 'row',
                layout: rowLayout(html),
                children: blocks(tokens.slice(index + 1, end)),
              });
              index = end;
              break;
            }
          }
          report({
            kind: 'html-block',
            message: `HTML block has no component: ${html.slice(0, 60)}`,
            ...(token.map ? { line: token.map[0] + 1 } : {}),
          });
          break;
        }
        default:
          break;
      }
    }
    return out;
  };

  const githubAlert = (inner: readonly Block[]): Block | undefined => {
    const first = inner[0];
    if (first?.t !== 'paragraph') return undefined;
    const lead = first.children[0];
    if (lead?.t !== 'text') return undefined;
    const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/.exec(lead.text);
    if (!match) return undefined;
    const rest = first.children.slice(1);
    const remaining: Inline[] = [
      ...(lead.text.length > match[0].length
        ? [{ t: 'text', text: lead.text.slice(match[0].length) } as const]
        : []),
      ...rest,
    ];
    while (remaining[0]?.t === 'break') remaining.shift();
    return {
      t: 'callout',
      tone: GITHUB_ALERTS[match[1] as string] as CalloutTone,
      caption: '',
      children: [
        ...(remaining.length ? [{ t: 'paragraph', children: remaining } as const] : []),
        ...inner.slice(1),
      ],
    };
  };

  const tokens = md.parse(body, {});
  const tree = blocks(tokens);
  return { frontmatter: data, blocks: tree, outline, diagnostics };
}
