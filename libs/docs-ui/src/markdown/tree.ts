/**
 * The document tree: what the Markdown parser produces and the renderer reads.
 *
 * It is plain data, with no HTML in it. A page is parsed once, at build time,
 * into this tree, and the tree is what a component renders. That is what lets
 * `::: tip` become a `DocCallout` instead of a `<div class="tip custom-block">`,
 * and lets a test assert on the structure of a page without a browser.
 */
import type { CalloutTone } from '../callout/callout.ts';
import type { CodeLine } from '../code/code.ts';

export type Inline =
  | { readonly t: 'text'; readonly text: string }
  | { readonly t: 'code'; readonly text: string }
  | { readonly t: 'kbd'; readonly text: string }
  | { readonly t: 'strong'; readonly children: readonly Inline[] }
  | { readonly t: 'em'; readonly children: readonly Inline[] }
  | { readonly t: 'del'; readonly children: readonly Inline[] }
  | {
      readonly t: 'link';
      readonly href: string;
      readonly external: boolean;
      readonly children: readonly Inline[];
    }
  | {
      readonly t: 'image';
      readonly src: string;
      readonly alt: string;
    }
  | { readonly t: 'break' };

export interface HeadingBlock {
  readonly t: 'heading';
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  /** Slug used as the anchor. Unique within a page. */
  readonly id: string;
  readonly children: readonly Inline[];
}

export interface CodeBlock {
  readonly t: 'code';
  readonly lines: readonly CodeLine[];
  readonly filename: string;
  readonly language: string;
  readonly numbered: boolean;
  readonly firstLine: number;
}

export type Block =
  | HeadingBlock
  | { readonly t: 'paragraph'; readonly children: readonly Inline[] }
  | {
      readonly t: 'list';
      readonly ordered: boolean;
      readonly items: readonly (readonly Block[])[];
    }
  | { readonly t: 'quote'; readonly children: readonly Block[] }
  | { readonly t: 'rule' }
  | {
      readonly t: 'table';
      readonly head: readonly (readonly Inline[])[];
      readonly rows: readonly (readonly (readonly Inline[])[])[];
    }
  | {
      readonly t: 'callout';
      readonly tone: CalloutTone;
      readonly caption: string;
      readonly children: readonly Block[];
    }
  | {
      readonly t: 'details';
      readonly summary: string;
      readonly children: readonly Block[];
    }
  | { readonly t: 'raw'; readonly children: readonly Block[] }
  /**
   * A row of blocks, from the `<div style="display: flex; justify-content:
   * space-between">` the lessons use to put "previous" and "next" side by side.
   */
  | {
      readonly t: 'row';
      readonly layout: 'start' | 'between' | 'end';
      readonly children: readonly Block[];
    }
  /**
   * An image on its own, from `<div class="…"><img …></div>`. The class names a
   * variant (a logo lockup); the app decides what it looks like.
   */
  | {
      readonly t: 'figure';
      readonly src: string;
      readonly alt: string;
      readonly variant: string;
    }
  /**
   * `::: code-group`: code blocks under one strip of tabs. Each tab is named by
   * the `[label]` of its fence, or by its language.
   */
  | {
      readonly t: 'codeGroup';
      readonly tabs: readonly { readonly label: string; readonly block: CodeBlock }[];
    }
  /** A component named in the page (`<AuthorNote />`), resolved by the app. */
  | { readonly t: 'component'; readonly name: string }
  | CodeBlock;

/**
 * Something the parser met and could not turn into a component. Collected, never
 * thrown: a page with an unsupported construct still renders, and the report
 * says exactly where the gap is.
 */
export interface Diagnostic {
  readonly kind:
    | 'html-block'
    | 'html-inline'
    | 'unknown-container'
    | 'code-group'
    | 'snippet-missing'
    | 'snippet-region-missing'
    | 'unknown-language';
  readonly message: string;
  readonly line?: number;
}

export interface Outline {
  readonly level: number;
  readonly id: string;
  readonly text: string;
}

export interface ParsedPage {
  readonly frontmatter: Readonly<Record<string, string | number | boolean>>;
  readonly blocks: readonly Block[];
  /** `h2`/`h3` entries, for the "On this page" outline. */
  readonly outline: readonly Outline[];
  readonly diagnostics: readonly Diagnostic[];
}
