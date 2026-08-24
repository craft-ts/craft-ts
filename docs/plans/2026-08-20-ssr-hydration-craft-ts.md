# Plan — SSR et hydratation CraftTS

## Objectif

Ajouter un SSR CraftTS runtime, sans dépendre d’un compilateur Craft pour la
première version.

```text
app CraftTS
  ├── bootstrapCraft()       → navigateur
  ├── renderCraft()          → serveur, HTML + snapshot
  └── hydrateCraft()         → navigateur, réutilisation du DOM
```

La première version doit couvrir :

- le rendu HTML côté serveur ;
- l’attente contrôlée des queries ;
- le transfert de l’état ;
- l’hydratation par clés structurelles ;
- le remontage local en cas de mismatch.

Le compilateur Craft reste hors périmètre initial. Le build TypeScript/Vite
reste bien sûr nécessaire pour produire le bundle serveur.

## Principes

- Un injector est créé par requête serveur.
- Le serveur et le client créent chacun leurs propres signaux.
- Seules les valeurs sérialisables sont transférées.
- L’identité DOM est déterministe et indépendante d’un compteur global.
- La politique SSR est déclarée au niveau du `pendingNode` ou de la route,
  jamais implicitement par la query.
- Un mismatch ne doit pas invalider toute la page : le sous-arbre concerné est
  remonté en mode normal.
- Le serveur n’installe aucun listener ni effet navigateur.
- L’hydratation partielle vient après l’hydratation complète d’une page.

## Phase 0 — Contrat SSR

Définir les règles de rendu côté serveur et l’endroit où elles sont déclarées.

La décision appartient à la frontière qui possède le rendu de l’attente :

- un `pendingNode` pour une sous-partie précise du template ;
- une route pour la politique par défaut de toute la page.

La query décrit ses données et son loader. Elle ne décide pas si le serveur doit
attendre ou non.

```ts
type SsrMode = 'block' | 'fallback' | 'client';
```

Comportement attendu :

- `block` : attendre la résolution avant d’envoyer le HTML ;
- `fallback` : rendre le fallback du `pendingNode` ou de la route ;
- `client` : ne pas exécuter la query côté serveur et rendre le shell/fallback
  prévu par la frontière.

### Déclaration au niveau du bloc

L’API exacte reste à définir, mais le contrat cible ressemble à ceci :

```ts
div([
  UserList(),
]).pipe(
  pendingNode({
    ssr: 'block',
    fallback: () => UserListSkeleton(),
  }),
);
```

Le bloc devient responsable de toutes les sources asynchrones suspendues dans
son sous-arbre. Une forme exhaustive peut continuer à associer des fallbacks
différents aux sources, mais la politique SSR reste attachée à la frontière :

```ts
div([...]).pipe(
  pendingNode.exhaustive(
    {
      users: () => UsersSkeleton(),
      orders: () => OrdersSkeleton(),
    },
    { ssr: 'fallback' },
  ),
);
```

La politique `ssr: 'client'` nécessite un fallback ou un shell explicite. Le
serveur ne peut pas produire le contenu dépendant de la query, mais il doit
produire une structure hydratable et stable.

### Déclaration au niveau de la route

La route fournit la politique par défaut lorsque la query est lue hors d’un
`pendingNode` local :

```ts
craftRoute('dashboard', {
  ...loadCraftComponent(() => import('./dashboard')),
  ssr: {
    mode: 'block',
  },
});
```

Une politique locale de `pendingNode` est plus spécifique et surcharge la
politique de route. La priorité est donc :

```text
pendingNode local
  ↓
pending boundary de route
  ↓
politique SSR de route
  ↓
aucune politique
```

Une query déjà résolue ne déclenche pas de décision SSR. La politique ne
s’applique qu’à une lecture qui suspend faute de valeur initiale. Une query en
reloading avec une ancienne valeur continue à rendre cette valeur.

### Async non déclaré

Si une source suspend pendant le SSR sans trouver de politique applicable, le
rendu échoue avec une erreur explicite, sur le même principe que
`CraftUnhandledPendingError` lorsqu’une source échappe à un `pendingNode` :

```text
CraftUnhandledSsrResolutionError
  source: usersQuery
  route: dashboard
  reason: no pendingNode or route SSR policy
```

Cela évite qu’un loader soit silencieusement ignoré ou qu’un serveur attende
indéfiniment.

Définir également :

- le timeout SSR ;
- l’`AbortSignal` de la requête ;
- la gestion des erreurs ;
- les valeurs autorisées dans le snapshot ;
- les données interdites dans le HTML ;
- l’isolation obligatoire entre deux requêtes concurrentes.

### Livrable

Une spécification SSR courte et documentée, avec :

- les trois modes ;
- la priorité bloc → route ;
- les fallbacks obligatoires pour `client` ;
- l’erreur pour les sources async non déclarées ;
- les règles de sérialisation et de résolution.

## Phase 1 — Identité de rendu déterministe

