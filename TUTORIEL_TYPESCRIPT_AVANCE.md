# Tutoriel TypeScript avance (inspire de craft-ts)

Objectif: partir de zero et aller jusqu aux patterns de typage avances utilises dans craft-ts. Les sections suivent un ordre logique: fondamentaux -> generiques -> typage conditionnel -> metaprogrammation de types -> conseils de debug.

## 1. Fondamentaux a revoir rapidement
- Primitifs et alias: `type UserId = number;` pour nommer une intention.
- Interfaces vs types: `interface` se merge automatiquement, `type` supporte unions et intersections. Dans le code craft-ts, les formes complexes utilisent surtout `type` pour pouvoir remapper des clefs (`ReplaceStoreConfigToken`).
- Typage structurel: deux types sont compatibles si leurs structures matchent, pas leurs noms. Garder cela en tete pour la composition (`MergeTwoContexts`).
- Unions et intersections: `A | B` (un ou l autre), `A & B` (les deux). Les contexts sont merges par intersection.
- Literal types et `as const`: figer la valeur pour que TypeScript infere un literal (`'root'` vs `string`). Utile pour des options comme `providedIn: 'root' as const`.
- Type guards: `typeof`, `in`, `instanceof`, ou predicats personnalisés `function isFoo(x): x is Foo`. Indispensable pour restreindre `unknown` ou `any`.
- `unknown`, `any`, `never`, `void`: privilegier `unknown` quand on ne sait pas, eviter `any`. `never` sert aux checks d exhaustivite, `void` pour les fonctions qui ne retournent rien d utile.
- Fonctions et overloads: preferer des parametres optionnels typed plutot que des `any`. Les overloads sont utilises dans `craft` pour decrire des signatures variees selon le nombre de factories.

## 2. Generiques: contrainte, defaut, inference
- Declaration de base: `function wrap<T>(value: T): { value: T }`.
- Contraindre: `function pluck<T, K extends keyof T>(obj: T, key: K): T[K]`.
- Valeur par defaut: `type WithDefault<T = string> = T`.
- `keyof`, `in`, `extends`: combinables pour mapper des objets (`{ [K in keyof T]: ... }`).
- Bloquer une inference trop large: patron `type NoInfer<T> = [T][T extends any ? 0 : 1];` (utilise implicitement dans `craft` pour eviter qu un argument guide l inference d un autre).
- Exemple inspire de `CraftFactory`:
  ```ts
  type ContextConstraints = { props: {}; methods: Record<string, Function> };
  type CraftFactory<Ctx extends ContextConstraints, StoreName extends string> = (
    ctx: Ctx,
  ) => { [K in `inject${Capitalize<StoreName>}Craft`]: () => Ctx['props'] & Ctx['methods'] };
  ```
  Ici, `Ctx` est contraint et `StoreName` est inferer depuis les options.

## 3. Mapped types et remapping de clefs
- Base: `type ReadonlyProps<T> = { readonly [K in keyof T]: T[K] };`.
- Filtrage: `type FilterPrivate<T> = { [K in keyof T as K extends `_${string}` ? never : K]: T[K] };` (voir `FilterPrivateFields`).
- Remapping avec template literal: `ReplaceStoreConfigToken` remplace des tokens dans les noms en fonction d une config:
  ```ts
  type ReplaceToken<
    Name extends string,
    Token extends string,
    Value extends string
  > = Name extends `${infer P}${Token}${infer S}` ? ReplaceToken<`${P}${Value}${S}`, Token, Value> : Name;
  ```
- Template literal utilitaires: `Capitalize`, `Uppercase`, `Lowercase`, `Uncapitalize` pour produire des noms dynamiques (`inject${Capitalize<Name>}Craft`).

## 4. Types conditionnels et distribution
- Forme: `T extends U ? X : Y`.
- Distribution sur les unions: `T` est distribue quand il est nu (`T extends U ? ...`). Envelopper dans un tuple pour bloquer la distribution: `[T] extends [U] ? ...`.
- Detection de `never`, `any`, `unknown`:
  ```ts
  type IsNever<T> = [T] extends [never] ? true : false;
  type IsAny<T> = 0 extends (1 & T) ? true : false; // variante
  type IsUnknown<T> = unknown extends T ? ([T] extends [unknown] ? true : false) : false;
  ```
