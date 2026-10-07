/**
 * Turns code into tokens the `DocCode` component understands.
 *
 * The grammar scopes come from shiki (TextMate); what the design system knows
 * is a closed set of word kinds. The mapping is the only place the two meet,
 * and the colours never do: shiki's own colours are ignored.
 */
import {
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
} from 'shiki';
import type { CodeLine, CodeToken, LineMark, TokenKind } from '../code/code.ts';

const LANGUAGES = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'bash',
  'json',
  'html',
  'css',
  'yaml',
  'markdown',
  'diff',
] as const;

const ALIASES: Readonly<Record<string, string>> = {
  ts: 'typescript',
  typescript: 'typescript',
  js: 'javascript',
  javascript: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  tsx: 'tsx',
  jsx: 'jsx',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  zsh: 'bash',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  vue: 'html',
  css: 'css',
  yaml: 'yaml',
  yml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  diff: 'diff',
};

/** The shiki language for a fence's, or a file extension's, name. */
export const languageOf = (name: string | undefined): string | undefined =>
  name ? ALIASES[name.toLowerCase()] : undefined;

/**
 * Most specific scope first: the last scope on the list is the narrowest, and
 * `entity.name.function` must win over the `meta.function-call` around it.
 */
export const kindOfScopes = (
  scopes: readonly string[],
): TokenKind | undefined => {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index] as string;
    if (scope.startsWith('comment')) return 'comment';
    if (scope.startsWith('string')) return 'string';
    if (scope.startsWith('constant.numeric')) return 'number';
    if (scope.startsWith('constant.language')) return 'keyword';
    if (scope.startsWith('keyword') || scope.startsWith('storage'))
      return 'keyword';
    if (
      scope.startsWith('entity.name.function') ||
      scope.startsWith('support.function') ||
      scope.startsWith('meta.function-call')
    )
      return 'function';
    if (
      scope.startsWith('entity.name.type') ||
      scope.startsWith('entity.name.class') ||
      scope.startsWith('support.type') ||
      scope.startsWith('support.class') ||
      scope.startsWith('entity.other.inherited-class')
    )
      return 'type';
    if (
      scope.startsWith('punctuation') ||
      scope.startsWith('meta.brace') ||
      scope.startsWith('meta.delimiter')
    )
      return 'punctuation';
  }
  return undefined;
};

const MARKER =
  /\s*(?:\/\/|#|\/\*|<!--)\s*\[!code\s+(\+\+|--|highlight|focus|error|warning)\]\s*(?:\*\/|-->)?\s*$/;

const MARK_OF: Readonly<Record<string, LineMark | 'focus'>> = {
  '++': 'add',
  '--': 'remove',
  highlight: 'highlight',
  focus: 'focus',
  error: 'error',
  warning: 'warning',
};

export interface MarkedCode {
  readonly lines: readonly string[];
  readonly marks: readonly (LineMark | 'focus' | undefined)[];
}

/** Strips `// [!code ++]`-style markers off the lines and records them. */
export const extractMarkers = (lines: readonly string[]): MarkedCode => {
  const marks: (LineMark | 'focus' | undefined)[] = [];
  const cleaned = lines.map((line) => {
    const match = MARKER.exec(line);
    if (!match) {
      marks.push(undefined);
      return line;
    }
    marks.push(MARK_OF[match[1] as string]);
    return line.slice(0, match.index);
  });
  return { lines: cleaned, marks };
};

export interface CodeHighlighter {
  /** Tokens for each line. An unknown language comes back as plain text. */
  readonly tokenize: (
    lines: readonly string[],
    language: string | undefined,
  ) => readonly (readonly CodeToken[])[];
  /** Marks, markers and meta highlights folded into ready-to-render lines. */
  readonly lines: (
    code: readonly string[],
    language: string | undefined,
    highlighted?: readonly number[],
    firstLine?: number,
  ) => readonly CodeLine[];
  readonly dispose: () => void;
}

const plain = (lines: readonly string[]): CodeToken[][] =>
  lines.map((line) => (line === '' ? [] : [{ text: line }]));

export async function createCodeHighlighter(): Promise<CodeHighlighter> {
  const highlighter: Highlighter = await createHighlighter({
    themes: ['github-dark'],
    langs: [...LANGUAGES],
  });

  const tokenize: CodeHighlighter['tokenize'] = (lines, language) => {
    const lang = languageOf(language);
    if (!lang) return plain(lines);
    const { tokens } = highlighter.codeToTokens(lines.join('\n'), {
      lang: lang as BundledLanguage,
      theme: 'github-dark',
      includeExplanation: true,
    });
    return tokens.map((line) =>
      line.flatMap((token): CodeToken[] => {
        if (token.content === '') return [];
        const scopes =
          token.explanation?.flatMap((part) =>
            part.scopes.map((scope) => scope.scopeName),
          ) ?? [];
        const kind = kindOfScopes(scopes);
        return [{ text: token.content, ...(kind ? { kind } : {}) }];
      }),
    );
  };

  return {
    tokenize,
    lines(code, language, highlighted = [], firstLine = 1) {
      const { lines, marks } = extractMarkers(code);
      const tokens = tokenize(lines, language);
      const hasFocus = marks.includes('focus');
      return lines.map((_, index): CodeLine => {
        const explicit = marks[index];
        const meta = highlighted.includes(firstLine + index);
        const mark: LineMark | undefined =
          explicit && explicit !== 'focus'
            ? explicit
            : meta
              ? 'highlight'
              : hasFocus && explicit !== 'focus'
                ? 'dim'
                : undefined;
        return { tokens: tokens[index] ?? [], ...(mark ? { mark } : {}) };
      });
    },
    dispose: () => highlighter.dispose(),
  };
}
