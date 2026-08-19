import {
  abstract,
  craftHandshake,
  craftService,
  requireClientDI,
} from '@craft-ts/core';
import { Schema } from 'effect';

/**
 * L'identité de la server function, nommée **une seule fois** pour tout le
 * dépôt. Les deux côtés passent cette valeur, donc l'égalité des ids est déjà
 * tenue par TypeScript ; la règle `assertCraftHandshake` ne fait que prouver
 * que les deux côtés sont bien là, y compris s'ils vivent dans deux programmes
 * tsc distincts.
 */
export const authenticatedListHandshake = craftHandshake(
  'demo.users.authenticated-list',
);

/**
 * L'identité que le **navigateur** annonce. Une déclaration, pas une preuve :
 * elle est validée par schéma à l'arrivée, puis confrontée à la session réelle
 * par le middleware serveur `demo.matching-user`.
 */
export const {
  ClaimedUserIdRequirement,
  provideClaimedUserId,
} = craftService(
  { name: 'ClaimedUserId', providedIn: 'abstract' },
  abstract<string>(),
);

/**
 * Le pipe partagé par les deux côtés. L'exporter une seule fois évite qu'ils
 * dérivent : la clé de transport (`userId`) et le schéma sont les mêmes.
 *
 * Volontairement **pas** un handshake : `requireClientDI` est son propre
 * mécanisme à déclaration unique, et l'habiller d'un handshake ferait croire à
 * la règle d'architecture qu'un middleware client doit le remplir — ce qui
 * n'est pas le cas ici, c'est le DI navigateur qui s'en charge.
 */
export const claimedUserId = requireClientDI(ClaimedUserIdRequirement.token, {
  mode: 'snapshot',
  key: 'userId',
  schema: Schema.toStandardSchemaV1(Schema.String),
});