- Contrats: `EnableInputsToBeExternallyProvided` ajoute une option `EXTERNALLY_PROVIDED` seulement si `providedIn` n est pas `feature`. C est un conditional type avec un flag booleen derive.
- Egalite structurelle: `IsEqual<A, B>` dans `craft` compare deux types via une double fonction.

## 5. Utilitaires de composition (inspiration craft-ts)
- Intersection iteratives: `MergeObjects<[A, B, C]>` replie un tuple de types en une intersection, utile pour accumuler des outputs de factories.
- Nettoyage d index signature: `RemoveIndexSignature<T>` supprime les clefs `[key: string]` afin de garder seulement les clefs reelles exposees.
- `Prettify<T>`: force TypeScript a re-materialiser l intersection pour l afficher proprement.
- `UnionToIntersection<U>` et `UnionToTuple<U>`: convertissent un union en intersection ou en tuple ordonne (utilise pour signaler des methodes inconnues dans un message d erreur).
- `ExcludeCommonKeys<Origin, Target>`: retire les clefs deja branchees pour que l API public ne masque pas un comportement interne.
- Pattern: `MergeTwoContexts<A, B>` croise props, methods, inputs, etc. par intersection pour conserver le typage de chaque etape de composition.

## 6. Tuples, variadic et inference avec `infer`
- Variadic tuples: `type Tail<T extends any[]> = T extends [any, ...infer R] ? R : never;`.
- `infer` dans les template literal: extraire des segments de string (`Capitalize` est un cas integre au langage).
- `infer` dans les conditionnels complexes:
  ```ts
  type ExtractProps<T> = T extends { props: infer P } ? P : {};
  type GetUnionLast<U> = UnionToIntersection<U extends any ? () => U : never> extends () => infer L ? L : never;
  type UnionToTuple<U, R extends unknown[] = []> = [U] extends [never] ? R : UnionToTuple<Exclude<U, GetUnionLast<U>>, [GetUnionLast<U>, ...R]>;
  ```
- Overloads + tuples: les surcharges de `craft` utilisent des tuples positionnels de generiques (`outputs1`, `outputs2`, ...) pour faire evoluer le contexte a chaque factory.

## 7. Typage des APIs fluent et des factories
- Pattern builder: chaque appel retourne un type affine avec plus d info. Exemple simplifie d une factory craft-ts:
  ```ts
  type Context = { props: { count: number }; methods: { inc(): void } };

  function makeCounter<Name extends string>(name: Name) {
    const token = Symbol(name);
    return Object.assign(
      () => ({ count: 0, inc() {} }),
      { token, name: `inject${Capitalize<Name>}` as const },
    );
  }
  const counter = makeCounter('counter'); // name: "injectCounter"
  ```
- Garder les types runtime et compile-time relies: passer la config typée (`storeConfig`) a toutes les fonctions pour que les template literal types restent synchronises.
- Exposer et masquer: `ExcludeCommonKeys` permet de ne pas exposer des methodes interne en sortie, meme si elles existent a runtime.

## 8. Marques nominales et branding
- TypeScript est structurel, mais on peut simuler le nominal:
  ```ts
  declare const Brand: unique symbol;
  type Branded<T, Name extends string> = T & { readonly [Brand]: Name };
  type UserId = Branded<number, 'UserId'>;
  ```
- `SourceBranded` (dans util/util) suit ce pattern pour distinguer un `Source<T>` d une simple valeur.
- Usage: eviter de confondre deux numeros differents (UserId vs OrderId), ou signaler qu une fonction attend une ressource brande.

## 9. Assurer la coherence runtime/type
- `as const` sur les objets d options pour conserver les literals.
- `satisfies` (TS 4.9+) pour verifier une shape sans redeclarer le type:  
  `const config = { providedIn: 'root', name: 'counter' } satisfies StoreConfigConstraints;`.
