import type { CraftSchema, SchemaInput, SchemaOutput } from './schema-validation';

/**
 * Briques de typage partagées par les deux familles de middleware — serveur
 * (`craftMiddleware(id).server(...)`) et client (`.client(...)`).
 *
 * La fusion des contextes et des schémas est strictement la même logique
 * appliquée à deux canaux différents : elle vit donc ici plutôt que dupliquée.
 */

export type MiddlewareContext = Record<string, unknown>;

/** Fusion ordonnée de deux contextes : les clés de droite gagnent. */
export type OverwriteContext<Left, Right> = Simplify<
  Omit<Left, keyof Right & keyof Left> & Right
>;

export type Simplify<Value> = { [Key in keyof Value]: Value[Key] } & {};

export type UnionToIntersection<Union> = (
  Union extends unknown ? (value: Union) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;

/**
 * Intersection des sorties de tous les schémas collectés le long de la chaîne.
 * Un schéma unique est conservé tel quel : une server function sans middleware
 * peut donc garder un input non objet.
 */
export type MergeSchemaOutputs<Schemas extends readonly CraftSchema[]> =
  Schemas extends readonly [infer Only extends CraftSchema]
    ? SchemaOutput<Only>
    : Simplify<UnionToIntersection<SchemaOutput<Schemas[number]>>>;

/** Pendant de `MergeSchemaOutputs` côté entrée : ce que l'appelant doit fournir. */
export type MergeSchemaInputs<Schemas extends readonly CraftSchema[]> =
  Schemas extends readonly [infer Only extends CraftSchema]
    ? SchemaInput<Only>
    : Simplify<UnionToIntersection<SchemaInput<Schemas[number]>>>;

/**
 * Comme `MergeSchemaOutputs`, mais un tuple vide vaut « aucune clé » plutôt que
 * l'intersection dégénérée d'un ensemble vide. Utilisé pour les canaux
 * facultatifs (contexte client), où l'absence de schéma est le cas courant.
 */
export type MergeOptionalSchemaOutputs<
  Schemas extends readonly CraftSchema[],
> = Schemas extends readonly [] ? Record<never, never> : MergeSchemaOutputs<Schemas>;

export type MergeOptionalSchemaInputs<
  Schemas extends readonly CraftSchema[],
> = Schemas extends readonly [] ? Record<never, never> : MergeSchemaInputs<Schemas>;

declare const MIDDLEWARE_RESULT: unique symbol;
declare const MIDDLEWARE_DOWNSTREAM_ERROR: unique symbol;

/**
 * Résultat opaque de `next()`, porteur du contexte que le middleware ajoute.
 *
 * C'est le pivot de l'inférence : TypeScript ne peut rien déduire de l'argument
 * passé à un paramètre, mais il déduit sans peine depuis le type de retour. Le
 * contexte voyage donc dans le type retourné par `next()`.
 *
 * Conséquence utile : ce type n'est constructible que par `next()`. La chaîne
 * serveur propose en parallèle une forme directe `{ context }` pour les
 * enrichissements synchrones ou Promise, qui fait avancer la chaîne
 * automatiquement.
 */
export interface MiddlewareResult<Context extends MiddlewareContext> {
  readonly [MIDDLEWARE_RESULT]: Context;
}

/** Échec produit par la suite de la chaîne : observable, non inspectable. */
export interface MiddlewareDownstreamError {
  readonly [MIDDLEWARE_DOWNSTREAM_ERROR]: true;
}

/** Le minimum commun aux deux familles pour être aplati et dédupliqué. */
export type MiddlewareNode = {
  readonly id: string;
  readonly dependencies: readonly MiddlewareNode[];
};

/**
 * Aplatit les dépendances (profondeur d'abord) et déduplique par identifiant.
 *
 * La déduplication serait silencieuse par construction : deux middleware de même
 * identifiant mais d'implémentation différente donneraient un typage juste et un
 * runtime faux, d'où le rejet explicite.
 */
export function flattenMiddlewareGraph<Middleware extends MiddlewareNode>(
  middlewares: readonly Middleware[],
): readonly Middleware[] {
  const seen = new Map<string, Middleware>();
  const ordered: Middleware[] = [];

  const visit = (middleware: Middleware): void => {
    const known = seen.get(middleware.id);
    if (known) {
      if (known !== middleware) {
        throw new Error(
          `Duplicate middleware id "${middleware.id}" with two different implementations.`,
        );
      }
      return;
    }
    seen.set(middleware.id, middleware);
    for (const dependency of middleware.dependencies) {
      visit(dependency as Middleware);
    }
    ordered.push(middleware);
  };

  for (const middleware of middlewares) visit(middleware);
  return ordered;
}

export function assertMiddlewareId(id: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._:-]*$/.test(id)) {
    throw new Error(
      `Invalid middleware id "${id}". Use a stable dotted identifier.`,
    );
  }
}
