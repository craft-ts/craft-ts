import {
  article,
  craftComponent,
  div,
  forNode,
  h1,
  p,
  section,
  span,
  strong,
  type Input,
} from '@craft-ts/component';
import { STAT_DEFS, cx, statValue } from '../page-common.js';
import { Page } from './store.js';
import { Icon, derive, pluck } from './ui.js';

type Stat = {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly delta: number;
};

const Trend = craftComponent(
  'Trend',
  {},
  (inputs: { readonly delta: Input<number> }) =>
    span(
      {
        class: derive(inputs.delta, (delta) =>
          cx('trend', delta >= 0 ? 'trend--up' : 'trend--down'),
        ),
      },
      [
        Icon({ name: derive(inputs.delta, (delta) => (delta >= 0 ? 'up' : 'down')) }),
        derive(inputs.delta, (delta) => `${Math.abs(delta)}%`),
      ],
    ),
);

const StatCard = craftComponent(
  'StatCard',
  {},
  (inputs: { readonly stat: Input<Stat> }) =>
    article(
      {
        class: function* () {
          return cx('stat-card', (yield* Page.isDark()) && 'is-dark');
        },
      },
      [
        div({ class: 'stat-card__head' }, [
          Icon({ name: pluck(inputs.stat, 'icon') }),
          span({ class: 'stat-card__label' }, pluck(inputs.stat, 'label')),
        ]),
        strong({ class: 'stat-card__value' }, function* () {
          return statValue(yield* Page.stats(), (yield* inputs.stat()).id);
        }),
        Trend({ delta: pluck(inputs.stat, 'delta') }),
      ],
    ),
);

export const StatsRow = craftComponent('StatsRow', {}, () =>
  section(
    { class: 'stats' },
    forNode(STAT_DEFS, { track: (stat) => stat.id }, (stat) =>
      StatCard({ stat }),
    ),
  ),
);

export const PageTitle = craftComponent('PageTitle', {}, () =>
  div({ class: 'page-title' }, [
    h1('Dashboard'),
    p({ class: 'page-title__meta' }, Page.summary),
  ]),
);