Ajouter une identité structurelle au contexte de rendu.

```ts
type CraftRenderIdentity = {
  readonly path: readonly string[];
  readonly hydrationKey: string;
};
```

Exemples :

```text
App/0
App/0/Dashboard/0
App/0/Dashboard/0/for:users/user:42
```

Règles :

- les composants statiques utilisent leur position logique ;
- `forNode` utilise sa clé métier ;
- les blocs utilisent un identifiant stable ;
- aucun compteur global ne participe à la clé ;
- aucun UUID aléatoire n’est généré pendant le rendu.

Conserver `HOST_TAG_LIST` pour les diagnostics et ajouter de préférence un
token séparé :

```ts
CRAFT_HYDRATION_ID
```

Cela évite de casser les logs, snapshots et tests qui dépendent aujourd’hui des
host tags.

### Livrables

- identité portée par le contexte de rendu ;
- propagation dans les injecteurs enfants ;
- prise en charge des composants imbriqués ;
- prise en charge des `forNode` avec clés ;
- tests de stabilité serveur/client.

## Phase 2 — Abstraction de plateforme

Créer une abstraction injectable pour l’environnement d’exécution.

```text
BrowserPlatform
ServerPlatform
```

Elle doit couvrir :

- `document` ;
- `window` ;
- `history` ;
- storage ;
- location ;
- performance ;
- crypto ;
- listeners.

Le navigateur conserve les implémentations natives. Le serveur fournit :

- un document virtuel ;
- `createMemoryHistory(url)` ;
- des storages in-memory ou désactivés ;
- des APIs no-op lorsque cela est approprié.

Le routeur ne doit plus dépendre directement de
`createBrowserHistory(window)` dans un contexte SSR.

### Livrables

- `bootstrapCraft()` reste compatible ;
- ajout d’un bootstrap serveur par requête ;
- injector séparé pour chaque requête ;
- test de non-contamination entre deux requêtes concurrentes.

## Phase 3 — Renderer HTML serveur

Implémenter :

```ts
createStringDomAdapter()
renderToString()
```

Le renderer virtuel doit gérer :

- éléments ;
- textes ;
- commentaires ;
- attributs ;
- propriétés initiales ;
- enfants ;
- bornes de blocs ;
- collecte CSS.

Exemple de sortie :

```html
<craft-root data-craft-root="App/0">
  <h1 data-craft-hk="App/0/0">Dashboard</h1>
  <!--craft-text:App/0/1-->42<!--/craft-text-->
</craft-root>
```

Le chemin SSR doit isoler les accès directs actuels à :

- `parentNode` ;
- `ownerDocument` ;
- `DocumentFragment` ;
- `Element` ;
- `focus` ;
- la registry de styles.

### Livrables

- rendu statique ;
- rendu avec `state` ;
- rendu de textes dynamiques ;
- rendu des blocs conditionnels ;
- collecte CSS ;
- test HTML déterministe.

## Phase 4 — Snapshot d’état

Étendre le mécanisme d’app snapshot pour créer un transfert SSR.

```ts
type CraftTransferSnapshot = {
  version: number;
  values: Record<string, unknown>;
  queries: Record<string, {
    status: string;
    value?: unknown;
    error?: unknown;
  }>;
};
```

Le serveur :

1. crée les primitives ;
2. exécute les queries `ssr: 'block'` ;
3. attend leur résolution ;
4. capture les valeurs ;
5. injecte le snapshot dans le HTML.

Le navigateur :

1. lit le snapshot ;
2. restaure les valeurs avant le premier rendu ;
3. crée de nouveaux signaux locaux ;
4. évite de refaire les requêtes déjà résolues.

Le snapshot doit être sérialisé de manière sûre, notamment en échappant les
séquences HTML dangereuses dans le JSON.

### Livrables

- snapshot d’un `state` ;
- snapshot d’une query résolue ;
- aucune seconde requête après hydratation ;
- gestion des erreurs et valeurs absentes.

## Phase 5 — Hydratation DOM

Ajouter un curseur capable de réclamer les nœuds existants.

```ts
type HydrationCursor = {
  claimElement(key: string, tag: string): Element;
  claimText(key: string): Text;
  claimBoundary(key: string): Comment;
  finish(): void;
};
```

Le contexte de rendu possède deux modes :

```ts
type RenderMode = 'create' | 'hydrate';
```

En mode `create` :

```ts
renderer.createElement('button');
```

En mode `hydrate` :

```ts
hydration.claimElement('App/0/2', 'button');
```

Pendant la première passe client :

- ne pas recréer les nœuds ;
- vérifier les tags et marqueurs ;
- rattacher les bindings ;
- différer les effets navigateur ;
- brancher les listeners ;
- éviter de réécrire inutilement les propriétés.

### Livrables

- hydratation d’un composant statique ;
- texte réactif ;
- binding d’attribut ;
- binding de propriété ;
- bouton interactif ;
- absence de doublon DOM.

