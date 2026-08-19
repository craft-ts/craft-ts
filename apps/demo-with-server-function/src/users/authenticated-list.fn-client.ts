import { clientContext, createServerFunctionClient } from '@craft-ts/core';
import { requestContext } from '../client/request-context.mw-client';
import {
  authenticatedListHandshake,
  claimedUserId,
} from '../shared/claimed-user-id';
import type {
  getAuthenticatedUsers as ServerGetAuthenticatedUsers,
} from './authenticated-list.fn-serveur';

/**
 * Deux mécanismes, un seul canal : `claimedUserId` rejoue le pipe déclaré côté
 * serveur (un token, zéro fichier à créer), `requestContext` est la chaîne
 * composée pour ce qu'un simple token ne couvre pas.
 *
 * TypeScript vérifie ici que les deux, ensemble, couvrent le contexte que la
 * server function attend ; le graphe d'architecture reprend le contrôle entre
 * fichiers, là où les deux côtés peuvent vivre dans des programmes distincts.
 */
export const getAuthenticatedUsers =
  createServerFunctionClient<typeof ServerGetAuthenticatedUsers>(
    authenticatedListHandshake,
    clientContext([claimedUserId, requestContext]),
  );
