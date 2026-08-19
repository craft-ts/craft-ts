import { craftMiddleware } from '@craft-ts/core';
import {
  requestedByHandshake,
  requestLocaleHandshake,
} from '../shared/request-context';
import { ClientSession } from './client-session';

/**
 * Publie l'auteur apparent de la requête, lu dans le DI du navigateur.
 *
 * `run` est un générateur craft nu, comme un guard : `yield*` y résout les
 * dépendances craft, et la chaîne s'exécute sur la pompe asynchrone — un pont
 * (l'adaptateur Effect, par exemple) peut donc y suspendre.
 */
export const requestedByContext = craftMiddleware('demo.requested-by')
  .provides(requestedByHandshake)
  .client(function* ({ next }) {
    const session = yield* ClientSession();
    return yield* next({ context: { requestedBy: session.userId } });
  });

/**
 * Compose le précédent et ajoute la locale : deux champs, deux middleware,
 * une seule attache côté façade.
 */
export const requestContext = craftMiddleware('demo.request-context')
  .pipe(requestedByContext)
  .provides(requestLocaleHandshake)
  .client(function* ({ next }) {
    const session = yield* ClientSession();
    return yield* next({ context: { locale: session.locale } });
  });
