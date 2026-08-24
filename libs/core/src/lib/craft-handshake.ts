import type { CraftSchema } from './schema-validation';

export const CRAFT_HANDSHAKE = Symbol('craftHandshake');

/**
 * Un nom sur lequel les deux côtés de la frontière se mettent d'accord.
 *
 * `craftUnique` dit « ce nom apparaît exactement une fois ». Ce n'est pas le
 * bon prédicat ici : un identifiant de server function, ou la forme d'un
 * contexte client, **doit** apparaître des deux côtés, puisque les deux
 * fichiers ne peuvent pas s'importer. `craftHandshake` dit l'inverse — « ce
 * nom a un pendant en face » — et c'est ça que la règle d'architecture vérifie.
 *
 * Déclaré une fois dans un module partagé, il est référencé par le serveur et
 * par le client. Deux conséquences :
 *
 * - la chaîne n'existe qu'à un seul endroit du dépôt, donc l'égalité des deux
 *   côtés devient une vérification TypeScript et non un rattrapage a posteriori ;
 * - quand il porte un schéma, les deux côtés partagent le **même** schéma :
 *   ils ne peuvent plus diverger.
 */
export type CraftHandshakeName<Name extends string = string> = Name & {
  readonly [CRAFT_HANDSHAKE]: Name;
};

export type CraftHandshakeSchema<
  Name extends string = string,
  Schema extends CraftSchema = CraftSchema,
> = Schema & {
  readonly [CRAFT_HANDSHAKE]: Name;
};

export type AnyCraftHandshake =
  | CraftHandshakeName<string>
  | CraftHandshakeSchema<string, CraftSchema>;

/** Identité partagée : l'id d'une server function, nommé une seule fois. */
export function craftHandshake<const Name extends string>(
  name: Name,
): CraftHandshakeName<Name>;
/** Forme partagée : un schéma de contexte client, écrit une seule fois. */
export function craftHandshake<
  const Name extends string,
  Schema extends CraftSchema,
>(name: Name, schema: Schema): CraftHandshakeSchema<Name, Schema>;
export function craftHandshake(name: string, schema?: CraftSchema): unknown {
  assertHandshakeName(name);
  if (schema === undefined) {
    // Une primitive ne porte pas de propriété : le nom reste une chaîne nue au
    // runtime, et c'est le graphe qui prouve la présence des deux côtés. Même
    // compromis que `craftUnique`.
    return name;
  }
  Object.defineProperty(schema, CRAFT_HANDSHAKE, {
    value: name,
    enumerable: false,
    configurable: false,
  });
  return schema;
}

export function isCraftHandshake(value: unknown): value is AnyCraftHandshake {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    CRAFT_HANDSHAKE in value
  );
}

/** Le nom d'un handshake porté par une valeur, quand il y en a un. */
export function craftHandshakeName(value: unknown): string | undefined {
  if (!isCraftHandshake(value)) return undefined;
  const name = (value as { readonly [CRAFT_HANDSHAKE]: unknown })[
    CRAFT_HANDSHAKE
  ];
  return typeof name === 'string' ? name : undefined;
}

export function assertHandshakeName(name: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._:-]*$/.test(name)) {
    throw new Error(
      `Invalid handshake name "${name}". Use a stable dotted identifier, the same on both sides.`,
    );
  }
}
