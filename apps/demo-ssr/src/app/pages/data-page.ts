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
import { craftComputed, query, settled } from '@craft-ts/core';
import { page } from './page-layout';

type SsrData = Readonly<{
  visitors: number;
  region: string;
  generatedAt: string;
}>;

function loadSsrData(): Promise<SsrData> {
  return new Promise((resolve) => {
    setTimeout(
      () =>
        resolve({
          visitors: 1284,
          region: 'Europe / Paris',
          generatedAt: new Date().toLocaleTimeString('fr-FR'),
        }),
      160,
    );
  });
}

export const DataPage = craftComponent(
  'SsrDataPage',
  {},
  function* () {
    const data = yield* query('ssrData', {
      params: () => true,
      loader: loadSsrData,
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
      section({ class: 'grid' }, [
        article({ class: 'card card--accent' }, [
          span({ class: 'badge' }, 'SSR fetch'),
          h2('Données prêtes'),
          div({ class: 'metric' }, [
            strong(function* () {
              return (yield* resolved()).visitors.toLocaleString('fr-FR');
            }),
            span('visiteurs servis aujourd’hui'),
          ]),
          p(
            'La query a été exécutée une fois côté serveur puis réutilisée côté client.',
          ),
        ]),
        article({ class: 'card' }, [
          h2('Payload rendu'),
          div({ class: 'data-list' }, [
            p([
              strong('Région · '),
              function* () {
                return (yield* resolved()).region;
              },
            ]),
            p([
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
            div({ class: 'pending-box' }, [
              span('Le serveur résout la query…'),
              div({ class: 'skeleton' }),
            ]),
        }),
      ),
    ),
);