## Phase 6 — Mismatch et fallback local

Créer une erreur structurée :

```ts
HydrationMismatchError {
  key;
  expected;
  actual;
  reason;
}
```

Cas à traiter :

- élément absent ;
- mauvais tag ;
- mauvaise branche `ifNode` ;
- clé `forNode` différente ;
- texte non compatible ;
- nombre d’enfants différent.

Stratégie :

```text
Mismatch dans un composant
  ↓
Détruire son sous-arbre
  ↓
Le remonter en mode create
  ↓
Conserver le reste de la page hydraté
```

En développement, produire un diagnostic détaillé. En production, effectuer un
fallback automatique local.

### Livrables

- mismatch de texte ;
- mismatch de `forNode` ;
- mismatch de branche conditionnelle ;
- remontage local ;
- test sans double listener.

## Phase 7 — Queries, routes et blocs asynchrones

Ajouter l’intégration avec :

- la route initiale ;
- les paramètres de route ;
- `loadComponent` ;
- `pendingNode` ;
- `craftUntilSettled` ;
- les erreurs de query ;
- les server functions.

La résolution doit être pilotée par la politique de la frontière, et non par
une option portée par chaque query :

| Politique | Action serveur | Résultat HTML |
|---|---|---|
| `block` | Attend la source suspendue, avec timeout | Contenu résolu + snapshot |
| `fallback` | N’attend pas la source | Fallback du bloc ou de la route |
| `client` | N’exécute pas la source côté serveur | Shell/fallback hydratable |

Le runtime doit transmettre au bloc ou à la route la liste des sources qui ont
suspendu, afin de pouvoir appliquer la politique et produire une erreur
actionnable si aucune frontière ne la couvre.

Décider si les server functions SSR :

- passent par HTTP ;
- utilisent un transport direct serveur ;
- propagent les cookies et headers ;
- récupèrent l’utilisateur courant depuis le contexte de requête.

Pour les routes lazy, le serveur doit charger la même cible que le client avant
de produire les hydration keys.

### Livrables

- route avec query bloquante ;
- route avec fallback pending ;
- `pendingNode` qui surcharge la politique de sa route ;
- erreur explicite pour une source suspendue sans politique SSR ;
- query `client` rendue uniquement côté navigateur ;
- route lazy ;
- erreur SSR rendue proprement.

## Phase 8 — Hydratation partielle

À commencer seulement après l’hydratation complète d’une page.

Ajouter des frontières d’îlots :

```html
<div
  data-craft-island="SearchBox"
  data-craft-hydrate="interaction"
>
  ...
</div>
```

Modes possibles :

- `eager` ;
- `idle` ;
- `visible` ;
- `interaction`.

Pour les interactions avant hydratation :

1. capturer l’événement ;
2. identifier l’îlot via `data-craft-hk` ;
3. hydrater le composant ;
4. rejouer l’événement ;
5. supprimer le listener global temporaire.

À garder hors première version :

- resumability ;
- streaming HTML ;
- event replay complet ;
- hydratation cross-boundary complexe.

## Phase 9 — Validation

Scénario de référence :

```text
Counter
  ├── state(42)
  ├── texte dynamique
  ├── bouton increment
  ├── query résolue
  └── each avec clés stables
```

Critères d’acceptation :

- le serveur produit un HTML déterministe ;
- le client ne recrée pas les nœuds ;
- la valeur du compteur est restaurée ;
- la query ne repart pas inutilement ;
- le clic utilise le DOM existant ;
- `forNode` conserve les bons éléments ;
- un mismatch remonte seulement son sous-arbre ;
- deux requêtes serveur restent isolées.

## Découpage estimatif

| Périmètre | Estimation |
|---|---:|
| Contrat SSR + identité structurelle | 2–3 jours |
| Abstraction de plateforme | 2–4 jours |
| Renderer HTML serveur | 3–5 jours |
| Snapshot d’état | 2–4 jours |
| Hydratation DOM | 4–7 jours |
| Mismatch et fallback local | 3–5 jours |
| Routes, queries et async | 4–8 jours |
| Hydratation partielle | +1–3 semaines |

En pratique :

- preuve de faisabilité : environ 1 semaine ;
- SSR + état + hydratation réelle : environ 3–5 semaines ;
- hydratation partielle robuste : chantier additionnel.

## Hors périmètre initial

- compilateur Craft spécifique ;
- streaming HTML ;
- resumability ;
- event replay généralisé ;
- hydration fine de tous les blocs dynamiques ;
- optimisation SSR par codegen.

## Rôle ultérieur du compilateur

Le compilateur Craft pourra ensuite :

- pré-calculer les hydration keys ;
- générer un renderer SSR spécialisé ;
- optimiser les bindings ;
- générer les entrées serveur par route ;
- détecter les dépendances `window`/`document` ;
- signaler les templates non déterministes ;
- améliorer les diagnostics de mismatch.

Il ne doit toutefois pas bloquer la première implémentation SSR.
