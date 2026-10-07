import {
  craftComponent,
  div,
  h,
  span,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import { DocCopyButton } from './copy-button.ts';
import { codeUi } from './code.style.ts';

/** What kind of word a token is. `undefined` is plain text. */
export type TokenKind =
  | 'keyword'
  | 'function'
  | 'string'
  | 'number'
  | 'type'
  | 'comment'
  | 'punctuation';

/** What a line means. `undefined` is an ordinary line. */
export type LineMark =
  | 'highlight'
  | 'add'
  | 'remove'
  | 'error'
  | 'warning'
  | 'dim';

export interface CodeToken {
  readonly text: string;
  readonly kind?: TokenKind;
}

export interface CodeLine {
  readonly tokens: readonly CodeToken[];
  readonly mark?: LineMark;
}

export interface CodeInput {
  readonly lines: Input<readonly CodeLine[]>;
  /** A file name shown in the header. Empty means no header name. */
  readonly filename: Input<string>;
  /** The language label shown in the header. Empty means none. */
  readonly language: Input<string>;
  /** Show the line numbers. */
  readonly numbered: Input<boolean>;
  /**
   * First line number, for an excerpt (`<<< file{3-9}` starts at 3). Not named
   * like an HTML attribute: `lang`, `start` or `title` as an input name is read
   * as the host's attribute and shifts every input after it, silently.
   */
  readonly firstLine: Input<number>;
}

const GLYPH: Readonly<Record<LineMark, string>> = {
  highlight: ' ',
  add: '+',
  remove: '-',
  error: '!',
  warning: '!',
  dim: ' ',
};

const renderLine = (
  line: CodeLine,
  position: number,
  numbered: boolean,
  hasMarks: boolean,
): CraftNodeChild => {
  const parts: CraftNodeChild[] = [];
  if (numbered) {
    parts.push(
      span(
        { class: codeUi.number, 'aria-hidden': 'true' },
        String(position),
      ),
    );
  }
  if (hasMarks) {
    parts.push(
      span(
        {
          class: codeUi.glyph,
          'aria-hidden': 'true',
          'data-mark': line.mark ?? 'highlight',
        },
        line.mark ? GLYPH[line.mark] : ' ',
      ),
    );
  }
  for (const token of line.tokens) {
    parts.push(
      span(
        { class: codeUi.token, 'data-syntax': token.kind ?? 'plain' },
        token.text,
      ),
    );
  }
  parts.push('\n');
  return span(
    { class: codeUi.line, 'data-mark': line.mark ?? 'none' },
    parts,
  );
};

/** The code as plain text: what "Copy" puts on the clipboard. */
export const codeText = (lines: readonly CodeLine[]): string =>
  lines.map((line) => line.tokens.map((token) => token.text).join('')).join('\n');

export const DocCode = craftComponent('DocCode', {}, function* (
  input: CodeInput,
) {
  const lines = yield* input.lines();
  const filename = yield* input.filename();
  const language = yield* input.language();
  const numbered = yield* input.numbered();
  const firstLine = yield* input.firstLine();
  const hasMarks = lines.some((line) => line.mark && line.mark !== 'dim');

  const source = codeText(lines);

  const parts: CraftNodeChild[] = [
    div({ class: codeUi.bar }, [
      span({ class: codeUi.name }, filename),
      div({ class: codeUi.tools }, [
        span({ class: codeUi.lang }, language),
        DocCopyButton({
          text: function* () {
            return source;
          },
        }),
      ]),
    ]),
  ];
  // Focusable on purpose: a block that scrolls sideways must be reachable and
  // scrollable from the keyboard.
  parts.push(
    h(
      'pre',
      { class: codeUi.body, tabindex: 0, 'aria-label': filename || 'Code' },
      [
        h(
          'code',
          lines.map((line, index) =>
            renderLine(line, firstLine + index, numbered, hasMarks),
          ),
        ),
      ],
    ),
  );
  return div({ class: codeUi.root }, parts);
});
