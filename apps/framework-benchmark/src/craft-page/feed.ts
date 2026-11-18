import {
  craftComponent,
  div,
  forNode,
  h3,
  li,
  section,
  span,
  strong,
  ul,
  type Input,
} from '@craft-ts/component';
import type { FeedEntry } from '../page-common.js';
import { Page } from './store.js';
import { Avatar, Badge, Timestamp, derive, fixed, pluck } from './ui.js';

const FeedItem = craftComponent(
  'FeedItem',
  {},
  (inputs: { readonly entry: Input<FeedEntry> }) =>
    li({ class: 'feed-item' }, [
      Avatar({ name: pluck(inputs.entry, 'actor'), size: fixed('sm') }),
      div({ class: 'feed-item__body' }, [
        strong(pluck(inputs.entry, 'actor')),
        span(
          { class: 'feed-item__text' },
          derive(inputs.entry, (entry) => `${entry.verb} ${entry.target}`),
        ),
        Timestamp({ text: pluck(inputs.entry, 'time') }),
      ]),
      Badge({ tone: fixed('neutral'), text: pluck(inputs.entry, 'kind') }),
    ]),
);

export const ActivityFeed = craftComponent('ActivityFeed', {}, () =>
  section({ class: 'feed' }, [
    h3({ class: 'feed__title' }, 'Activity'),
    ul(
      { class: 'feed__list' },
      forNode(Page.feed, { track: (entry) => entry.id }, (entry) =>
        FeedItem({ entry }),
      ),
    ),
  ]),
);
