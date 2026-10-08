import { siteFromVitepress, type SiteConfig } from '@craft-ts/docs-ui';
// The navigation is still the VitePress configuration of `apps/docs`: read as it is, so
// the two sites show the same sections and the same sidebars while they are compared.
// eslint-disable-next-line @nx/enforce-module-boundaries
import vitepressConfig from '../../../docs/.vitepress/config.mts';

/** The site as the navigation describes it, mounted at `base`. */
export const siteAt = (base: string): SiteConfig => ({
  ...siteFromVitepress(vitepressConfig as never),
  base,
});
