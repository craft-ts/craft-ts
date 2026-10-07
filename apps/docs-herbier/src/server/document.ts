import { withBase, type SiteConfig } from '@craft-ts/docs-ui';
import type { PageData } from '../page-data.ts';

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

/**
 * Applied before the first paint, so a reader who chose the dark does not see a
 * light page first. It only reads what `DocModeView` wrote.
 */
const MODE_SCRIPT =
  "try{var m=localStorage.getItem('docs-mode');if(m==='light'||m==='dark')document.documentElement.setAttribute('data-mode',m)}catch(e){}";

export const renderDocument = (options: {
  readonly site: SiteConfig;
  readonly page: PageData;
  /** What `renderCraft` returned: the host, and the state it transfers. */
  readonly html: string;
  readonly assets: Assets;
  readonly dataId: string;
  readonly description?: string;
}): string => {
  const { site, page, assets } = options;
  const title =
    page.route === '/' ? site.title : `${page.title} | ${site.title}`;
  const description = options.description ?? site.description ?? '';
  const href = (path: string) => escapeHtml(withBase(site.base, path));
  return `<!doctype html>
<html lang="en" data-base="${escapeHtml(site.base)}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${description ? `<meta name="description" content="${escapeHtml(description)}" />` : ''}
    <link rel="icon" href="${href('/assets/craft-ts-logo.png')}" type="image/png" />
    <script>${MODE_SCRIPT}</script>
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
