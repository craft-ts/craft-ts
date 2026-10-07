import {
  a,
  craftComponent,
  div,
  span,
  type CraftNodeChild,
  type Input,
} from '@craft-ts/component';
import { pagerUi } from './nav.style.ts';

export interface PagerLink {
  readonly label: string;
  readonly href: string;
}

export interface PagerInput {
  /** `undefined` on the first page. An empty href means none. */
  readonly previous: Input<PagerLink | null>;
  readonly next: Input<PagerLink | null>;
}

/** Previous and next, under a page: a quiet card and a filled one. */
export const DocPager = craftComponent('DocPager', {}, function* (
  input: PagerInput,
) {
  const previous = yield* input.previous();
  const next = yield* input.next();
  const parts: CraftNodeChild[] = [];
  if (previous) {
    parts.push(
      a(
        'docPagerPrevious',
        {
          class: pagerUi.link,
          href: previous.href,
          rel: 'prev',
          'data-variant': 'secondary',
          'data-direction': 'previous',
        },
        [
          span({ class: pagerUi.arrow, 'aria-hidden': 'true' }, '←'),
          span(previous.label),
        ],
      ),
    );
  }
  if (next) {
    parts.push(
      a(
        'docPagerNext',
        {
          class: pagerUi.link,
          href: next.href,
          rel: 'next',
          'data-variant': 'primary',
          'data-direction': 'next',
        },
        [
          span(next.label),
          span({ class: pagerUi.arrow, 'aria-hidden': 'true' }, '→'),
        ],
      ),
    );
  }
  return div({ class: pagerUi.root }, parts);
});
