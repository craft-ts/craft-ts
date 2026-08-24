import { craftService } from '@craft-ts/core';
import { clientAuthenticatedUser } from './authenticated-user';

/** Locale de la session, figée pour la démo — un vrai applicatif la négocie. */
export const clientLocale = 'fr-FR';

/**
 * Ce que le navigateur sait de lui-même. Service craft ordinaire : un
 * middleware client le lit comme n'importe quel générateur craft.
 */
export const { ClientSession } = craftService(
  { name: 'ClientSession', providedIn: 'global' },
  function* () {
    return {
      userId: clientAuthenticatedUser.id,
      locale: clientLocale,
    };
  },
);
