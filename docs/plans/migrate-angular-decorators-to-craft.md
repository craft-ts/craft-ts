# Migrer les décorateurs Angular du moteur vers Craft

## Objectif

Réduire les `@Component` et `@Directive` présents dans le moteur ng-craft en
les remplaçant par des `craftComponent` et `craftDirective`, tout en conservant
les intégrations nécessaires avec Angular Router, l'injection de dépendances et
le cycle de vie DOM.

La migration doit préserver :

- le typage des composants et des routes ;
- les dépendances Craft détectées par le compilateur et les outils DI ;
- le comportement de `CraftRouterLink` ;
- le comportement complet de `CraftFieldDirective` ;
- le nettoyage des effets, écouteurs et contrôles enregistrés ;
- la compatibilité temporaire avec les applications Angular existantes.

## État actuel

La migration décrite dans ce plan est désormais implémentée. Les sections
ci-dessous conservent les décisions et les étapes ayant conduit à
l'implémentation actuelle.

Les décorateurs restants ne sont pas tous de même nature.

### Adaptateurs DOM

`CraftRouterLink` et `CraftFieldDirective` sont maintenant des directives de
nœud Craft attachées directement aux éléments DOM rendus par l'interpréteur.
Les classes Angular `LegacyCraftRouterLink` et
`LegacyCraftFieldDirective` restent exportées comme adaptateurs dépréciés.

Leur liaison DOM utilise :

- le contexte local du nœud pour connaître l'élément cible ;
- `Renderer2` fourni par l'interpréteur pour modifier le DOM ;
- le lifecycle du montage de la directive pour le nettoyage ;
- `RouterLink` ou `Router` pour la navigation ;
- des tokens DI pour les contrôles de formulaire personnalisés.

### Hosts Angular

Les composants de `libs/component/src/lib/bridge.ts` servent à monter un
composant Craft dans un contexte Angular : bootstrap, routes, erreurs et
pending UI.

`CraftAngularDirectiveHost` sert d'ancre technique lorsque le renderer Craft
monte une directive Angular externe.

### Routing et composants pending/error

`craft-pending.ts` et `craft-route-load-error.ts` acceptent désormais un
`CraftRouteTarget`, qui peut représenter une target Angular ou Craft. Le host
Angular demeure à la frontière où le contrat `Route` attend un
`component`/`loadComponent` Angular.

Le Craft Router enrichit actuellement Angular Router ; il ne remplace pas
encore son contrat de rendu.

## Décisions d'architecture

### 1. Fournir les dépendances DOM depuis le contexte du nœud

L'implémentation fournit l'élément, le renderer et l'injecteur directement dans
`CraftNodeDirectiveContext`. Elle n'ajoute donc pas d'adaptateurs publics
`toCraftService` pour `ElementRef`, `Renderer2` ou `DestroyRef` :

```ts
type CraftNodeDirectiveContext = {
  readonly element: Element;
  readonly injector: Injector;
  readonly renderer: Renderer2;
};
```

Le cleanup retourné par le montage est détruit avec le nœud. Les tokens propres
aux contrôles personnalisés continuent d'être résolus depuis l'injecteur local.

### 2. Ajouter un contexte d'injection par nœud Craft

Un `ElementRef` injecté dans un `craftComponent` représente le host du
composant. Il ne représente pas automatiquement chaque élément enfant rendu
par son template.

Pour migrer `CraftFieldDirective`, le renderer doit donc créer un contexte
local lorsqu'une directive Craft est appliquée à un nœud :

```text
injecteur du composant Craft
        |
        +-- injecteur de directive/nœud
                - ElementRef de l'élément ciblé
                - Renderer2 du renderer Craft
                - DestroyRef local
```

La durée de vie de cet injecteur doit être exactement celle du nœud décoré.
Lors de sa destruction, il doit libérer :

- les `EffectRef` ;
- les écouteurs DOM ;
- les contrôles enregistrés sur `CraftField` ;
- les éventuels enregistrements de target/observabilité.

### 3. Étendre `craftDirective` sans casser la composition de composants

Le contrat actuel de `craftDirective` compose une factory et un template de
composant. Il faut conserver ce comportement et ajouter une capacité
optionnelle de montage sur un nœud DOM.

Le contrat cible pourrait ressembler à ceci :

```ts
type CraftNodeDirectiveContext = {
  readonly element: Element;
  readonly injector: Injector;
  readonly renderer: Renderer2;
  readonly props: Readonly<Record<string, unknown>>;
};

type CraftNodeDirectiveMount = (
  context: CraftNodeDirectiveContext,
) => void | (() => void);
```

