# Server functions — frontières client/serveur et contrat d’architecture

> Plan d’implémentation. Les étapes restent cochées au fur et à mesure de la réalisation.

## Objectif

Définir une convention stricte pour les server functions qui permette :

- de garder une server function purement backend dans un seul fichier ;
- d’exiger trois fichiers dès qu’une server function franchit la frontière client ;
- de conserver l’inférence des résultats, erreurs et dépendances depuis le handler Effect ;
- d’éviter un transform de bundle en production ;
- de rendre les imports client/serveur vérifiables par le graphe d’architecture ;
- de bloquer un déploiement si une implémentation serveur peut entrer dans le bundle client.

## Décision d’architecture

Il existe deux formes de server functions.

### Server function uniquement serveur

Une fonction non exposée au navigateur utilise un seul fichier :

```txt
reports/rebuild.fn-serveur.ts
```

Le `server.ts` de l’application l’enregistre dans le runtime serveur.

```ts
// reports/rebuild.fn-serveur.ts

export const rebuildReport = serverFunction(
  'reports.rebuild',
  RebuildReportInputSchema,
).handler(({ input }) =>
  Effect.gen(function* () {
    // dépendances et traitement exclusivement backend
  }),
);
```

Le contrat est local à l’implémentation. Cette fonction ne peut pas être importée
par un module client.

### Server function exposée au client

Dès qu’une fonction peut être appelée depuis le navigateur, elle utilise une
famille de trois fichiers :

```txt
users/list.fn-contract.ts
users/list.fn-client.ts
users/list.fn-serveur.ts
```

Cela s’applique également lorsqu’elle utilise `requireClientDI(...)`.

```ts
// users/list.fn-contract.ts

export const usersListContract = serverFunctionContract({
  id: 'users.list',
  input: ListUsersInputSchema,
  exposure: 'client',
});
```

```ts
// users/list.fn-serveur.ts

export const getUsers = serverFunction(usersListContract)
  .pipe(requireClientDI(CurrentUser, { mode: 'snapshot' }))
  .pipe(requireServerPermission('users:read'))
  .handler(({ input, required }) =>
    Effect.gen(function* () {
      const currentUser = required(CurrentUser);
      const users = yield* UsersRepository;

      return yield* users.findForDatabase({
        databaseId: currentUser.databaseId,
        filter: input.filter,
      });
    }),
  );
```

```ts
// users/list.fn-client.ts

import type { getUsers as ServerGetUsers } from './users/list.fn-serveur';

export const getUsers = createServerFunctionClient<ServerGetUsers>(
  usersListContract,
);
```

Le fichier contrat ne déclare pas le succès ni les erreurs. Ces types restent
inférés depuis le handler Effect serveur, puis projetés vers la façade client.

## Contrat public

Le contrat partagé doit contenir uniquement les éléments nécessaires à la
frontière :

```ts
type ServerFunctionExposure = 'server' | 'client';

interface ServerFunctionContractOptions<TInput> {
  readonly id: string;
  readonly input: Schema<TInput>;
  readonly exposure: ServerFunctionExposure;
}
```

Il ne doit pas contenir :

- de repository ;
- de service Effect serveur ;
- de secrets ou configuration backend ;
- de type de résultat écrit manuellement ;
- de liste manuelle d’erreurs qui pourrait diverger du handler.

`requireClientDI(...)` doit être incompatible avec un contrat `exposure: 'server'`.
Le graphe vérifiera également cette contrainte après analyse des pipes, afin de
ne pas dépendre uniquement du typecheck.

## Modèle dans le graphe d’architecture

Le graphe doit représenter une famille de server function :

```txt
ServerFunctionFamily(users.list)
├── contract
├── client
└── serveur
```

Pour une server function serveur uniquement :

```txt
ServerFunctionFamily(reports.rebuild)
└── serveur
```

Les règles seront :

