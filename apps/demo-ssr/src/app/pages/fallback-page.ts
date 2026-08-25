import {
  article,
  craftComponent,
  div,
  h2,
  p,
  section,
  span,
} from '@craft-ts/component';
import { pendingNode } from '@craft-ts/component';
import { craftComputed, query, settled } from '@craft-ts/core';
import { page } from './page-layout';

function deferredClientData(): Promise<string> {
  return fetch('/api/deferred').then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { message: string };
    return payload.message;
  });
}

export const FallbackPage = craftComponent(
  'SsrFallbackPage',
  {},
  function* () {
    const data = yield* query('deferredData', {
      params: () => true,
      loader: deferredClientData,
    });
    const resolved = craftComputed('resolvedDeferredData', function* () {
      return yield* settled(data);
    });
    return { resolved };
  },
  ({ resolved }) =>
    page(
      'Route SSR : `fallback`',
      'Shell serveur, contenu différé',
      'Le serveur rend la structure et le pending block. La query est autorisée à démarrer côté serveur, mais la page peut répondre avec son fallback sans la bloquer.',
      section({ class: 'grid' }, [
        article({ class: 'card card--accent' }, [
          span({ class: 'badge badge--fallback' }, 'SSR fallback'),
          h2('Le shell est immédiat'),
          p('Le titre et cette carte sont dans la réponse initiale.'),
          span({ class: 'pending-box' }, function* () {
            return String(yield* resolved());
          }),
        ]),
        article({ class: 'card' }, [
          h2('Quand choisir ce mode ?'),
          p(
            'Pour un widget secondaire qui peut apparaître après le premier rendu sans bloquer le document.',
          ),
        ]),
      ]).pipe(
        pendingNode({
          ssr: 'fallback',
          fallback: () =>
            div({ class: 'pending-box' }, [
              span('Le bloc différé arrive après le rendu…'),
              div({ class: 'skeleton' }),
            ]),
        }),
      ),
    ),
);
