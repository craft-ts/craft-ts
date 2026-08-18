# Plan — extraction ciblée de `ComponentDepsOf`

## Contexte

Le typecheck de `apps/demo` consacre la majeure partie de son temps à la vérification des types génériques. L’implémentation actuelle de `ComponentDepsOf` commence par calculer `keyof Value`, puis vérifie la présence de `CRAFT_COMPONENT_DEPS`. Cette étape force TypeScript à inspecter une grande partie de la forme de `CraftComponent`, notamment les types de template.

Une mesure virtuelle a montré qu’une extraction directe de la propriété symbolique pouvait réduire fortement le typecheck. La première implémentation directe s’est toutefois révélée incompatible avec la génération des déclarations ng-packagr. Le plan retient donc une extraction ciblée qui conserve la vérification explicite de la marque.

## Objectif

Réduire les instanciations de types lors de l’extraction des dépendances, sans modifier le contrat de dépendances ni les garanties de typage.

## Hors périmètre

- Modifier `RouteCheckedDI`.
- Modifier le calcul de `CraftComponentDependencies` ou `GetDeps`.
- Modifier la gestion exhaustive des exceptions.
- Modifier le runtime ou le format des composants/routes.

## Étapes

### 1. Renforcer les tests de type

Compléter les tests autour de `ComponentDepsOf` dans `libs/component/src/lib/types.spec.ts` pour couvrir :

- un composant Craft brandé ;
- un fragment produit par `loadCraftComponent` ;
- une route contenant ce fragment ;
- une valeur non brandée retournant `{}` ;
- `unknown`, `never`, `any` et les unions ;
- la conservation exacte de `deps`, `provided`, `missingProvider` et `publicProperties`.

### 2. Simplifier l’extraction sans perdre la marque

Dans `libs/core/src/lib/branded-component/branded-component.ts`, supprimer le test `Value extends object` et inférer directement la propriété symbolique, tout en conservant le garde-fou `keyof` qui distingue les valeurs effectivement brandées :

```ts
export type ComponentDepsOf<Value> = Value extends {
  readonly [CRAFT_COMPONENT_DEPS]?: infer Deps extends object;
}
  ? typeof CRAFT_COMPONENT_DEPS extends keyof Value
    ? Deps
    : {}
  : {};
```

Conserver `ComponentDepsCarrier` comme contrat public utilisé par les composants et fragments lazy.

### 3. Vérifier les garanties fonctionnelles de typage

Vérifier que les types suivants restent inchangés :

- propagation des dépendances composant → fragment lazy → route ;
- détection des providers manquants par `RouteCheckedDI` ;
- filtrage par `provided` ;
- validation des inputs publics ;
- gestion exhaustive des exceptions via `ComponentExceptionsOf`.

### 4. Exécuter les validations

Exécuter les tests de types de `component` et `core`, puis le typecheck de `demo`.

Comparer les diagnostics avec l’état de référence, en distinguant les éventuels diagnostics déjà présents dans `core`.

### 5. Mesurer le gain

Mesurer avant/après avec `--extendedDiagnostics` :

- temps de `check` ;
- nombre de `Types` ;
- nombre d’`Instantiations` ;
- mémoire maximale ;
- temps total du typecheck.

Mesure de référence et résultat observé sur `apps/demo` :

- avant : `Check time` 81,39 s, `Total time` 87,55 s ;
- variante ciblée : `Check time` 54,20 s, `Total time` 64,77 s ;
- réduction du temps de vérification : environ 33 % ;
- build ng-packagr de `@craft-ts/core` validé avec la variante ciblée.

L’extraction entièrement directe, bien que plus rapide en test isolé, est rejetée : elle provoque une incompatibilité lors de la génération des déclarations publiques.

## Critères d’acceptation

- Aucun nouveau diagnostic TypeScript.
- Les tests de propagation des dépendances passent.
- Les tests de providers manquants et de routes restent valides.
- `ComponentDepsOf` retourne `{}` pour les valeurs non brandées.
- Le temps de vérification du demo diminue significativement.
- Aucun changement runtime n’est introduit.

## Risques et précautions

La sémantique doit être vérifiée pour `any`, `never`, les unions et les propriétés symboliques optionnelles. Le changement doit rester limité à l’extraction ; les calculs produisant les maps de DI ne doivent pas être simplifiés dans ce plan.