Le montage doit rester optionnel : les directives structurelles existantes
(`whenDirective`, `longPress`, `catchTag`, etc.) ne doivent pas être obligées
de manipuler le DOM directement.

### 4. Migrer `CraftRouterLink` sans remplacer Angular Router

La directive Craft fonctionnelle utilisera l'API publique du Router :

- `createUrlTree` pour calculer l'URL ;
- `serializeUrl` pour produire `href` ;
- `navigateByUrl` pour déclencher la navigation ;
- les options existantes pour query params, fragment, `replaceUrl`,
  `skipLocationChange`, state et view transitions.

Le comportement de clic devra respecter les cas où la navigation ne doit pas
être interceptée :

- clic droit ou bouton central ;
- touches modificatrices ;
- `target` externe ;
- élément désactivé ou absence d'input ;
- navigation vers une URL externe si elle est supportée par l'API.

Pendant la transition, l'ancien `CraftRouterLink` Angular pourra rester exporté
comme compatibilité dépréciée jusqu'à la fin de la migration.

### 5. Migrer `CraftFieldDirective` en conservant son comportement

La migration doit conserver les stratégies suivantes :

- texte (`input`, `textarea`) ;
- nombre et range ;
- dates et valeurs temporelles ;
- checkbox ;
- radio ;
- select ;
- contrôle de valeur personnalisé ;
- contrôle checkbox personnalisé.

Chaque stratégie doit continuer à gérer :

- synchronisation modèle → DOM ;
- synchronisation DOM → modèle ;
- reset ;
- blur et état `touched` ;
- états `disabled`, `readonly`, `hidden` ;
- attributs natifs `required`, `min`, `max`, `minlength`, `maxlength`,
  `pattern` ;
- classes d'état Craft ;
- validators et erreurs de schéma ;
- cleanup intégral.

Pour un champ configuré via `insertSelectFormTree`, la directive doit recevoir
le sous-formulaire matérialisé par `selectXxx()`. Passer directement le champ
brut (`form.email`) contourne les insertions lazy et empêche notamment
l'enregistrement des validateurs.

La logique métier de synchronisation devra être extraite des hooks Angular
dans des fonctions testables indépendamment :

```ts
function bindTextField(
  element: HTMLInputElement | HTMLTextAreaElement,
  field: CraftField<string>,
  context: CraftNodeDirectiveContext,
): () => void;
```

La directive Craft orchestrera ensuite la détection de stratégie et le
nettoyage global.

### 6. Conserver un host Angular minimal pour les routes

Le contrat Angular `Route` impose encore `Type<unknown>` pour les routes
standards et les routes de récupération après erreur de lazy-load.

Le modèle cible sera donc hybride pendant la transition :

```ts
type CraftRouteTarget =
  | {
      readonly kind: 'angular';
      readonly component: Type<unknown>;
    }
  | {
      readonly kind: 'craft';
      readonly component: CraftComponent<any>;
    };
```

`CraftRouterOutlet` pourra rendre directement les deux types. Le core ne doit
pas importer `@craft-ng/component`, afin d'éviter une dépendance circulaire.
Le protocole de target devra donc vivre dans une couche neutre, ou être
représenté par un contrat opaque enregistré par `@craft-ng/component`.

Le host Angular reste nécessaire uniquement au niveau du contrat Router :

```text
Angular Route
      ↓
host Angular minimal
      ↓
CraftRouterOutlet
      ↓
target Angular ou Craft
```

## Phases d'implémentation

### Phase 1 — Contrats et infrastructure

1. Vérifier les types publics actuels de `craftDirective`, `CraftNode` et du
   renderer.
2. Définir le contrat de contexte de directive attachée à un nœud.
3. Fournir les dépendances DOM nécessaires dans le contexte du nœud.
4. Fournir `Renderer2` depuis le renderer Craft, car il n'est pas forcément
   disponible dans l'injecteur d'un composant fonctionnel.
5. Créer et détruire l'injecteur local de chaque directive DOM.
6. Ajouter des tests de lifecycle et de cleanup.

### Phase 2 — Migration de `CraftRouterLink`

1. Extraire la construction des commandes et options de navigation dans des
   fonctions pures.
2. Implémenter le montage Craft sur un nœud DOM.
3. Répliquer le calcul de `href`.
4. Implémenter l'interception des clics compatible avec RouterLink.
5. Ajouter les cas de query params, fragment, state et view transitions.
6. Migrer le demo et la documentation vers la nouvelle directive.
7. Garder l'ancien adaptateur Angular sous une forme dépréciée si nécessaire.