1. Un fichier `*.fn-serveur.ts` définit une server function.
2. Le contrat doit déclarer un identifiant stable et unique.
3. `exposure: 'server'` autorise uniquement l’implémentation serveur.
4. `exposure: 'client'` exige les trois fichiers de la famille.
5. `requireClientDI(...)` exige `exposure: 'client'`.
6. Une famille client doit contenir exactement un contrat, une façade client et une implémentation serveur.
7. Les trois fichiers doivent partager le même préfixe de famille.
8. Le client ne peut pas faire d’import runtime vers `*.fn-serveur.ts`.
9. Le serveur ne peut pas importer `*.fn-client.ts`.
10. Le contrat ne peut dépendre que de modules partageables et browser-safe.
11. Le fichier client doit utiliser le contrat correspondant.
12. Le fichier serveur doit utiliser le même contrat lorsqu’il est exposé au client.
13. Un contrat `exposure: 'client'` sans façade client est une violation.
14. Une façade client sans implémentation serveur correspondante est une violation.
15. Les types publics client et serveur doivent être compatibles.

Le graphe doit aussi produire des diagnostics dédiés, par exemple :

```txt
CRAFT_SERVER_FUNCTION_CLIENT_FAMILY_MISSING
CRAFT_SERVER_FUNCTION_CLIENT_IMPORTS_SERVER
CRAFT_SERVER_FUNCTION_CLIENT_DI_REQUIRES_CLIENT_EXPOSURE
CRAFT_SERVER_FUNCTION_CONTRACT_MISMATCH
CRAFT_SERVER_FUNCTION_DUPLICATE_ID
CRAFT_SERVER_FUNCTION_ORPHAN_CLIENT_FACADE
```

## Développement et production

En développement, aucun transform de bundle n’est requis. Le serveur de
développement peut utiliser un adaptateur local ou laisser apparaître une
implémentation serveur dans le bundle de développement.

Cette souplesse ne change pas le contrat source : les frontières doivent rester
représentées dans les fichiers et détectables par le graphe.

Avant un déploiement, l’ordre obligatoire est :

```txt
typecheck
  ↓
lint
  ↓
tests
  ↓
architecture check --target production
  ↓
build production
  ↓
deploy
```

Une violation d’architecture doit rendre le check non passant et empêcher le
déploiement. Le contrôle ne doit pas être seulement recommandé ou exécuté
manuellement de temps en temps.

Les secrets et credentials ne doivent néanmoins jamais être importés dans un
module susceptible d’être partagé avec le client, même en développement.

## Registre serveur

Le `server.ts` applicatif doit enregistrer les server functions serveur et
exposées au client :

```ts
export const server = createServer({
  functions: [
    rebuildReport,
    getUsers,
  ],
});
```

Il devient le point d’entrée Fetch/RPC. Le registre doit vérifier l’unicité des
identifiants et fournir le routage vers l’implémentation Effect correspondante.

Les server functions restent ainsi indépendantes du serveur concret :
Node, Bun, un adaptateur Fetch, ou une autre cible peuvent utiliser le même
registre.

## File map prévue

| Fichier | Responsabilité |
|---|---|
| `libs/core/.../server-function-contract.ts` | Contrat partagé, exposition et schéma d’entrée |
| `libs/core/.../server-function.ts` | API `serverFunction` et inférence du handler |
| `libs/core/.../server-function-client.ts` | Façade RPC côté client |
| `libs/core/.../client-di-requirement.ts` | `requireClientDI` et modes `snapshot` / `reactive` / `cancel-on-change` |
| `libs/dev-tools/src/scripts/dependency-graph.ts` | Extraction des familles et dépendances server functions |
| `libs/dev-tools/src/scripts/architecture-graph.ts` | Requêtes et prédicats server functions |
| `libs/dev-tools/tests/architecture/rules/server-functions.spec.ts` | Règles d’architecture et diagnostics |
| `libs/dev-tools/tests/architecture/fixtures/server-functions/**` | Fixtures valides et invalides |
| `server.ts` dans l’application | Registre et point d’entrée serveur |
| `craft check` / gate architecture | Blocage avant le build et le déploiement |

Les chemins exacts devront être alignés sur l’emplacement retenu pour
l’implémentation Effect et sur les exports publics existants.

## Étapes d’implémentation

### Étape 1 — Stabiliser le vocabulaire et les identités

- [ ] Définir `ServerFunctionExposure`.
- [ ] Définir la forme minimale de `serverFunctionContract`.
- [ ] Définir la convention de nommage `.fn-contract.ts`, `.fn-client.ts`, `.fn-serveur.ts`.
- [ ] Définir le comportement d’une server function serveur uniquement.
- [ ] Définir la projection du type serveur vers le type client.

