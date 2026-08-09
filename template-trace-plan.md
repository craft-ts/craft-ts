# Traçabilité complète des fonctions, composants et templates

## Résumé

Compléter l’évolution de `provideFnWrapper` avec un mécanisme dédié au rendu : `provideTemplateTrace`.

Les responsabilités seront séparées :

- `provideFnWrapper` : services, primitives, méthodes, callbacks, composants et directives ;
- `provideTemplateTrace` : exécutions et mises à jour effectives des templates ;
- `provideCraftDomEventHook` : actions utilisateur et événements DOM.

## `provideFnWrapper`

Conserver le contexte discriminé typé prévu :

```ts
type FnWrapperInvocation = Readonly<{
  context: FnWrapperContext;
  factory: AnyFactory;
  thisArg: unknown;
  args: readonly unknown[];
}>;
```

Il couvrira notamment :

- création de services ;
- création de composants ;
- factories de directives composées ;
- factories `state`, `query`, `mutation`, `asyncProcess`, `queryParams` ;
- loaders, params, streams, méthodes et insertions ;
- callbacks de templates ;
- méthodes `craftMethod`, pipes, validators et guards.

Les composants composés exposeront aussi les noms des directives appliquées dans leur contexte.

## `provideTemplateTrace`

Ajouter une API dédiée au moteur de rendu :

```ts
type TemplateTraceContext = Readonly<{
  kind: 'component' | 'block' | 'projection' | 'defer' | 'callback';
  phase: 'create' | 'initialRender' | 'update' | 'destroy';
  componentName?: string;
  name?: string;
  renderCount: number;
}>;

type TemplateTraceWrapper = (
  context: TemplateTraceContext,
  next: () => CraftNodeChildren,
) => CraftNodeChildren;

function provideTemplateTrace(
  wrapper: TemplateTraceWrapper,
): Provider;
```

Le wrapper sera composable et pourra :

- journaliser le début et la fin d’un rendu ;
- mesurer sa durée ;
- effectuer des checks ;
- interrompre ou remplacer un rendu si nécessaire ;
- observer les erreurs de rendu.

Il sera appelé autour de chaque rendu effectif :

- template principal d’un composant ;
- mises à jour réactives ;
- blocs `if`, `each`, `match`, `defer` ;
- projections et templates imbriqués ;
- callbacks qui produisent des nœuds ;
- patchs de fragments lorsque le DOM rendu est effectivement réconcilié.

Chaque composant conservera un compteur de rendu permettant de distinguer la création, le premier rendu et les mises à jour suivantes.

## Corrélation des événements

Le système devra permettre de reconstruire une chaîne telle que :

```text
clic utilisateur
  → callback template
  → méthode de primitive
  → mise à jour d’état
  → rerender du composant
  → patch d’un bloc/template
```

Les métadonnées existantes de `CraftDomEvent` resteront la source pour les actions utilisateur : élément, événement, composant, nom d’interaction et méthode appelée.

Les wrappers de fonctions et de templates devront préserver le contexte d’injection et l’ordre d’exécution afin qu’un traceur puisse associer les événements à un même identifiant de corrélation.

## Tests

Ajouter des tests vérifiant :

- la réception de `initialRender` puis `update` lors d’une modification réactive ;
- la couverture des blocs imbriqués et projections ;
- la réception de `create` et `destroy` pour les composants ;
- l’ordre `before/after` du wrapper template ;
- la possibilité de remplacer ou bloquer un rendu ;
- la propagation des erreurs ;
- la corrélation clic → méthode → mutation → rerender ;
- l’absence de double événement pour un même rendu effectif.

## Hypothèses retenues

- `provideTemplateTrace` est distinct de `provideFnWrapper`.
- Le wrapper template est synchrone, car le rendu produit immédiatement des nœuds.
- Le wrapper peut choisir de ne pas appeler `next()`.
- Le niveau de traçage couvre tous les rendus effectifs, pas seulement les templates principaux des composants.
- Les différences DOM détaillées attribut par attribut resteront hors de cette première version ; elles pourront être ajoutées plus tard comme événements de patch spécialisés.
