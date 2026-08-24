# Plan de mise en production de CraftTS et de l'application démo

## Objectif

Permettre de déployer l'application démo et les applications CraftTS en production avec :

- un chemin de build et de déploiement reproductible ;
- un runtime SPA, SSR et API clairement séparé ;
- des server-functions exécutables en production ;
- des middleware pour la sécurité, l'authentification et le contexte par requête ;
- des tests effectués sur le véritable artefact de production ;
- une observabilité et une exploitation minimales.

## État d'implémentation — 22 août 2026

La première tranche P0 est livrée dans le dépôt :

- le serveur statique de `demo` sert `dist/apps/demo`, le répertoire produit
  réellement par Vite ;
- `npm run build:demo:production` fournit un point d'entrée explicite ;
- le smoke test des artefacts vérifie désormais la présence de `index.html` et
  l'absence de source maps ;
- le serveur SSR de production accepte `HOST` et `PORT`, expose `/health` et
  `/ready`, applique les headers HTTP de sécurité de base et gère `SIGTERM`/
  `SIGINT` avec un délai d'arrêt configurable ;
- `apps/demo-ssr/Dockerfile` fournit une image multi-stage et
  `docker-compose.production.yml` fournit le lancement local reproductible ;
- `npm run production:check` construit les applications, inspecte les
  artefacts puis exécute un smoke test HTTP sur le bundle SSR produit.
- `@craft-ts/core` expose maintenant un runtime HTTP portable avec contexte par
  requête, matching méthode + chemin (`:param` et `*`), erreurs JSON, limites
  de body, timeout, request ID, logs structurés, CORS et CSRF ;
- le SSR utilise ce registre pour `/health`, `/ready` et `/api/*`, et produit
  les métadonnées `title`, `description`, canonical, robots et Open Graph par
  route ;
- le transport client `createServerFunctionFetchTransport` permet de résoudre
  un identifiant de server-function vers une URL distante, notamment une
  Function URL, sans modifier le protocole `{ id, input, context }`.
- `createCraftLambdaFetch` adapte un événement Lambda Function URL vers la
  même application Web et le client Playwright peut lancer les E2E de `demo`
  sur l'artefact statique avec `npm run e2e:demo:production`.
- `createCraftWorkerFetch` expose la même application portable sous la forme
  `fetch(request, env, ctx)` ; le runtime HTTP fournit aussi des métriques
  en mémoire et un rate limiting à store remplaçable.
- le SSR applique un rate limiting configurable aux routes API et un cache
  immutable aux assets hashés, tandis que le HTML SSR reste `no-store`.
- `.github/workflows/production-readiness.yml` exécute `npm ci` puis
  `npm run production:check` sur les pull requests et les pushes vers `main`.
- la navigation du menu de `demo` ferme désormais le panneau après avoir
  annulé la navigation native, ce qui garantit la navigation client sur le
  bundle de production ; le scénario E2E correspondant passe en dev et sur
  le serveur statique produit.

Le build Docker n'a pas été exécuté localement car le daemon Docker n'était
pas démarré dans l'environnement de développement. La configuration Compose
est valide (`docker compose ... config`). Les phases Lambda/Worker réelles, les
layers Effect remplaçables pour chaque plateforme, une authentification/session
réelle, le rate limiting distribué, les métriques/erreurs externes, les E2E Playwright
contre tous les runtimes et la CI de déploiement restent à réaliser selon
l'ordre proposé ci-dessous. Les tests ciblés du runtime HTTP, du transport
server-function, de l'adapter Lambda, du SSR et du serveur de fonctions passent.
La commande agrégée `npm run production:check` passe également pour les cinq
applications de production et le smoke HTTP SSR.
Le scénario E2E de navigation client passe sur l'artefact statique ; la suite
Chromium complète reste partiellement rouge (12 réussis, 10 échoués, 1 ignoré)
et doit être séparée entre scénarios compatibles production et scénarios
spécifiques au bridge de développement, au viewport ou aux fixtures de test.

## Décisions d'architecture

### Alchemy

Alchemy est retenu comme couche d'infrastructure et de déploiement, pas comme runtime applicatif.

```text
CraftTS renderer / routes / server-functions
        ↓
HTTP runtime CraftTS
        ↓
Node / Cloudflare / Lambda adapter
        ↓
Alchemy
        ├── Cloudflare Static Site
        ├── Cloudflare Worker
        ├── AWS ECS/Fargate
        └── AWS Lambda
```

Trajectoire recommandée :

