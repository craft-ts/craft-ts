import { clientContext, craftMiddleware } from '@craft-ts/core';
import { Effect } from 'effect';
import {
  requestedByHandshake,
  requestLocaleHandshake,
} from '../shared/request-context';

/**
 * Journalise ce que le navigateur a déclaré sur sa propre requête.
 *
 * Les schémas viennent des handshakes partagés : le serveur n'importe jamais le
 * `*.mw-client.ts` qui les remplit — il n'a besoin que de la forme, et cette
 * forme n'est écrite qu'une fois.
 */
export const auditedRequest = craftMiddleware('demo.request-audit')
  .pipe(
    clientContext(requestedByHandshake),
    clientContext(requestLocaleHandshake),
  )
  .server(({ clientContext, next }) =>
    Effect.gen(function* () {
      yield* Effect.log(
        `demo.request-audit requestedBy=${clientContext.requestedBy} locale=${clientContext.locale}`,
      );
      return yield* next({ context: { requestLocale: clientContext.locale } });
    }),
  );