- Exhaustivite: pattern `never` pour les switch:
  ```ts
  type Kind = 'loading' | 'ready' | 'error';
  function render(kind: Kind) {
    switch (kind) {
      case 'loading': return;
      case 'ready': return;
      case 'error': return;
      default: const _exhaustive: never = kind; return _exhaustive;
    }
  }
  ```
- Brider les appels utilisateur: `EnableInputsToBeExternallyProvided` ajoute un token `EXTERNALLY_PROVIDED` pour forcer le developpeur a signaler qu une valeur vient de l exterieur.

## 10. Patterns de messages d erreur types
- Construire des messages lisibles via template literal types:
  ```ts
  type ErrorIfUnknownInput<Given, Expected extends string> =
    Exclude<keyof Given, Expected> extends infer Unknown
      ? [Unknown] extends [never]
        ? {}
        : { errorInputsMsg: `Inputs inconnus: ${Unknown & string}` }
      : never;
  ```
- craft-ts utilise `errorInputsMsg` et `errorMethodMsg` pour guider le developpeur avant meme l execution.

## 11. Performance et limites du checker
- Eviter les recursions profondes inutilement (limite par `--maxNodeModuleJsDepth` et profondeur de recursion de type).
- Preferer des types "prettifies" pour reduire le bruit dans les messages.
- Splitter un gros type en plusieurs utilitaires comme `MergeTwoContexts`, `UnionToTuple`.
- Desactiver la distribution quand elle n est pas voulue en emballant dans des tuples.

## 12. Debug du typage
- Inspecter un type via un alias temporaire: `type Debug = YourComplexType;`.
- Ajouter des tests de type avec `tsd` ou `expect-type`:
  ```ts
  import { expectTypeOf } from 'expect-type';
  expectTypeOf(craftStore1.props.count).toEqualTypeOf<number>();
  ```
- Lancer `tsc --noEmit` regulierement, ou `ts-node --transpile-only` pour tester vite.

## 13. Exercices pratiques inspires du projet
- Recreer `RemoveIndexSignature` puis l appliquer sur un type avec une cle `[key: string]: number`.
- Ecrire `UnionToTuple` et l utiliser pour afficher une erreur detaillee sur les clefs inconnues d un objet.
- Construire une mini-factory typée:
  1. `createStore({ name: 'user', providedIn: 'root' })`
  2. `store.addInputs<{ userId: number }>()`
  3. `store.addMethods<{ load(): Promise<User> }>()`
  4. `store.inject({ inputs: { userId: 1 }, methods: { load: source } })`  
  Typage attendu: les inputs et methods injectes ne peuvent pas depasser ce qui a ete declare.
- Ajouter un branding a un id (`UserId`) et voir comment cela evite de passer un `OrderId`.
- Creer un type `Diff<A, B>` comme dans `craft.ts` et l utiliser pour comparer deux interfaces.

## 14. Checklist de conception d APIs typees
- Toujours preferer `unknown` a `any`, ajouter des type guards.
- Fournir des messages d erreur types pour guider l utilisateur.
- Re-exporter des utilitaires `Prettify`, `UnionToTuple`, `RemoveIndexSignature` pour encourager leur reutilisation.
- Garder la coherence runtime/type avec `as const` et `satisfies`.
- Limiter les overloads en faveur de parametres optionnels ou de fonctions auxiliaires quand c est suffisant.

## 15. Lecture recommandees
- Handbook TypeScript (sections Generics, Advanced Types).
- Release notes TS 4.9+ (`satisfies`, template literal improvements).
- Source du projet: `libs/core/src/lib/craft.ts` et `libs/core/src/lib/util/util.type.ts` montrent des patterns avances de composition, d erreurs types et de remapping.

Bonne pratique: cloner un type complexe du projet, supprimez une piece, regardez comment le checker reagit, puis reconstruisez le type pas a pas. C est le meilleur moyen de maitriser ces techniques dans vos propres APIs.
