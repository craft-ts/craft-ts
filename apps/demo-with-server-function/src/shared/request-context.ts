import { craftHandshake } from '@craft-ts/core';
import { Schema } from 'effect';

/**
 * Ce que le navigateur raconte sur sa propre requête. Un handshake par
 * fragment : chacun a exactement un producteur côté client et un consommateur
 * côté serveur, et la règle d'architecture le prouve.
 */
export const requestedByHandshake = craftHandshake(
  'demo.requested-by',
  Schema.toStandardSchemaV1(Schema.Struct({ requestedBy: Schema.String })),
);

export const requestLocaleHandshake = craftHandshake(
  'demo.request-locale',
  Schema.toStandardSchemaV1(Schema.Struct({ locale: Schema.String })),
);
