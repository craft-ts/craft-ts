import { craftHandshakeMiddleware } from '@craft-ts/core';
import {
  claimedUserHandshake,
  ClaimedUserId,
} from '../shared/claimed-user-id';

/**
 * Remplit le handshake côté navigateur.
 *
 * Ça se lit comme un service : on `yield*` ce dont on a besoin, on retourne le
 * fragment de contexte. Ni le nom ni le schéma ne sont répétés ici — ils
 * viennent du handshake, donc le serveur et le client ne peuvent pas en dire
 * deux choses différentes.
 */
export const claimedUserContext = craftHandshakeMiddleware(
  claimedUserHandshake,
  function* () {
    return { userId: yield* ClaimedUserId() };
  },
);
