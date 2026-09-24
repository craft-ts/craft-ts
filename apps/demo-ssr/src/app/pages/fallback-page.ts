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
import { CraftHttpClient, craftComputed, query, settled } from '@craft-ts/core';
import { page } from './page-layout';
import { page as pageStyle } from '../ssr-lab.style';

export const FallbackPage = craftComponent(
  'SsrFallbackPage',
  {},
  function* () {
    const data = yield* query('deferredData', {
      params: () => true,
      loader: function* () {
        return yield* CraftHttpClient.get(({ response }) => ({
          url: '/api/deferred',
          success: response<{ message: string }>(),
        }));
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
      section({ class: pageStyle.grid }, [
        article({ class: pageStyle.card, 'data-ssrCard': 'accent' }, [
          span(
            { class: pageStyle.badge, 'data-ssrBadge': 'fallback' },
            'SSR fallback',
          ),
          h2({ class: pageStyle.cardTitle }, 'Le shell est immédiat'),
          p(
            { class: pageStyle.text },
            'Le titre et cette carte sont dans la réponse initiale.',
          ),
          span({ class: pageStyle.pendingBox }, function* () {
            const value = yield* resolved();
            return hasMessage(value) ? value.message : '';
          }),
        ]),
        article({ class: pageStyle.card }, [
          h2({ class: pageStyle.cardTitle }, 'Quand choisir ce mode ?'),
          p(
            { class: pageStyle.text },
            'Pour un widget secondaire qui peut apparaître après le premier rendu sans bloquer le document.',
          ),
        ]),
      ]).pipe(
        pendingNode({
          ssr: 'fallback',
          fallback: () =>
            div({ class: pageStyle.pendingBox }, [
              span('Le bloc différé arrive après le rendu…'),
              div({ class: pageStyle.skeleton }),
            ]),
        }),
      ),
    ),
);

function hasMessage(value: unknown): value is { message: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'message' in value &&
    typeof value.message === 'string'
  );
}
