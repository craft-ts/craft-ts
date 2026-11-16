import { For } from 'solid-js';
import { usePage } from './store.js';
import { Avatar, Badge, Timestamp } from './ui.js';

function FeedItem(props: { entry: any }) {
  return (
    <li class="feed-item">
      <Avatar name={props.entry.actor} size="sm" />
      <div class="feed-item__body">
        <strong>{props.entry.actor}</strong>
        <span class="feed-item__text">
          {`${props.entry.verb} ${props.entry.target}`}
        </span>
        <Timestamp text={props.entry.time} />
      </div>
      <Badge tone="neutral" text={props.entry.kind} />
    </li>
  );
}

export function ActivityFeed() {
  const page = usePage();
  return (
    <section class="feed">
      <h3 class="feed__title">Activity</h3>
      <ul class="feed__list">
        <For each={page.model.feed}>{(entry) => <FeedItem entry={entry} />}</For>
      </ul>
    </section>
  );
}
