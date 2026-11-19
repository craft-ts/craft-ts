import {
  craftComponent,
  div,
  heading,
  li,
  p,
  section,
  span,
  strong,
  ul,
  type Input,
} from '@craft-ts/component';
import { withBase } from '@craft-ts/docs-ui';
import { DocLinkButton } from '@craft-ts/ui';
import { CLOUD_PAGE } from '../cloud.ts';
import { cloudTeaserUi } from './cloud.style.ts';

const PROMISES = [
  {
    title: 'Session replay',
    text: 'Watch what a user really did, and reopen the app at the exact moment it went wrong.',
  },
  {
    title: 'End-to-end tests from real sessions',
    text: 'Recorded journeys become regression tests that run against every change.',
  },
  {
    title: 'Frustration insights',
    text: 'Find where people hesitate, retry or give up, ranked by how many it affects.',
  },
  {
    title: 'Business event analytics',
    text: 'Follow sign-ups, orders and every event your product cares about, from the same recordings.',
  },
] as const;

export interface CloudTeaserInput {
  readonly base: Input<string>;
}

/** The card of the home page that presents CraftTS Cloud and leads to its waitlist. */
export const CloudTeaser = craftComponent(
  'CloudTeaser',
  {},
  function* (input: CloudTeaserInput) {
    const base = yield* input.base();
    return section(
      { class: cloudTeaserUi.root, 'aria-labelledby': 'cloud-teaser-heading' },
      [
        div({ class: cloudTeaserUi.head }, [
          span({ class: cloudTeaserUi.tag }, 'Early access'),
          heading(
            { id: 'cloud-teaser-heading', class: cloudTeaserUi.heading },
            'CraftTS Cloud',
          ),
          p(
            { class: cloudTeaserUi.lead },
            'Everything this page promises, without setting it up yourself: plug in your app and get the recordings, the tests and the insights.',
          ),
        ]),
        ul(
          { class: cloudTeaserUi.list },
          PROMISES.map((promise) =>
            li({ class: cloudTeaserUi.item }, [
              strong({ class: cloudTeaserUi.itemTitle }, promise.title),
              span(` — ${promise.text}`),
            ]),
          ),
        ),
        div({ class: cloudTeaserUi.actions }, [
          DocLinkButton({
            label: function* () {
              return 'Join the waitlist';
            },
            href: function* () {
              return withBase(base, CLOUD_PAGE);
            },
            variant: function* () {
              return 'primary' as const;
            },
          }),
          span(
            { class: cloudTeaserUi.note },
            'Not available yet — tell us what you need first.',
          ),
        ]),
      ],
    );
  },
);
