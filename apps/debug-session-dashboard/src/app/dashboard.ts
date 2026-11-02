import { i18n } from '../shared/util/catalog';
import {
  button,
  craftComponent,
  CraftRouterOutlet,
  div,
  nav,
  span,
} from '@craft-ts/component';
import { CraftRouter } from '@craft-ts/core';
import {
  DocBadge,
  DocLogo,
  DocModeToggle,
  DocSeasonPicker,
  provideDocModeView,
  provideDocSeasonView,
} from '@craft-ts/ui';
import { ui } from '../shared/ui/dashboard.style';
import { replayHost } from '../shared/util/replay-browser';
import { ReplayRoute, provideReplayRoute } from '../shared/state/replay-route.service';
import { page } from '../shared/state/replay-state';
import { lit } from '../shared/util/view-helpers';

/**
 * The replay dashboard: a bar, and two pages — the sessions the local archive
 * holds, and the replay of one of them. The address says which one shows; the
 * route service listens to it from the first render.
 */
export const DebugSessionDashboard = craftComponent(
  'DebugSessionDashboard',
  {
    providers: [
      provideDocModeView(),
      provideDocSeasonView(),
      provideReplayRoute(),
    ],
  },
  function* () {
    yield* ReplayRoute();

    const bar = div({ class: ui.bar }, [
      div({ class: ui.brand }, [
        div({ class: ui.brandMark }, [DocLogo({})]),
        div([
          span({ class: ui.brandName }, i18n.t("copy.copy001")),
          span({ class: ui.brandKind }, i18n.t("copy.copy002")),
        ]),
      ]),
      // The two lists of the archive. A replay belongs to the sessions.
      nav({ class: ui.nav, 'aria-label': 'Sections' }, [
        button(
          'navSessions',
          {
            type: 'button',
            class: ui.navLink,
            'data-lab': 'nav-sessions',
            'aria-current': function* () {
              return page() === 'sessions' || page() === 'detail'
                ? 'page'
                : undefined;
            },
            'data-nav-current': function* () {
              return page() === 'sessions' || page() === 'detail'
                ? 'true'
                : undefined;
            },
            click: function* () {
              yield* CraftRouter.navigate({ to: '' });
            },
          },
          i18n.t("copy.copy003"),
        ),
        button(
          'navRecipes',
          {
            type: 'button',
            class: ui.navLink,
            'data-lab': 'open-recipe-catalog',
            'aria-current': function* () {
              return page() === 'recipes' ? 'page' : undefined;
            },
            'data-nav-current': function* () {
              return page() === 'recipes' ? 'true' : undefined;
            },
            click: function* () {
              yield* CraftRouter.navigate({ to: 'recipes' });
            },
          },
          i18n.t("copy.copy004"),
        ),
      ]),
      div({ class: ui.barTools }, [
        span({ class: ui.barBadge }, [
          DocBadge({ tone: lit('tip'), label: lit('Local') }),
        ]),
        DocSeasonPicker({
          label: lit('Saison'),
          menuId: lit('season-menu'),
          names: lit({
            auto: 'Automatique',
            spring: 'Printemps',
            summer: 'Été',
            autumn: 'Automne',
            winter: 'Hiver',
          }),
        }),
        DocModeToggle({ label: lit('Basculer entre clair et sombre') }),
      ]),
    ]);

    // The root element is where the replay meets the browser: `replayHost`
    // hands it the page's window and the DOM adapter.
    return div({ class: ui.root }, [
      bar,
      // The router activates one page at a time. Hash routing keeps this
      // dashboard usable from static hosting without a server-side fallback.
      div({ class: ui.page }, CraftRouterOutlet()),
    ]).pipe(replayHost);
  },
);
