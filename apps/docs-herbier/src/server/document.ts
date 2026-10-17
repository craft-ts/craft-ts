import { withBase, type SiteConfig } from '@craft-ts/docs-ui';
import { bootScript } from '@craft-ts/ui';
import { LOCKED_DARK_PATH } from '../locked.ts';
import {
  documentDescription,
  documentTitle,
  markdownFileOfRoute,
  type PageData,
} from '../page-data.ts';

export interface Assets {
  /** Module scripts to run, as paths the browser can fetch. */
  readonly scripts: readonly string[];
  /** Stylesheets, as paths the browser can fetch. */
  readonly styles: readonly string[];
}

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );

/** JSON for a `<script type="application/json">`: `<` is the one character that can end it. */
export const jsonForScript = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(new RegExp('[\\u2028\\u2029]', 'g'), (character) =>
      character === '\\u2028' ? '\\\\u2028' : '\\\\u2029',
    );

export const renderDocument = (options: {
  readonly site: SiteConfig;
  readonly page: PageData;
  /** What `renderCraft` returned: the host, and the state it transfers. */
  readonly html: string;
  readonly assets: Assets;
  readonly dataId: string;
  /**
   * Whether a build wrote the Markdown of this page and `llms.txt` next to it: the head
   * then points an agent at them.
   */
  readonly agentFiles?: boolean;
}): string => {
  const { site, page, assets } = options;
  const title = documentTitle(site.title, page);
  const description = documentDescription(site, page);
  const markdown = options.agentFiles ? markdownFileOfRoute(page.route) : undefined;
  const href = (path: string) => escapeHtml(withBase(site.base, path));
  return `<!doctype html>
<html lang="en-US" data-base="${escapeHtml(site.base)}" data-site-title="${escapeHtml(site.title)}" data-site-description="${escapeHtml(site.description ?? '')}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ''}
    <link rel="icon" href="${href('/assets/craft-ts-logo.png')}" type="image/png" />
${options.agentFiles ? `    <link rel="describedby" href="${href('/llms.txt')}" />\n` : ''}${markdown ? `    <link rel="alternate" type="text/markdown" href="${href(`/${markdown}`)}" />\n` : ''}    <script>${bootScript({ darkPaths: [withBase(site.base, LOCKED_DARK_PATH)] })}</script>
${assets.styles.map((style) => `    <link rel="stylesheet" href="${escapeHtml(style)}" />`).join('\n')}
${assets.scripts.map((script) => `    <link rel="modulepreload" href="${escapeHtml(script)}" />`).join('\n')}
  </head>
  <body>
    ${options.html}
    <script id="${options.dataId}" type="application/json">${jsonForScript({ site, page })}</script>
${assets.scripts.map((script) => `    <script type="module" src="${escapeHtml(script)}"></script>`).join('\n')}
  </body>
</html>
`;
};
