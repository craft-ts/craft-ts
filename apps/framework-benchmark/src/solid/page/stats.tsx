import { For } from 'solid-js';
import { STAT_DEFS, cx, statValue } from '../../page-common.js';
import { usePage } from './store.js';
import { Icon } from './ui.js';

function Trend(props: { delta: number }) {
  return (
    <span class={cx('trend', props.delta >= 0 ? 'trend--up' : 'trend--down')}>
      <Icon name={props.delta >= 0 ? 'up' : 'down'} />
      {`${Math.abs(props.delta)}%`}
    </span>
  );
}

function StatCard(props: { stat: (typeof STAT_DEFS)[number] }) {
  const page = usePage();
  return (
    <article class={cx('stat-card', page.isDark() && 'is-dark')}>
      <div class="stat-card__head">
        <Icon name={props.stat.icon} />
        <span class="stat-card__label">{props.stat.label}</span>
      </div>
      <strong class="stat-card__value">
        {statValue(page.stats(), props.stat.id)}
      </strong>
      <Trend delta={props.stat.delta} />
    </article>
  );
}

export function StatsRow() {
  return (
    <section class="stats">
      <For each={STAT_DEFS}>{(stat) => <StatCard stat={stat} />}</For>
    </section>
  );
}

export function PageTitle() {
  const page = usePage();
  return (
    <div class="page-title">
      <h1>Dashboard</h1>
      <p class="page-title__meta">{page.summary()}</p>
    </div>
  );
}
