import { clientContext, createServerFunctionClient } from '@craft-ts/core';
import { claimedUserContext } from '../client/claimed-user.mw-client';
import { requestContext } from '../client/request-context.mw-client';
import { authenticatedListHandshake } from '../shared/claimed-user-id';
import type {
  getAuthenticatedUsers as ServerGetAuthenticatedUsers,
} from './authenticated-list.fn-serveur';

/**
 * Tout ce que le navigateur annonce passe par des middleware client, chacun
 * adossé à un handshake partagé avec le serveur.
 *
 * TypeScript vérifie ici qu'ensemble ils couvrent le contexte que la server
 * function attend ; le graphe d'architecture reprend le contrôle entre
 * fichiers, là où les deux côtés peuvent vivre dans des programmes distincts.
 */
export const getAuthenticatedUsers =
  createServerFunctionClient<typeof ServerGetAuthenticatedUsers>(
    authenticatedListHandshake,
    clientContext([claimedUserContext, requestContext]),
  );