### Étape 2 — Implémenter le runtime minimal

- [ ] Implémenter `serverFunctionContract`.
- [ ] Implémenter `serverFunction` avec schéma d’entrée obligatoire.
- [ ] Préserver l’inférence du succès, des erreurs Effect et des dépendances.
- [ ] Implémenter `createServerFunctionClient`.
- [ ] Implémenter le transport RPC minimal.
- [ ] Vérifier qu’aucune `CraftException` n’est nécessaire dans le handler serveur.

### Étape 3 — Ajouter le registre `server.ts`

- [ ] Définir `createServer`.
- [ ] Enregistrer les identifiants de server functions.
- [ ] Refuser les identifiants dupliqués.
- [ ] Router une requête RPC vers le handler Effect.
- [ ] Permettre l’utilisation du registre avec un handler Fetch.
- [ ] Tester un serveur Node ou Fetch minimal.

### Étape 4 — Étendre le graphe de dépendances

- [ ] Détecter les fichiers `*.fn-serveur.ts`.
- [ ] Détecter les contrats et façades correspondants.
- [ ] Construire les nœuds `ServerFunctionFamily`.
- [ ] Extraire `exposure` et l’identifiant stable.
- [ ] Détecter les appels `requireClientDI(...)` et leurs modes.
- [ ] Marquer les imports runtime client → serveur.
- [ ] Ajouter les informations au JSON et au catalogue TypeScript du graphe.

### Étape 5 — Ajouter les règles d’architecture

- [ ] Tester une server function serveur uniquement valide.
- [ ] Tester une famille client complète valide.
- [ ] Tester l’absence du contrat.
- [ ] Tester l’absence de la façade client.
- [ ] Tester l’absence de l’implémentation serveur.
- [ ] Tester `requireClientDI` avec `exposure: 'server'`.
- [ ] Tester un import client runtime vers le serveur.
- [ ] Tester un import serveur vers la façade client.
- [ ] Tester les familles incohérentes et les IDs dupliqués.
- [ ] Vérifier les messages et codes de diagnostics.

### Étape 6 — Brancher la vérification avant déploiement

- [ ] Ajouter le gate `architecture` à `craft check`.
- [ ] Faire échouer le gate si aucune suite d’architecture n’est trouvée.
- [ ] Ajouter le target `production` aux règles de frontière client/serveur.
- [ ] Exécuter l’architecture check avant le build production.
- [ ] Documenter la commande de CI et la commande locale.

### Étape 7 — Documenter le workflow auteur

- [ ] Documenter quand utiliser le format un fichier.
- [ ] Documenter quand créer le triptyque.
- [ ] Documenter l’utilisation de `requireClientDI` avec un mode explicite.
- [ ] Documenter l’import client obligatoire depuis `*.fn-client.ts`.
- [ ] Documenter les diagnostics et leur correction.
- [ ] Ajouter un exemple complet `users.list`.

## Critères d’acceptation

- Une server function purement backend peut être définie dans un seul fichier.
- Une server function exposée au client exige trois fichiers cohérents.
- Toute utilisation de `requireClientDI` exige automatiquement une famille client.
- Le schéma d’entrée est toujours obligatoire.
- Le succès et les erreurs sont inférés depuis le handler Effect.
- Le client n’a pas besoin de connaître les dépendances serveur.
- Une violation de frontière est détectée par le graphe.
- Le gate d’architecture échoue avant un build de production invalide.
- Aucun transform de bundle n’est nécessaire pour garantir la règle en production.
- Le registre `server.ts` peut être exécuté sur plusieurs serveurs compatibles Fetch.

## Risques et décisions à conserver

- La règle ne doit pas être fondée uniquement sur le nom du fichier : le graphe
  doit aussi analyser les imports et les contrats.
- `requireClientDI` implique une exposition client, même si la fonction ne lit
  actuellement aucune autre donnée du front.
- Un simple suffixe ne protège pas le bundle ; c’est le gate d’architecture
  production qui constitue la garantie.
- Une fonction serveur ne doit jamais importer un module client runtime.
- Le contrat ne doit pas devenir un endroit où l’on redéclare manuellement les
  résultats et les erreurs déjà inférés par Effect.