1. SPA : `Cloudflare.Website.StaticSite` avec fallback SPA.
2. Runtime applicatif : extraire un cœur portable `Request`/`Response` avec Effect.
3. SSR : `Cloudflare.Website.Vite` une fois le build Vite unifié disponible.
4. Server-functions indépendantes : `AWS.Lambda.Function` avec Function URL via Alchemy.
5. Runtime Node de repli : `AWS.ECS.Service` avec une image Docker Node si le SSR Cloudflare n'est pas encore prêt.

Le déploiement Cloudflare SSR est possible avec `Cloudflare.Website.Vite`, mais nécessite d'adapter le serveur actuel à l'API Web et de supprimer les dépendances runtime à `node:http` et `fs`. Alchemy n'est pas le runtime applicatif : il déploie le bundle produit par CraftTS/Vite.

### Portabilité Effect et layers d'environnement

Le code métier ne doit pas importer directement `node:fs`, `node:http` ou une implémentation de base de données. Il doit demander une capacité Effect via un service, puis recevoir une implémentation au niveau de l'entrée de déploiement.

```text
Server-function CraftTS
  → service Effect (UserRepository, Config, Clock, Logger)
  → layer Node, Worker, Lambda ou mémoire
```

Layers à prévoir :

- `UserRepositoryNode` : fichier local ou PostgreSQL ;
- `UserRepositoryWorker` : KV, D1 ou R2 ;
- `UserRepositoryLambda` : DynamoDB, RDS ou autre backend AWS ;
- `UserRepositoryTest` : données en mémoire.

La portabilité ne consiste pas à envelopper `node:fs` dans `Effect.tryPromise`. Elle consiste à déplacer l'accès à la plateforme derrière un service Effect et à changer uniquement le layer fourni.

### Adapters HTTP

Le cœur applicatif doit exposer une application Web :

```text
Request Web → Promise<Response Web>
```

Les adapters de plateforme sont séparés :

- `NodeHttpServer` pour le serveur TCP Node ;
- `fetch(request, env, ctx)` pour Cloudflare ;
- `HttpServerRequest`/`HttpServerResponse` pour Lambda Alchemy.

Le cœur expose `createCraftWorkerFetch` et `createCraftLambdaFetch` comme
adapters minces ; ils ne contiennent ni routing métier ni accès aux bindings.

Le serveur actuel combine HTTP Node, routing, SSR, manifest et assets. Ces responsabilités doivent être séparées afin que `production-server.ts` ne soit plus importé par un Worker ou une Lambda.

### Server-functions indépendantes

Une server-function CraftTS reste la source de vérité : contrat, validation, middleware, handler et erreurs. Elle peut être exécutée dans plusieurs unités de déploiement :

```text
serverFunction("demo.users.list", ...)
        ↓
createServer({ functions: [definition] })
        ↓
Request Web → Response Web
        ├── route SSR Node
        ├── route Cloudflare Worker
        └── Lambda Function URL
```

Une Lambda indépendante contient une seule définition CraftTS ou un petit groupe cohérent. Le client CraftTS conserve son contrat TypeScript ; seul `ServerFunctionTransport` résout l'identifiant vers l'URL de la Lambda.

Ne pas imposer une Lambda par fonction : distinguer la server-function logique de l'unité de déploiement permet de regrouper les fonctions lorsque le coût, la latence ou l'exploitation le justifient.

## Architecture cible

### Routes serveur et API

Créer un registre de routes HTTP distinct des routes UI Angular/CraftTS :

```ts
type ServerRoute = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: (request: Request, context: RequestContext) => Promise<Response>;
  auth?: 'public' | 'required';
  csrf?: boolean;
  cache?: CachePolicy;
};
```

Prévoir :

- `GET /health` : processus vivant ;
- `GET /ready` : application prête à servir ;
- `/api/*` : routes applicatives ;
- `/__server-functions/*` : server-functions ;
- réponses d'erreur JSON homogènes ;
- validation explicite des méthodes, paramètres et payloads ;
- limites de taille des requêtes et timeouts.

Ne pas réutiliser directement `craftRoutes` comme registre HTTP : les routes UI et les routes serveur n'ont pas les mêmes responsabilités.

### Middleware

Introduire une chaîne de middleware indépendante du serveur Node :

```text
request
  → request-id / logs
  → sécurité HTTP
  → CORS / CSRF
  → redirections
  → authentification
  → contexte par requête
  → routes API / server-functions / SSR
  → gestion d'erreurs
```

Le `RequestContext` doit être créé pour chaque requête et contenir uniquement les données de cette requête :

