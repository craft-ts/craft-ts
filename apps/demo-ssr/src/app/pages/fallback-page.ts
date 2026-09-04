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
import {
  CraftHttpClient,
  craftComputed,
  query,
  settled,
  type CraftHttpClientResult,
} from '@craft-ts/core';
import { page } from './page-layout';

export const FallbackPage = craftComponent(
  'SsrFallbackPage',
  {},
  function* () {
    const data = yield* query('deferredData', {
      params: () => true,
      loader: function* () {
        return (yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/deferred',
          success: response<{ message: string }>(),
        }))) as unknown as CraftHttpClientResult<{ message: string }>;
      },
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
            const value = yield* resolved();
            return (value as unknown as { message: string } | undefined)?.message ?? '';
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
