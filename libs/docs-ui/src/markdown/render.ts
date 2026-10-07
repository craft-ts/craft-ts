/**
 * Document tree → craft nodes.
 *
 * Every block of the tree has exactly one place here, and the place is a
 * component or a sheet class, never a string of HTML: `callout` is a
 * `DocCallout`, `code` is a `DocCode`, a heading is an `h2` carrying a class
 * from the prose sheet.
 */
import {
  a,
  content,
  craftComponent,
  details,
  div,
  h,
  img,
  li,
  ol,
  p,
  strong,
  summary,
  table,
  tbody,
  td,
  th,
  thead,
  tr,
  ul,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import { calloutCaption, DocCallout } from '../callout/callout.ts';
import { DocCode } from '../code/code.ts';
import { DocCodeGroup } from '../code/code-group.ts';
import { proseUi } from '../prose/prose.style.ts';
import type { Block, CodeBlock, Inline } from './tree.ts';

/** Components an author names in a page (`<AuthorNote />`), supplied by the app. */
export type DocComponents = Readonly<Record<string, () => CraftNodeChild>>;

const HEADING_CLASS = {
  1: proseUi.h1,
  2: proseUi.h2,
  3: proseUi.h3,
  4: proseUi.h4,
  5: proseUi.h4,
  6: proseUi.h4,
} as const;

export const renderInlines = (inlines: readonly Inline[]): CraftNodeChild[] =>
  inlines.map((node): CraftNodeChild => {
    switch (node.t) {
      case 'text':
        return node.text;
      case 'code':
        return h('code', { class: proseUi.inlineCode }, node.text);
      case 'kbd':
        return h('kbd', { class: proseUi.kbd }, node.text);
      case 'strong':
        return strong(renderInlines(node.children));
      case 'em':
        return h('em', renderInlines(node.children));
      case 'del':
        return h('del', renderInlines(node.children));
      case 'link':
        return node.external
          ? a(
              { href: node.href, class: proseUi.link, rel: 'noopener noreferrer' },
              renderInlines(node.children),
            )
          : a({ href: node.href, class: proseUi.link }, renderInlines(node.children));
      case 'image':
        return img({ src: node.src, alt: node.alt, loading: 'lazy' });
      case 'break':
        return h('br');
    }
  });

/**
 * `path` names where a block sits in the tree (`0-2-1`). It is what makes the
 * ARIA ids of a code group stable: the same page renders the same ids on the
 * server and in the browser, which a running counter could not promise.
 */
export const renderBlocks = (
  blocks: readonly Block[],
  components: DocComponents,
  path = '',
): CraftNodeChild[] =>
  blocks.map((block, index) =>
    renderBlock(block, components, `${path}${index}`),
  );

function renderBlock(
  block: Block,
  components: DocComponents,
  path: string,
): CraftNodeChild {
  switch (block.t) {
    case 'heading': {
      return h(`h${block.level}`, { id: block.id, class: HEADING_CLASS[block.level] }, [
        ...renderInlines(block.children),
        a(
          {
            href: `#${block.id}`,
            class: proseUi.anchor,
            'aria-label': 'Permalink to this section',
          },
          '#',
        ),
      ]);
    }
    case 'paragraph':
      return p({ class: proseUi.paragraph }, renderInlines(block.children));
    case 'list': {
      const items = block.items.map((item) =>
        li({ class: proseUi.item }, renderBlocks(item, components, `${path}-`)),
      );
      return block.ordered
        ? ol({ class: proseUi.orderedList }, items)
        : ul({ class: proseUi.list }, items);
    }
    case 'quote':
      return h('blockquote', { class: proseUi.quote }, renderBlocks(block.children, components, `${path}-`));
    case 'rule':
      return h('hr', { class: proseUi.rule });
    case 'table':
      return div({ class: proseUi.tableWrap }, [
        table({ class: proseUi.table }, [
          thead([
            tr(block.head.map((cell) => th({ class: proseUi.th }, renderInlines(cell)))),
          ]),
          tbody(
            block.rows.map((row) =>
              tr(row.map((cell) => td({ class: proseUi.td }, renderInlines(cell)))),
            ),
          ),
        ]),
      ]);
    case 'callout': {
      const { tone, caption, children } = block;
      return DocCallout({
        tone: function* () {
          return tone;
        },
        caption: function* () {
          return calloutCaption(tone, caption);
        },
        body: content(() => renderBlocks(children, components, `${path}-`)),
      });
    }
    case 'details':
      return details({ class: proseUi.details }, [
        summary({ class: proseUi.summary }, block.summary),
        div({ class: proseUi.detailsBody }, renderBlocks(block.children, components, `${path}-`)),
      ]);
    case 'raw':
      return div({ class: proseUi.raw }, renderBlocks(block.children, components, `${path}-`));
    case 'row':
      return div(
        {
          class: proseUi.row,
          ...(block.layout === 'start' ? {} : { 'data-layout': block.layout }),
        },
        renderBlocks(block.children, components, `${path}-`),
      );
    case 'figure':
      return div({ class: proseUi.figure, 'data-variant': block.variant }, [
        img({ src: block.src, alt: block.alt, loading: 'lazy' }),
      ]);
    case 'component': {
      const render = components[block.name];
      return render
        ? render()
        : p({ class: proseUi.paragraph }, `Component ${block.name} is not registered.`);
    }
    case 'code':
      return renderCode(block);
    case 'codeGroup': {
      const { tabs } = block;
      const group = `code-group-${path}`;
      return DocCodeGroup({
        tabs: function* () {
          return tabs.map((tab) => ({
            label: tab.label,
            render: () => renderCode(tab.block),
          }));
        },
        group: function* () {
          return group;
        },
      });
    }
  }
}

function renderCode(block: CodeBlock): CraftNodeChild {
  const { lines, filename, language, numbered, firstLine } = block;
  return DocCode({
    lines: function* () {
      return lines;
    },
    filename: function* () {
      return filename;
    },
    language: function* () {
      return language;
    },
    numbered: function* () {
      return numbered;
    },
    firstLine: function* () {
      return firstLine;
    },
  });
}

export interface DocPageInput {
  readonly blocks: Input<readonly Block[]>;
  readonly components: Input<DocComponents>;
}

/** A whole parsed page: the tree, rendered inside the prose column. */
export const DocPage = craftComponent('DocPage', {}, function* (input: DocPageInput) {
  const blocks = yield* input.blocks();
  const components = yield* input.components();
  return div({ class: proseUi.page }, renderBlocks(blocks, components));
});
