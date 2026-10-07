/**
 * The build-time half of the package.
 *
 * Reading a docs folder, parsing Markdown and highlighting code need Node
 * (`fs`, markdown-it, shiki), so none of it is in the main entry: a browser
 * bundle that imports `@craft-ts/docs-ui` never reaches it. A build imports
 * `@craft-ts/docs-ui/node`, turns the folder into data, and hands that data to
 * the components.
 */
export { parsePage, type ParseOptions } from './markdown/parse.ts';
export {
  createCodeHighlighter,
  type CodeHighlighter,
} from './markdown/highlight.ts';
export * from './site/pages.ts';
export { renderLlmsTxt, type LlmsOptions } from './site/llms.ts';
