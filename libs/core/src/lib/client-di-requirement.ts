import type { InjectionToken } from './host/craft-compat';
import type { CraftSchema } from './schema-validation';

/**
 * Les trois modes esquissés pour le canal client → serveur. Seul `'snapshot'`
 * est implémenté, et c'est le seul que `requireClientDI` accepte.
 *
 * `reactive` et `cancel-on-change` supposeraient qu'une lecture du DI navigateur
 * s'abonne à ses changements depuis l'intérieur d'un loader. Or dans
 * `craft-resource.ts` seul `params()` est une dépendance réactive suivie (le
 * loader tourne dans un `untracked`) : les simuler demanderait un tracking
 * caché, exactement ce que Craft refuse. La voie recommandée, si le besoin
 * apparaît, reste de composer explicitement la lecture dans le `params()` de
 * l'appelant.
 */
export type ClientDIRequirementMode =
  | 'snapshot'
  | 'reactive'
  | 'cancel-on-change';

export type ServerFunctionToken<Value> = InjectionToken<Value>;

export type ClientDIRequirement<
  Value = unknown,
  Key extends string = string,
> = {
  readonly kind: 'client-di';
  readonly token: ServerFunctionToken<Value>;
  /** Clé sous laquelle la valeur voyage dans le contexte client. */
  readonly key: Key;
  readonly mode: 'snapshot';
  /** Schéma appliqué à la valeur reçue, côté serveur. */
  readonly schema?: CraftSchema;
  readonly __serverFunctionPipe: true;
  readonly __requiresClientExposure: true;
};

/**
 * Déclare qu'une valeur du DI **navigateur** est nécessaire au handler.
 *
 * Le pipe est déclaré côté serveur (`.pipe(requireClientDI(token))`) et rejoué
 * côté client (`createServerFunctionClient(id, [requireClientDI(token)])`) :
 * la façade lit alors le token dans le DI du navigateur, l'envoie dans le
 * canal `context` de la requête, et `required(token)` le relit côté serveur
 * **depuis ce canal validé**, plus depuis le DI du serveur.
 *
 * La valeur reste une donnée **non fiable** : elle vit dans `clientContext`,
 * séparée du contexte produit par les middleware serveur, et un middleware
 * serveur doit la revérifier contre la vraie session (voir la démo
 * `demo.matching-user`).
 *
 * @param options.schema Valide la valeur reçue côté serveur. Sans schéma, la
 * valeur est transportée telle quelle : elle reste utilisable, mais rien ne la
 * contrôle avant le middleware qui la revérifie.
 * @param options.key Clé de transport. Par défaut le `debugName` du token, ce
 * qui suppose un token nommé de façon stable et unique.
 */
export function requireClientDI<Value, const Key extends string = string>(
  token: ServerFunctionToken<Value>,
  options: {
    readonly mode?: 'snapshot';
    readonly key?: Key;
    readonly schema?: CraftSchema;
  } = {},
): ClientDIRequirement<Value, Key> {
  const key = options.key ?? (token as { debugName?: string }).debugName;
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(
      'requireClientDI(token) needs a named token: pass an InjectionToken with a description, or an explicit { key }.',
    );
  }
  return Object.freeze({
    kind: 'client-di' as const,
    token,
    key: key as Key,
    mode: 'snapshot' as const,
    ...(options.schema === undefined ? {} : { schema: options.schema }),
    __serverFunctionPipe: true as const,
    __requiresClientExposure: true as const,
  });
}

export function isClientDIRequirement(
  value: unknown,
): value is ClientDIRequirement {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'client-di'
  );
}

export type ServerPermissionRequirement = {
  readonly kind: 'server-permission';
  readonly permission: string;
  readonly __serverFunctionPipe: true;
  readonly __requiresClientExposure?: false;
};

export function requireServerPermission(
  permission: string,
): ServerPermissionRequirement {
  if (permission.length === 0) {
    throw new Error('A server permission must not be empty.');
  }
  return Object.freeze({
    kind: 'server-permission',
    permission,
    __serverFunctionPipe: true,
  } satisfies ServerPermissionRequirement);
}

export type ServerFunctionPipe =
  | ClientDIRequirement
  | ServerPermissionRequirement;

export type ClientDIRequirementOf<Pipe> = Pipe extends ClientDIRequirement<
  infer Value,
  any
>
  ? Value
  : never;

export type ClientDITokensOf<
  Pipes extends readonly ServerFunctionPipe[],
> = Pipes[number] extends infer Pipe
  ? Pipe extends ClientDIRequirement<infer Value, any>
    ? ServerFunctionToken<Value>
    : never
  : never;