- request ID ;
- utilisateur authentifié ;
- logger corrélé ;
- signal d'annulation ;
- services et configuration nécessaires.

Le contexte ne doit jamais être stocké dans un singleton mutable partagé entre requêtes.

### Assets SSR

Le manifest Vite ne doit pas être lu avec `fs` pendant une requête Worker. Prévoir un module d'assets généré au build :

```ts
export const productionAssets = {
  scriptSrc: '/assets/index-abc123.js',
  styleHref: '/assets/index-def456.css',
};
```

Le rendu SSR reçoit ces URLs comme une valeur de configuration. La résolution et le hash des assets restent du ressort de Vite/Alchemy, pas du runtime HTTP.

## Phases de réalisation

### Phase 0 — Corriger le chemin de production SPA — P0

- Corriger `serve-static` pour servir `dist/apps/demo` et non `dist/apps/demo/browser`.
- Ajouter un script explicite `build:demo:production`.
- Ajouter un test qui vérifie l'existence de `index.html` dans le répertoire réellement servi.
- Vérifier le fallback SPA pour une route profonde comme `/deferred`.

**Critère de sortie :** `nx build demo --configuration=production` puis `nx serve-static demo` servent le build sans erreur.

### Phase 1 — Rendre le SSR reproductible — P0

- Ajouter un `Dockerfile` multi-stage pour `demo-ssr`.
- Définir clairement les artefacts runtime : serveur, assets générés et fichiers publics.
- Ajouter une configuration par variables d'environnement.
- Ajouter `docker compose` ou une commande locale reproductible.
- Ajouter `/health` et `/ready`.
- Ajouter `SIGTERM`/`SIGINT`, arrêt gracieux et délai maximal d'arrêt.
- Ajouter un test de démarrage du conteneur et de réponse HTTP.

**Cible de repli :** déployer le conteneur avec `AWS.ECS.Service` via Alchemy. Le runtime Node reste nécessaire tant que l'entrée Worker n'est pas disponible.

### Phase 2 — Sécurité HTTP — P0

Ajouter un middleware de sécurité par défaut :

- Content-Security-Policy ;
- Strict-Transport-Security en HTTPS ;
- X-Content-Type-Options ;
- Referrer-Policy ;
- Permissions-Policy ;
- `frame-ancestors` dans la CSP ;
- CORS explicite par origine, méthode et headers ;
- protection CSRF pour les mutations utilisant les cookies ;
- cookies `Secure`, `HttpOnly`, `SameSite` ;
- redirection HTTP → HTTPS lorsque le proxy le permet.

Les exceptions doivent être explicites et testées route par route.

### Phase 3 — Server-functions en production — P0

- Extraire le contrat commun d'une server-function : méthode, payload, résultat, erreur et contexte.
- Conserver le plugin Vite actuel uniquement pour le développement.
- Produire un bundle serveur de production contenant les fonctions.
- Monter les fonctions dans le serveur Node sous `/__server-functions/*`.
- Réutiliser `createServer({ functions })` comme registre et garder `NodeHttpServer` uniquement dans l'adapter Node.
- Ajouter auth, validation, timeout, limites de body et gestion d'erreur.
- Ajouter des tests directs et des tests HTTP sur le build de production.

**Critère de sortie :** une server-function fonctionne après `build` dans un conteneur sans serveur Vite de développement.

### Phase 3 bis — Runtime Effect portable — P0

- Remplacer les accès directs à `node:fs` dans les server-functions par des services Effect.
- Déplacer `NodeFileSystem.layer` dans un layer Node spécifique à l'application.
- Ajouter des layers Worker, Lambda et mémoire pour les services nécessaires.
- Faire accepter à `createDemoApplication` les layers d'infrastructure au lieu de les construire en dur.
- Extraire une application HTTP CraftTS indépendante de `node:http`.
- Ajouter un adapter `Request`/`Response` commun aux server-functions, au SSR et aux APIs.

**Critère de sortie :** `listPublicProducts` puis `listUsers` peuvent être exécutées sans importer `production-server.ts`, `node:http` ou `node:fs` depuis leur module métier.

### Phase 3 ter — Server-functions Lambda indépendantes — P1 — amorcée

- Ajouter un helper `createCraftLambdaFetch(application)` autour de
  l'application HTTP portable.
