import { renderCraft } from '@craft-ts/component';
import type { SiteConfig } from '@craft-ts/docs-ui';
import { appConfig } from '../app.config.ts';
import { DATA_ID } from '../data-id.ts';
import { asInputs, type PageData } from '../page-data.ts';
import { renderDocument, type Assets } from './document.ts';

/** One page, as the complete HTML document the server sends. */
export const renderPage = async (
  site: SiteConfig,
  page: PageData,
  assets: Assets,
): Promise<string> => {
  const rendered = await renderCraft({
    config: appConfig,
    props: asInputs({ site, page }),
    url: `${site.base}${page.route.replace(/^\//, '')}`,
    mode: 'production',
    // The per-request cap guards a server from a page it did not expect. This is a
    // build, over pages we wrote: a long reference page is allowed to be long.
    securityPolicy: { ssr: { maxHtmlBytes: 32_000_000, timeoutMs: 60_000 } },
    // The stylesheet is a file the document links: the same one for every page.
    includeStyles: false,
  });
  return renderDocument({ site, page, html: rendered.html, assets, dataId: DATA_ID });
};
