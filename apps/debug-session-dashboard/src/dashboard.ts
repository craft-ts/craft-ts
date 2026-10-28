import {
  craftComponent,
  CraftRouterOutlet,
  div,
  span,
} from '@craft-ts/component';
import {
  DocBadge,
  DocLogo,
  DocModeToggle,
  DocSeasonPicker,
  provideDocModeView,
  provideDocSeasonView,
} from '@craft-ts/ui';
import { ui } from './dashboard.style';
import { replayHost } from './replay-browser';
import { ReplayRoute } from './replay-route.service';
import { lit } from './view-helpers';

/**
 * The replay dashboard: a bar, and two pages — the sessions the local archive
 * holds, and the replay of one of them. The address says which one shows; the
 * route service listens to it from the first render.
 */
export const DebugSessionDashboard = craftComponent(
  'DebugSessionDashboard',
  { providers: [provideDocModeView(), provideDocSeasonView()] },
  function* () {
    yield* ReplayRoute();

    const bar = div({ class: ui.bar }, [
      div({ class: ui.brand }, [
        div({ class: ui.brandMark }, [DocLogo({})]),
        div([
          span({ class: ui.brandName }, 'craft-ts'),
          span({ class: ui.brandKind }, ' · replay'),
        ]),
      ]),
      div({ class: ui.barTools }, [
        DocBadge({ tone: lit('tip'), label: lit('Local') }),
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
