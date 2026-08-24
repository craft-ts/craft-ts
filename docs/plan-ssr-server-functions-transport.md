# Plan — SSR et transport des server functions

## Objectif

Permettre à une application CraftTS rendue en SSR d’utiliser les mêmes façades
de server functions côté navigateur et côté serveur, tout en évitant qu’un
rendu SSR effectue un appel HTTP vers sa propre application.

Le transport doit varier selon le runtime :

```text
navigateur
  façade server function
  → ServerFunctionTransport
  → fetch('/__server-functions')

SSR
  façade server function
  → ServerFunctionTransport
  → application.invoke(...)
```

Les appels vers des APIs externes restent derrière des services dédiés et
peuvent continuer à utiliser `fetch` avec une implémentation adaptée au
runtime.

## État actuel

- `demo-with-server-function` expose les server functions via
  `POST /__server-functions`.
- Le navigateur utilise `provideDefaultServerFunctionTransport()`.
- Le registre serveur est construit avec `createServer(...)`.
- Le registre expose déjà `application.invoke(id, input, context)`.
- `demo-ssr` utilise `renderCraft(...)`, mais ne partage pas encore le registre
  des server functions.
- Les deux démonstrations sont actuellement séparées.
- L’API server functions reste expérimentale et doit être considérée comme une
  POC tant que son contrat n’est pas stabilisé.

## Architecture cible

### Transport des server functions

Le code applicatif utilise toujours les façades générées dans les fichiers
`*.fn-client.ts` :

```ts
const users = await getUsers({ filter: 'ada' });
```

Le provider du transport change selon l’entrée :

```ts
// Navigateur
provideDefaultServerFunctionTransport();
```

```ts
// SSR
provideServerFunctionTransport((request) =>
  application.invoke(
    request.id,
    request.input,
    request.context,
  ),
);
```

La server function reste donc la même dans les deux cas. Seul le transport
change.

### APIs externes

Ne pas utiliser `ServerFunctionTransport` pour toutes les communications
réseau. Définir des services métier dédiés :

```text
ProductsApi
  navigateur → fetch vers l’API externe
  SSR        → fetch serveur avec base URL, cookies ou secrets adaptés
```

L’interface consommée par l’UI ne doit pas connaître `fetch`.

### Contexte de requête

Le runtime serveur doit être construit avec le contexte de la requête SSR :

```text
requête HTTP
  → authentification
  → runtimeLayer avec CurrentUser, session, locale...
  → registre server functions
  → configuration SSR
  → renderCraft
```

Ne pas capturer un utilisateur ou une session dans un registre global partagé
par toutes les requêtes.

## Étapes d’implémentation

### 1. Unifier les points d’entrée

- Garder `main.ts` pour le navigateur.
- Ajouter ou conserver une entrée serveur dédiée.
- Faire évoluer `production-server.ts` pour gérer dans le même processus :
  - les assets statiques ;
  - `POST /__server-functions` ;
  - les routes SSR avec `renderCraft`.

### 2. Extraire la création du registre

Créer une fonction serveur réutilisable :

```ts
function createApplication(runtimeLayer: RuntimeLayer) {
  return createServer({
    functions,
    execute: executeEffect(runtimeLayer).run,
  });
}
```

Cette fonction doit être utilisable par le handler HTTP et par le renderer SSR.

### 3. Ajouter le transport SSR en mémoire

Dans la configuration créée pour le SSR :

```ts
provideServerFunctionTransport((request) =>
  application.invoke(
    request.id,
    request.input,
    request.context,
  ),
);
```

Le bundle navigateur ne doit jamais importer l’implémentation serveur du
registre.

### 4. Rendre la configuration SSR dépendante de la requête

Transformer la configuration SSR en factory :

```ts
function createSsrAppConfig(application: Server) {
  return craftAppConfig({
    providers: [
      provideServerFunctionTransport(/* transport en mémoire */),
      // providers communs
    ],
  });
}
```

Chaque appel à `renderCraft` doit recevoir une configuration et un état isolés
pour la requête.

### 5. Vérifier les server functions avec contexte client

Pour les server functions qui utilisent un middleware client :

- vérifier que le middleware peut être exécuté pendant le SSR ;
- ne jamais considérer `request.context` comme une information de confiance ;
- refaire l’authentification et l’autorisation côté serveur ;
- fournir un service SSR équivalent si le middleware lit un service client.

Pour les données purement serveur, préférer le contexte de requête serveur.

### 6. Isoler les APIs externes

Créer un service abstrait par API métier, par exemple :

```ts
type ProductsApi = {
  readonly list: () => Promise<readonly Product[]>;
};
```

Fournir une implémentation navigateur et une implémentation serveur. La
server function peut utiliser directement l’implémentation serveur si les
identifiants ou secrets ne doivent jamais parvenir au navigateur.

### 7. Adapter les scripts de démarrage

Développement : un serveur Vite qui sert le client, le SSR et les server
functions sur la même origine.

Production :

```text
build client
build serveur SSR
node dist/.../server.js
```

Le script `start` de production ne doit démarrer qu’un seul serveur applicatif.

## Tests à ajouter

- Une façade server function utilise le transport HTTP dans le navigateur.
- La même façade utilise `application.invoke` pendant le SSR.
- Le SSR ne déclenche aucun `fetch('/__server-functions')`.
- Les validations d’input et de sortie restent identiques dans les deux modes.
- Les middleware serveur sont exécutés avec le transport SSR en mémoire.
- Deux requêtes simultanées ne partagent pas leur `CurrentUser`.
- Une API externe utilise la configuration correcte côté navigateur et côté
  serveur.
- L’hydratation réutilise les données rendues côté serveur sans double appel
  inutile.

## Critères d’acceptation

- Une seule application Node gère SSR et server functions en production.
- Les composants peuvent utiliser une même façade dans le navigateur et en SSR.
- Aucun appel HTTP local n’est nécessaire pendant le SSR.
- Les implementations serveur ne sont pas incluses dans le bundle navigateur.
- Le contexte d’authentification est isolé par requête.
- Les appels vers les APIs externes restent explicitement séparés des appels
  vers les server functions internes.

## Fichiers concernés

- `libs/core/src/lib/server-function-client.ts`
- `apps/demo-with-server-function/src/client/app.config.ts`
- `apps/demo-with-server-function/src/server/server.ts`
- `apps/demo-ssr/src/server.ts`
- `apps/demo-ssr/src/production-server.ts`
- `apps/demo-ssr/src/app/app.config.ts`
- `apps/demo-with-server-function/src/**/*.fn-client.ts`
- `apps/demo-with-server-function/src/**/*.fn-serveur.ts`
