/**
 * What an existing VitePress configuration says about the shape of the site,
 * read as `SiteConfig`.
 *
 * `themeConfig.nav` and `themeConfig.sidebar` already have the shape the site
 * model uses, so this is a narrowing and a normalisation, not a translation:
 * move a docs folder over without retyping its sidebar. The input is described
 * structurally, so the module imports nothing from VitePress.
 */
import type {
  NavEntry,
  SidebarEntry,
  SiteConfig,
} from './site.ts';

interface VitepressSidebarItem {
  readonly text?: string;
  readonly link?: string;
  readonly items?: readonly VitepressSidebarItem[];
  readonly collapsed?: boolean;
}

interface VitepressNavItem {
  readonly text?: string;
  readonly link?: string;
  readonly activeMatch?: string;
  readonly items?: readonly { readonly text?: string; readonly link?: string }[];
}

export interface VitepressConfigLike {
  readonly title?: string;
  readonly description?: string;
  readonly base?: string;
  readonly themeConfig?: {
    readonly nav?: readonly VitepressNavItem[];
    readonly sidebar?:
      | readonly VitepressSidebarItem[]
      | Readonly<Record<string, readonly VitepressSidebarItem[]>>;
  };
}

const sidebarEntry = (item: VitepressSidebarItem): SidebarEntry => ({
  text: item.text ?? '',
  ...(item.link ? { link: item.link } : {}),
  ...(item.collapsed !== undefined ? { collapsed: item.collapsed } : {}),
  ...(item.items ? { items: item.items.map(sidebarEntry) } : {}),
});

const navEntry = (item: VitepressNavItem): NavEntry =>
  item.items
    ? {
        text: item.text ?? '',
        items: item.items.map((child) => ({
          text: child.text ?? '',
          link: child.link ?? '',
        })),
        ...(item.activeMatch ? { activeMatch: item.activeMatch } : {}),
      }
    : {
        text: item.text ?? '',
        link: item.link ?? '',
        ...(item.activeMatch ? { activeMatch: item.activeMatch } : {}),
      };

/** The base as the site model wants it: a leading and a trailing slash. */
const baseOf = (base: string | undefined): string => {
  const trimmed = (base ?? '/').replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
};

export const siteFromVitepress = (config: VitepressConfigLike): SiteConfig => {
  const sidebar = config.themeConfig?.sidebar;
  return {
    title: config.title ?? '',
    ...(config.description ? { description: config.description } : {}),
    base: baseOf(config.base),
    nav: (config.themeConfig?.nav ?? []).map(navEntry),
    // A bare array is the one sidebar of the whole site.
    sidebar: Array.isArray(sidebar)
      ? { '/': sidebar.map(sidebarEntry) }
      : Object.fromEntries(
          Object.entries(sidebar ?? {}).map(([prefix, entries]) => [
            prefix,
            (entries as readonly VitepressSidebarItem[]).map(sidebarEntry),
          ]),
        ),
  };
};
