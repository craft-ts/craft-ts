import {
  article,
  craftComponent,
  div,
  h2,
  p,
  section,
  span,
  strong,
} from '@craft-ts/component';
import { pendingNode } from '@craft-ts/component';
import { craftComputed, craftSleep, query, settled } from '@craft-ts/core';
import { page } from './page-layout';
import { page as pageStyle } from '../ssr-lab.style';

type SsrData = Readonly<{
  visitors: number;
  region: string;
  generatedAt: string;
}>;

export const DataPage = craftComponent(
  'SsrDataPage',
  {},
  function* () {
    const data = yield* query('ssrData', {
      params: () => true,
      loader: function* () {
        yield* craftSleep(160);
        return {
          visitors: 1284,
          region: 'Europe / Paris',
          generatedAt: new Date().toLocaleTimeString('fr-FR'),
        } satisfies SsrData;
      },
    });
    const resolved = craftComputed('resolvedSsrData', function* () {
      return yield* settled(data);
    });
    return { resolved };
  },
  ({ resolved }) =>
    page(
      'Route SSR : `block`',
      'Query résolue avant la réponse',
      'La route déclare explicitement qu’elle attend ses données. Le HTML initial contient déjà la valeur résolue et le snapshot la transfère à hydrateCraft.',
      section({ class: pageStyle.grid }, [
        article({ class: pageStyle.card, 'data-ssrCard': 'accent' }, [
          span({ class: pageStyle.badge }, 'SSR fetch'),
          h2({ class: pageStyle.cardTitle }, 'Données prêtes'),
          div({ class: pageStyle.metric }, [
            strong({ class: pageStyle.metricValue }, function* () {
              return (yield* resolved()).visitors.toLocaleString('fr-FR');
            }),
            span({ class: pageStyle.muted }, 'visiteurs servis aujourd’hui'),
          ]),
          p(
            { class: pageStyle.text },
            'La query a été exécutée une fois côté serveur puis réutilisée côté client.',
          ),
        ]),
        article({ class: pageStyle.card }, [
          h2({ class: pageStyle.cardTitle }, 'Payload rendu'),
          div({ class: pageStyle.dataList }, [
            p({ class: pageStyle.dataRow }, [
              strong('Région · '),
              function* () {
                return (yield* resolved()).region;
              },
            ]),
            p({ class: pageStyle.dataRow }, [
              strong('Généré à · '),
              function* () {
                return (yield* resolved()).generatedAt;
              },
            ]),
          ]),
        ]),
      ]).pipe(
        pendingNode({
          ssr: 'block',
          fallback: () =>
            div({ class: pageStyle.pendingBox }, [
              span('Le serveur résout la query…'),
              div({ class: pageStyle.skeleton }),
            ]),
        }),
      ),
    ),
);
