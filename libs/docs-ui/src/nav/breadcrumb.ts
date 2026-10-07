import {
  a,
  craftComponent,
  li,
  nav,
  ol,
  span,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import { DocIcon } from '../icon/icon.ts';
import { breadcrumbUi } from './nav.style.ts';

export interface Crumb {
  readonly label: string;
  /** The last crumb is the page itself and has no link target of its own. */
  readonly href: string;
}

export interface BreadcrumbInput {
  readonly trail: Input<readonly Crumb[]>;
}

/** The trail above a page: where it sits in the site, the last item current. */
export const DocBreadcrumb = craftComponent('DocBreadcrumb', {}, function* (
  input: BreadcrumbInput,
) {
  const trail = yield* input.trail();
  const items = trail.map((crumb, index): CraftNodeChild => {
    const last = index === trail.length - 1;
    const parts: CraftNodeChild[] = [
      a(
        {
          class: breadcrumbUi.link,
          href: crumb.href,
          ...(last ? { 'aria-current': 'page' as const } : {}),
        },
        crumb.label,
      ),
    ];
    if (!last) {
      parts.push(
        span({ 'aria-hidden': 'true' }, [
          DocIcon({
            name: function* () {
              return 'chevron' as const;
            },
            size: function* () {
              return 'sm' as const;
            },
          }),
        ]),
      );
    }
    return li({ class: breadcrumbUi.item }, parts);
  });
  return nav({ class: breadcrumbUi.root, 'aria-label': 'Breadcrumb' }, [
    ol({ class: breadcrumbUi.list }, items),
  ]);
});