- Construire une Lambda avec `createServer({ functions: [definition] })`.
- Convertir `HttpServerRequest` en `Request` Web et `Response` Web en réponse Lambda.
- Déployer une première fonction sans dépendance Node, par exemple `demo.products.list`.
- Ajouter un transport client qui mappe `serverFunctionId → Function URL`.
- Garder le protocole CraftTS `{ id, input, context, protocolVersion }` pour préserver les contrats existants.
- L'adapter Lambda, le transport par endpoint, le timeout, la taille maximale
  de body et les tests de contrat locaux sont en place ; il reste à ajouter
  auth, rate limiting, le déploiement Alchemy et le smoke test d'une vraie
  Function URL.
- Ajouter `alchemy dev`, un smoke test HTTP réel et un test de contrat partagé.
- Ajouter ensuite les layers Lambda nécessaires à `listUsers`.

**Critère de sortie :** le même `createServerFunctionClient` fonctionne contre le runtime local et une Function URL Lambda sans changer le contrat de la server-function.

### Phase 4 — Registre de routes API — P1 — livré localement

- Créer un package runtime partagé pour les routes serveur.
- Implémenter le matching méthode + chemin.
- Définir les contrats d'entrée/sortie et leur validation.
- Supporter les réponses JSON, texte, redirections et streaming si nécessaire.
- Ajouter une convention d'erreurs : code HTTP, code stable, message public et détails loggés.
- Documenter les routes de la démo.
- Ne pas confondre le registre HTTP API avec le registre CraftTS des server-functions ; fournir un adapter entre les deux lorsque l'exposition HTTP est souhaitée.
- Le runtime portable, le matching, les erreurs JSON, les headers de cache,
  les métriques et le middleware de rate limiting sont implémentés dans
  `@craft-ts/core`.

### Phase 5 — SEO et métadonnées SSR — P1

- Définir les métadonnées par route : titre, description, canonical, robots, Open Graph.
- Permettre à chaque route de contribuer au document SSR.
- Tester le HTML rendu directement depuis le serveur.
- Ajouter sitemap, robots.txt et favicon correctement servis.

### Phase 6 — Exploitation et observabilité — P1 — partiellement livré

- Remplacer `console.error` par des logs structurés JSON.
- Ajouter request ID et corrélation des logs.
- Logger méthode, route, statut, durée et taille de réponse sans données sensibles.
- Ajouter métriques : requêtes, erreurs, latence, SSR, server-functions et readiness.
- Ajouter export d'erreurs vers un outil comme Sentry ou équivalent.
- Ajouter compression, cache contrôlé des assets et `Cache-Control` SSR/API.
- Ajouter limites de concurrence, body size et timeout de requête.
- Ajouter arrêt gracieux et gestion des connexions persistantes.

Le runtime fournit déjà les logs JSON, request ID, métriques mémoire, timeout,
body size, rate limiting et cache contrôlé. Il reste l'export métriques,
l'observabilité externe, la compression et un store de rate limiting partagé.

### Phase 7 — Vérification du véritable artefact — P1 — partiellement livré

- Modifier Playwright pour accepter `BASE_URL` sans démarrer Vite par défaut.
- Ajouter une configuration E2E `production` : build, démarrage du serveur produit, tests, arrêt.
- Tester SPA, SSR, API, server-functions, assets, erreurs 404 et headers de sécurité.
- Tester une server-function embarquée, une server-function Worker et une server-function Lambda.
- Ajouter un smoke test Docker dans la CI.
- Conserver les E2E rapides sur serveur de développement séparément.

Le build, les smoke tests HTTP et l'E2E de navigation client ciblé tournent déjà
sur l'artefact statique ou SSR ; la suite complète doit encore être partitionnée
entre tests compatibles production et tests dépendants du bridge de développement.

### Phase 8 — Compatibilité contractualisée — P2

Documenter et tester la matrice :

- navigateurs supportés ;
- versions Node ;
- versions Angular ;
- versions TypeScript ;
- versions Effect ;
- versions Nx ;
- compatibilité des packages CraftTS entre eux.

Publier cette matrice avec chaque release et vérifier les combinaisons critiques en CI.

## Configuration Alchemy proposée

### SPA Cloudflare

```ts
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

export default Alchemy.Stack(
  'CraftDemo',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const site = yield* Cloudflare.Website.StaticSite('Demo', {
      command: 'npm run build:demo:production',
      outdir: 'dist/apps/demo',
      assets: {
        notFoundHandling: 'single-page-application',
      },
    });

    return { url: site.url };
  }),
);
```

### SSR Node

Pour la première version, Alchemy doit créer :

- un registre ECR ;
- une image Docker versionnée ;
- un service ECS/Fargate ;
- un load balancer ;
- une sonde `/health` ;
- une sonde `/ready` ;
- les variables et secrets nécessaires ;
- logs et alertes minimales.

