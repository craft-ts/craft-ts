import { abstract, craftHandshake, craftService } from '@craft-ts/core';
import { Schema } from 'effect';

/**
 * L'identité de la server function, nommée **une seule fois** pour tout le
 * dépôt. Les deux côtés passent cette valeur, donc l'égalité des ids est déjà
 * tenue par TypeScript ; la règle d'architecture ne fait que prouver que les
 * deux côtés sont bien là, y compris s'ils vivent dans deux programmes tsc
 * distincts.
 */
export const authenticatedListHandshake = craftHandshake(
  'demo.users.authenticated-list',
);

/**
 * Ce que le **navigateur** annonce sur son identité, et la forme sous laquelle
 * ça voyage. Une déclaration, pas une preuve : c'est validé par schéma à
 * l'arrivée, puis confronté à la session réelle par `demo.matching-user`.
 *
 * Le nom et le schéma vivent ici, une seule fois : le serveur les exige avec
 * `clientContext(...)` dans le `.pipe(...)`, le navigateur les remplit avec
 * `craftHandshakeMiddleware(...)`, et les deux ne peuvent plus diverger.
 */
export const claimedUserHandshake = craftHandshake(
  'demo.claimed-user',
  Schema.toStandardSchemaV1(Schema.Struct({ userId: Schema.String })),
);

/**
 * D'où le navigateur tient cette identité : un contrat de service craft, que
 * l'application fournit à sa façon. Le middleware qui remplit le handshake le
 * lit comme n'importe quel service — `yield* ClaimedUserId()`.
 */
export const { ClaimedUserId, provideClaimedUserId } = craftService(
  { name: 'ClaimedUserId', providedIn: 'abstract' },
  abstract<string>(),
);