### Phase 3 — Migration de `CraftFieldDirective`

1. Extraire les fonctions de liaison par stratégie.
2. Remplacer les accès directs à `ElementRef`, `Renderer2` et `DestroyRef`
   par le contexte de directive et les adaptateurs Craft.
3. Brancher la directive sur l'injecteur local du nœud.
4. Migrer les contrôles personnalisés et leurs tokens.
5. Ajouter des tests unitaires pour chaque stratégie.
6. Ajouter des tests d'intégration pour plusieurs champs dans un même
   composant, afin de vérifier que chaque champ reçoit son propre élément.
7. Ajouter un test d'intégration avec `insertSelectFormTree` qui vérifie les
   attributs natifs, les classes d'état et le blocage d'une soumission invalide.
8. Déprécier puis retirer l'ancienne classe Angular après migration des
   consommateurs.

### Phase 4 — Targets Craft dans le routing

1. Définir un protocole neutre pour représenter une target Craft.
2. Étendre `CraftRouterOutletController` pour exposer une target Angular ou
   Craft.
3. Étendre `CraftRouterOutlet` pour rendre une target Craft via
   `mountCraftComponent`.
4. Adapter `loadCraftComponent` pour utiliser ce protocole.
5. Migrer les composants pending et error vers des composants Craft.
6. Conserver le host Angular uniquement pour satisfaire le contrat de route
   Angular.
7. Tester les erreurs de lazy-load, les loaders, les erreurs globales et les
   transitions rapides.

### Phase 5 — Nettoyage et compatibilité

1. Mettre à jour les exports publics.
2. Ajouter les annotations `@deprecated` sur les anciennes classes Angular.
3. Mettre à jour les exemples et la documentation.
4. Vérifier les règles ESLint de dépendances Craft.
5. Supprimer les anciens adaptateurs uniquement dans une version majeure ou
   après une période de compatibilité documentée.

## Tests attendus

### Runtime des directives

- une directive Craft reçoit le bon `ElementRef` ;
- deux nœuds décorés ne partagent pas leur contexte ;
- le contexte est détruit quand le nœud disparaît ;
- les effets et écouteurs sont effectivement nettoyés ;
- une mise à jour de props ne recrée pas inutilement la directive.

### Router link

- `href` est correct ;
- les paramètres de route sont validés et interpolés ;
- les query params et fragments sont conservés ;
- les clics modifiés ne sont pas interceptés ;
- `replaceUrl`, `skipLocationChange` et state sont transmis ;
- les view transitions conservent leur payload.

### Form field

- chaque type d'élément utilise la bonne stratégie ;
- les changements DOM mettent à jour le champ ;
- les changements du champ mettent à jour le DOM ;
- reset, touched, dirty et disabled restent corrects ;
- les validators et attributs natifs restent synchronisés ;
- les contrôles personnalisés restent compatibles.

### Routing

- une route Angular continue de fonctionner ;
- une route Craft est rendue par l'interpréteur Craft ;
- pending et error acceptent une target Craft ;
- une erreur de chunk continue d'être récupérée ;
- un composant Angular reste utilisable comme target ;
- les checks DI et `componentDeps` restent valides.

## Risques et réponses

| Risque                                                        | Réponse                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `ElementRef` pointe vers le host du composant au lieu du nœud | Créer un injecteur local par nœud décoré.                                           |
| Fuite d'effets ou d'écouteurs                                 | Lier le cleanup au `DestroyRef` de l'injecteur du nœud et tester la destruction.    |
| Régression RouterLink                                         | Extraire les options pures et conserver un adaptateur Angular de compatibilité.     |
| Dépendance circulaire core/component                          | Utiliser un protocole de target neutre et garder le montage concret dans component. |
| Perte de compatibilité Angular Router                         | Conserver un host Angular minimal autour des routes.                                |
| Régression de typage DI                                       | Régénérer les `GenDeps_*` et valider les checks de routes après chaque phase.       |

## Critères de réussite

La migration sera considérée comme réussie lorsque :

- `CraftRouterLink` et `CraftFieldDirective` fonctionneront comme directives
  Craft sans dépendre de hooks Angular personnalisés ;
- les composants pending/error pourront être définis en Craft ;
- le host Angular restant sera limité à la frontière imposée par Angular Router
  et le bootstrap ;
- les anciennes API resteront compatibles ou seront explicitement dépréciées ;
- les tests ciblés, le typecheck, le lint et le build complet passeront.