### Server-function Lambda indépendante

```ts
import * as AWS from 'alchemy/AWS';
import * as Effect from 'effect/Effect';
import { createCraftLambdaFetch, createHttpServer } from '@craft-ts/core';
import { publicProductsRoutes } from './public-products.routes';

export default class ListProductsLambda extends AWS.Lambda.Function<ListProductsLambda>()(
  'ListProducts',
  {
    main: import.meta.url,
    url: true,
  },
  Effect.gen(function* () {
    const application = createHttpServer({ routes: publicProductsRoutes });
    return {
      fetch: createCraftLambdaFetch(application),
    };
  }),
) {}
```

Règles de déploiement :

- `url: true` est réservé aux endpoints explicitement publics ;
- utiliser `AWS_IAM` ou une couche d'authentification pour les fonctions privées ;
- configurer CORS explicitement si le navigateur appelle directement la Lambda ;
- utiliser API Gateway ou un Worker proxy si plusieurs fonctions doivent partager un domaine et des politiques communes ;
- utiliser SQS/EventBridge pour les traitements asynchrones plutôt qu'une requête HTTP longue.

Alchemy sait aussi générer les bindings et les permissions nécessaires pour les ressources AWS utilisées par la Lambda. Voir la [documentation Lambda Alchemy](https://alchemy.run/aws/compute/lambda/).

### SSR Cloudflare — étape ultérieure

À envisager après extraction du runtime HTTP portable :

- entrée Worker basée sur `fetch(request, env, ctx)` ;
- rendu SSR sans `node:http` ;
- manifest/assets compatibles Workers ;
- tests locaux avec `alchemy dev` ;
- `runWorkerFirst` pour `/api/*` et les fonctions dynamiques ;
- fallback SPA uniquement pour les routes statiques.

### Server-functions Cloudflare

Une server-function peut aussi être incluse dans le bundle Worker :

- `/api/*` et `/__server-functions/*` passent par l'entrée `fetch` ;
- les assets statiques sont servis par les assets Worker ;
- les services Effect reçoivent des layers basés sur les bindings Cloudflare ;
- les fonctions très isolées ou à permissions AWS spécifiques restent des Lambdas.

## CI/CD cible

```text
pull request
  → lint / typecheck / unit tests
  → build production
  → E2E sur artefact production
  → scan sécurité

merge main
  → build immuable
  → déploiement staging avec Alchemy
  → smoke tests / health / readiness
  → test des Function URLs et des contrats server-functions
  → promotion manuelle ou automatique en production
```

Le déploiement doit être reproductible à partir du commit et ne jamais dépendre d'un serveur Vite de développement.

Le workflow GitHub Actions `production-readiness` couvre déjà le build, le
contrôle des artefacts et le smoke HTTP. Il reste à y ajouter les navigateurs
Playwright, le smoke Docker et les étapes de déploiement staging/Alchemy.

## Ordre recommandé

1. Corriger le chemin SPA.
2. Ajouter les headers de sécurité.
3. Ajouter Docker, `/health`, `/ready` et arrêt gracieux SSR.
4. Migrer une server-function vers `UserRepository` et un layer Effect.
5. Extraire le runtime `Request`/`Response` et les adapters.
6. Monter les server-functions dans le serveur de production.
7. Déployer `listPublicProducts` comme Lambda indépendante avec Alchemy.
8. Ajouter le transport client par endpoint et les tests de contrat multi-runtime.
9. Créer le registre API et la chaîne middleware.
10. Passer les E2E sur les véritables artefacts.
11. Ajouter logs, métriques, erreurs et politiques de cache.
12. Déployer la SPA avec Cloudflare + Alchemy.
13. Déployer SSR avec Cloudflare Worker ; conserver ECS/Fargate comme repli Node.

## Définition de production ready

Le projet peut être considéré comme production ready lorsque :

- un déploiement staging est reproductible depuis un commit ;
- SPA, SSR, API et server-functions sont testés dans leur mode de production ;
- au moins une server-function est déployable indépendamment en Lambda et testée via sa Function URL ;
- les server-functions métier n'importent pas de runtime Node ;
- les layers d'infrastructure sont remplaçables pour Node, Worker, Lambda et tests ;
- `/health` et `/ready` sont exploités par la plateforme ;
- les headers, CORS, CSRF et cookies sont explicitement configurés ;
- les erreurs et latences sont observables ;
- l'arrêt et le redémarrage ne perdent pas de requêtes actives ;
- la matrice de compatibilité et la procédure de rollback sont documentées.
