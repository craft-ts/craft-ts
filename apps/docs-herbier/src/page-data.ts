import type { Outline, SiteConfig, Block } from '@craft-ts/docs-ui';
import type { HomeFeature, HomeHero } from '@craft-ts/docs-ui';

/**
 * What one page needs to be drawn: the same value is read on the server, to
 * write the HTML, and in the browser, to hydrate it. It is plain data.
 */
export interface PageData {
  /** `doc` is a Markdown page, `home` is a page with `layout: home`, `notFound` is the 404. */
  readonly kind: 'doc' | 'home' | 'notFound';
  /** Where the page is served, without the base: `/guide/state/local-state`. */
  readonly route: string;
  readonly title: string;
  readonly blocks: readonly Block[];
  readonly outline: readonly Outline[];
  readonly hero?: HomeHero;
  readonly features?: readonly HomeFeature[];
}

export interface DocsProps {
  readonly site: SiteConfig;
  readonly page: PageData;
}

export type { SiteConfig };

/**
 * A component input is a reader, not a value: `yield* input.site()`. The page
 * arrives as plain data, so this is where it becomes the inputs of the root, the
 * same way on the server and in the browser.
 */
export const asInputs = (props: DocsProps) => ({
  site: function* () {
    return props.site;
  },
  page: function* () {
    return props.page;
  },
});
