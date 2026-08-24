# Plan d'outillage de déploiement CraftTS

## Objectif

Permettre à un projet CraftTS de passer de l'application locale au
déploiement staging/production avec une procédure courte, reproductible et
indépendante du fournisseur d'infrastructure.

Le projet applicatif doit pouvoir choisir un runtime (`static`, `node`,
`worker` ou `lambda`) et un provider de déploiement (par exemple Alchemy,
Cloudflare Pages, Vercel, Netlify ou Docker) sans modifier ses server-functions
métier.

Le plan distingue explicitement trois niveaux :

- **runtime** : la forme d'exécution du bundle (`static`, `node`, `worker` ou
  `lambda`) ;
- **platform** : la plateforme technique visée (Cloudflare, AWS, Node/Docker,
  Firebase, etc.) ;
- **provider** : l'intégration qui construit, publie ou provisionne cette
  plateforme (Alchemy, Vercel, Netlify, Firebase CLI, Docker, etc.).

Ce plan complète
[le plan de readiness applicative](./production-readiness-deployment-plan.md) :
le premier décrit l'outillage CraftTS réutilisable, le second décrit la mise
en production d'une application concrète.

## État d'implémentation — 24 août 2026

**Statut : expérimental.** La surface de commandes, les champs du manifest, les
codes de diagnostic et le contrat provider peuvent encore bouger d'une version
mineure à l'autre. La documentation le dit sur chaque page
(`apps/docs/guide/deployment/`), et un test le vérifie.

Les phases 0, 1 et 3 sont livrées. La phase 2 (`init`, `build`, `deploy init`,
templates) reste à faire.

Livré :

- `@craft-ts/deploy` (`libs/deploy`) : `defineCraftDeployment`, le contrat
  `CraftDeploymentManifest` discriminé par le runtime, la résolution des
  défauts, la sérialisation déterministe, la validation, le scan du graphe de
  modules, la vérification d'artefact, la matrice de capacités des providers et
  le contrat `CraftDeploymentProvider` (avec plan de preview et chargement de
  module) ;
- `@craft-ts/cli` (`libs/cli`), binaire `craft-ts` : `check`, `manifest`,
  `providers`, `deploy preview` et `deploy` ;
- `@craft-ts/deploy-alchemy` (`libs/deploy-alchemy`) : provider Alchemy
  optionnel, presets Cloudflare et AWS, contrôle des credentials et du state,
  preview sans mutation via un port de runtime, application confirmée par
  `--yes` ;
- les manifestes des démonstrateurs `apps/demo-ssr/craft.deploy.ts` (runtime
  `node`, plateforme `docker`) et `apps/demo/craft.deploy.ts` (runtime `static`,
  mode `spa`) ;
- `npm run deploy:check` et `npm run deploy:manifest`, branchés dans
  `npm run production:check`, qui produisent
  `dist/<app>/craft-deployment-manifest.json` et vérifient le véritable
  artefact ;
- la cible `nx run craft-ts-deploy:typecheck-manifests`, ajoutée à
  `release:preflight`, qui type-vérifie tous les `apps/*/craft.deploy.ts` ;
- la documentation `apps/docs/guide/deployment/` (vocabulaire, référence du
  manifest, diagnostics, providers, provider Alchemy), vérifiée par
  `apps/docs/tests/deployment-docs.spec.ts` contre le catalogue de codes, la
  matrice réelle et les credentials réellement lus ;
- les trois packages sont dans le groupe de release npm : `nx.json` →
  `release.projects` et `tools/release.mjs` → `releasePackages`.

Non livré, et volontairement :

- aucun déploiement réel n'a été exécuté depuis ce dépôt : il n'y a ni compte
  Cloudflare ou AWS ni credentials, donc l'adaptateur sur l'API Alchemy
  (`ALCHEMY_RESOURCE_EXPORTS`) n'a jamais tourné contre un compte vivant. Toute
  la logique en amont — presets, plan, credentials, refus, confirmation — est
  couverte par un port de runtime enregistreur ;
- le smoke HTTP réel après déploiement et la démonstration « SPA puis
  server-function déployées » de la phase 3 attendent donc ce premier
  déploiement ;
- les autres providers de la matrice (Vercel, Netlify, Firebase, GitHub Pages,
  Docker) restent documentés, pas implémentés.

## Décision d'architecture

Ne pas ajouter Alchemy comme dépendance de `@craft-ts/core`.

```text
@craft-ts/core
  ├── runtime Request → Response
  ├── server-functions et contrats
  ├── adapters Node / Worker / Lambda
  └── primitives de vérification

@craft-ts/cli
  ├── craft init / build / check / deploy init
  └── génération du manifest et des templates

@craft-ts/deploy
  ├── contrat de déploiement
  ├── presets SPA / SSG / Node / Worker / Lambda
  ├── matrice de capacités des providers
  └── validation des artefacts

@craft-ts/deploy-alchemy
  └── provider Alchemy optionnel pour Cloudflare / AWS
```

Le core reste portable et léger. La CLI et les intégrations sont des outils de
développement ou de CI, jamais des dépendances du bundle runtime.

## Expérience cible

Projet existant :

```bash
npx craft-ts check --runtime worker --platform cloudflare
npx craft-ts build --runtime worker --platform cloudflare
npx craft-ts deploy init --provider alchemy --platform cloudflare
npx craft-ts deploy preview
npx craft-ts deploy
```

Aujourd'hui, `check`, `manifest`, `providers`, `deploy preview` et `deploy`
existent ; `build` et `deploy init` appartiennent à la phase 2.

Projet neuf :

```bash
npm create craft-ts@latest
```

La CLI doit expliquer les prérequis manquants, produire des fichiers lisibles
et ne jamais créer de secrets ou déployer une ressource sans confirmation
explicite.

Les termes `runtime`, `platform` et `provider` doivent rester distincts dans
les commandes, les diagnostics, le manifest et la documentation. Alchemy est
un provider d'infrastructure ; ce n'est pas un runtime applicatif.

## Contrat de déploiement

Créer un manifest typé, par exemple `craft.deploy.ts` :

```ts
import { defineCraftDeployment } from '@craft-ts/deploy';

export default defineCraftDeployment({
  name: 'demo',
  runtime: 'node',
  platform: 'docker',
  client: {
    build: 'npm run build:demo:production',
    outDir: 'dist/apps/demo',
  },
  server: {
    entry: 'dist/apps/demo-ssr/server/server.js',
    healthPath: '/health',
    readyPath: '/ready',
  },
  functions: {
    entry: 'apps/demo-with-server-function/src/server/server.ts',
  },
});
```

Le manifest doit décrire uniquement les faits nécessaires au build et au
déploiement :

- nom et environnement cible ;
- type de runtime : `static`, `node`, `worker` ou `lambda` ;
- mode du runtime `static` éventuel : `spa` ou `ssg` ;
- plateforme technique visée ;
- commande et répertoire de build ;
- entrée SSR, Worker ou Lambda ;
- server-functions exposées et leurs identifiants ;
- assets, manifest et fichiers publics ;
- routes statiques à pré-rendre lorsque le mode est `ssg` ;
- routes de health/readiness ;
- variables d'environnement attendues, sans leurs valeurs ;
- bindings et permissions requises, sans secrets ;
- version du protocole et version de l'artefact.

Le résultat du build doit produire un fichier immuable :
`dist/<app>/craft-deployment-manifest.json`.

Le manifest reste provider-neutre. Le provider est choisi au moment de
`craft deploy` ou dans une configuration de déploiement séparée ; il ne doit
pas être requis pour produire l'artefact. Les options propres à un provider
sont validées par ce provider et ne doivent pas être nécessaires au runtime
CraftTS. Le manifest doit aussi décrire l'artefact produit : répertoire public,
entrée serveur éventuelle, commande de démarrage, fichiers de configuration et
version du protocole de l'artefact.

## Commandes de la CLI

### `craft init`

Générer un projet minimal avec :

- une application CraftTS ;
- un build client ;
- un manifest de déploiement ;
- un smoke test ;
- un workflow CI minimal.

### `craft check`

Valider avant build :

- manifest cohérent ;
- chemins d'entrées existants ;
- runtime et platform compatibles avec les imports utilisés ;
- absence de `node:fs`, `node:http` et APIs Node dans un runtime Worker/Lambda ;
- variables d'environnement déclarées ;
- routes health/readiness présentes pour SSR ;
- routes statiques énumérables et prerender compatibles avec le mode SSG ;
- server-functions exposées avec un contrat valide.

### `craft build`

Orchestrer le build existant sans remplacer Vite ou Nx :

- exécuter la commande client/serveur déclarée ;
- exécuter le prerender lorsque le runtime static est en mode `ssg` ;
- générer le manifest résolu avec les hashes d'assets ;
- vérifier l'absence de source maps en production selon la politique choisie ;
- produire un résumé machine-readable et humain.

### `craft deploy init`

Générer uniquement l'intégration choisie :

- Docker/Node ;
- Cloudflare Worker ;
- Cloudflare Pages ;
- AWS Lambda ;
- Alchemy Cloudflare/AWS ;
- un provider de publication statique comme Vercel, Netlify ou GitHub Pages.

Les fichiers générés doivent être versionnables et modifiables. La commande
doit refuser d'écraser un fichier existant sans `--force`.

### `craft deploy preview` et `craft deploy`

Ces commandes appartiennent à une intégration optionnelle. Le core de la CLI
doit déléguer à un provider :

```ts
export type CraftDeploymentProvider = {
  readonly name: string;
  readonly capabilities: readonly CraftDeploymentCapability[];
  check?(manifest: CraftDeploymentManifest): Promise<void>;
  preview(manifest: CraftDeploymentManifest): Promise<void>;
  deploy(manifest: CraftDeploymentManifest): Promise<CraftDeploymentResult>;
};

export type CraftDeploymentCapability =
  | 'static-spa'
  | 'static-ssg'
  | 'node-ssr'
  | 'worker'
  | 'lambda'
  | 'infrastructure'
  | 'local-preview';
```

Le provider Alchemy est installé séparément et vérifie que le CLI Alchemy,
les credentials et le state sont disponibles avant toute mutation.

Un provider de publication simple peut se limiter à uploader un artefact
statique. Un provider d'infrastructure comme Alchemy peut également créer les
ressources, les bindings, les permissions et le state associés. La CLI doit
refuser un manifest dont le runtime ou le mode du runtime `static` n'est pas
supporté par le provider choisi.

## Presets de runtime

### Static SPA / SSG

- build client ;
- assets hashés avec cache immutable ;
- mode `spa` avec fallback configurable ;
- mode `ssg` avec liste de routes et génération d'un HTML par route ;
- distinction explicite entre les routes pré-rendues et les routes qui
  nécessitent un runtime serveur ;
- smoke test d'une route profonde et, en mode SSG, vérification des fichiers
  HTML générés.

### Node SSR

- build client + serveur ;
- Dockerfile reproductible ;
- `/health` et `/ready` ;
- arrêt gracieux ;
- smoke HTTP ;
- cache et headers de sécurité.

### Worker

- export `fetch(request, env, ctx)` ;
- interdiction des imports Node ;
- bindings déclarés dans le manifest ;
- test local de l'adapter Worker.

`createCraftWorkerFetch` rend portable l'application HTTP CraftTS et les
server-functions. Il ne rend pas automatiquement un serveur SSR dépendant de
`node:http`, `node:fs` ou d'un serveur de fichiers compatible Node. Le preset
Worker doit donc vérifier que l'entrée SSR utilise bien l'API Web et un accès
aux assets compatible avec la plateforme visée.

### Lambda

- adapter Function URL ;
- une ou plusieurs server-functions par unité de déploiement ;
- variables et permissions déclarées ;
- test de contrat partagé local/Lambda.

La même server-function doit conserver son contrat, son protocole et ses
erreurs lorsqu'elle passe du runtime local à une Function URL Lambda.

## Matrice initiale des providers

La liste des providers est une liste d'intégrations de déploiement, pas une
liste de runtimes du core. La première matrice documentée peut être :

| Provider         | SPA | SSG | SSR Node          | Worker            | Lambda     | Infrastructure |
| ---------------- | --- | --- | ----------------- | ----------------- | ---------- | -------------- |
| Alchemy          | oui | oui | oui               | oui               | oui        | oui            |
| Docker/Node      | non | non | oui               | non               | non        | non            |
| Cloudflare Pages | oui | oui | non ou spécifique | non ou spécifique | non        | non            |
| Vercel           | oui | oui | oui               | spécifique        | spécifique | partiel        |
| Netlify          | oui | oui | oui               | spécifique        | fonctions  | non            |
| Firebase         | oui | oui | oui               | non               | fonctions  | partiel        |
| GitHub Pages     | oui | oui | non               | non               | non        | non            |

Chaque entrée doit préciser le type d'artefact attendu, la commande de build,
la commande de preview local, le mécanisme de credentials et les limites du
provider. Ajouter un provider à la matrice ne signifie pas qu'il doit être
implémenté dans le core.

## Intégration Alchemy

`@craft-ts/deploy-alchemy` doit fournir des presets, pas une nouvelle logique
applicative :

- `StaticSite` pour une SPA ;
- `Website.Vite` ou Worker pour SSR quand la cible est compatible ;
- `AWS.Lambda.Function` pour une server-function indépendante ;
- ECS/Fargate pour le runtime Node de repli ;
- state, outputs, bindings et permissions ;
- preview avant mutation.

L'intégration doit consommer le manifest produit par CraftTS. Elle ne doit pas
reconstruire les routes, les contrats ou les layers métier.

Alchemy doit être traité comme un provider d'infrastructure capable de couvrir
plusieurs plateformes, et non comme un runtime supplémentaire. Un provider de
publication comme Cloudflare Pages, Vercel ou Netlify peut réutiliser le même
manifest et ne prendre en charge que la publication de l'artefact. Les deux
familles doivent partager le même contrat CraftTS, mais pas nécessairement la
même implémentation de state, credentials ou preview.

La parité recherchée avec les frameworks qui proposent plusieurs presets de
déploiement porte sur l'expérience et les artefacts produits, pas sur
l'introduction d'une dépendance runtime à un moteur d'infrastructure.

## CI/CD généré

Le template CI doit séparer les contrôles rapides et les contrôles de l'artefact :

```text
pull request
  → install reproductible
  → craft check
  → tests unitaires
  → craft build
  → smoke artefact
  → E2E ciblés

merge main
  → artefact immuable
  → preview infrastructure
  → staging
  → health/readiness
  → smoke server-functions
  → promotion
```

Les credentials et secrets restent fournis par le système CI ou le provider,
jamais écrits dans le projet généré.

## Documentation à maintenir

La documentation fait partie du contrat de déploiement. Toute modification du
manifest, d'un runtime ou d'un provider doit mettre à jour dans le même cycle :

- ce plan, si la décision d'architecture ou la matrice évolue ;
- le guide de démarrage avec les commandes réellement supportées ;
- la référence du manifest et des diagnostics ;
- le guide du runtime concerné, notamment SSR/hydration et server-functions ;
- le guide du provider avec ses prérequis, credentials, stages, preview,
  outputs, limites et procédure de rollback ;
- les exemples générés et les workflows CI ;
- les notes de migration lorsque le manifest ou le protocole change.

Les exemples de documentation doivent être testés ou validés automatiquement
comme les templates générés. Une matrice de capacités obsolète est un défaut de
release au même titre qu'un artefact de build incorrect.

## Phases

### Phase 0 — Contrat et démonstrateur

- stabiliser `CraftDeploymentManifest` ;
- documenter le vocabulaire `runtime` / `platform` / `provider` ;
- documenter les modes `spa` et `ssg` ;
- publier la première matrice de capacités des providers ;
- documenter les runtimes, les plateformes, les artefacts attendus et les
  erreurs ;
- produire un manifest à partir de `demo-ssr` ;
- tester la sérialisation et la validation.

**Sortie :** un projet peut décrire son artefact sans dépendre d'Alchemy.
La documentation de référence doit être mise à jour dans le même changement
que le contrat et les exemples de manifest.

### Phase 1 — `@craft-ts/deploy` et `craft check`

- créer le package de types et de validation ;
- détecter les imports Node incompatibles ;
- vérifier chemins, runtime/platform, health/readiness et variables ;
- vérifier les routes et la configuration SSG ;
- vérifier les capacités du provider choisi ;
- réutiliser `production:check` derrière une API stable.

**Sortie :** les erreurs de déploiement courantes apparaissent avant le build.
Ajouter une page de référence des diagnostics avec, pour chaque erreur, la
le runtime ou la plateforme concernés, le fichier, la cause et la correction
attendue.

### Phase 2 — CLI build et templates

- créer `@craft-ts/cli` ;
- implémenter `init`, `check`, `build`, `deploy init` ;
- générer Docker, Worker, Lambda, publication statique et CI ;
- ajouter les templates SPA, SSG et Node SSR ;
- documenter les fichiers générés et les points d'extension sans les masquer
  derrière la CLI.

**Sortie :** un nouveau projet obtient un chemin local → CI sans copier des
fichiers à la main. Le guide de démarrage doit être mis à jour avec les
commandes réellement générées et un exemple par runtime.

### Phase 3 — Provider Alchemy optionnel

- créer `@craft-ts/deploy-alchemy` ;
- ajouter les presets Cloudflare et AWS ;
- vérifier preview, credentials, state et outputs ;
- déployer une SPA puis une server-function de démonstration ;
- ajouter un smoke HTTP réel et un rollback documenté ;
- documenter l'installation, les credentials, le state, les stages, le preview
  et les outputs ;
- documenter explicitement ce qui reste dans CraftTS et ce qui est délégué à
  Alchemy.

**Sortie :** Alchemy est utilisable sans apparaître dans les dépendances du
runtime CraftTS. La documentation Alchemy doit être versionnée avec le
provider et liée depuis la documentation générale de déploiement.

### Phase 4 — Multi-runtime et compatibilité

- exécuter le même contrat sur Node, Worker et Lambda ;
- publier la matrice Node/Angular/TypeScript/Effect/Nx ;
- tester les versions de CLI et de manifest ;
- versionner les providers indépendamment du core ;
- publier une matrice runtime/provider/platform à chaque release ;
- ajouter une procédure de migration lorsque le manifest ou un provider évolue.

**Sortie :** un projet peut changer de runtime ou de provider sans réécrire son
métier.
La matrice, les guides provider et les notes de migration doivent être
produits comme des artefacts de release, pas maintenus uniquement dans les
plans de développement.

## Tests à prévoir

- tests unitaires du validator de manifest ;
- tests de snapshot des manifests générés ;
- tests négatifs des imports Node en runtime Worker/Lambda ;
- tests négatifs des couples runtime/platform/provider incompatibles ;
- tests de prerender SSG et de fallback SPA ;
- tests d'idempotence de `craft deploy init` ;
- tests CLI avec projet vide, projet existant et projet partiellement configuré ;
- smoke local Node/Worker/Lambda ;
- test de contrat server-function local versus Function URL ;
- test provider en mode preview sans mutation ;
- test CI sur un projet généré minimal ;
- vérification des liens et exemples de la documentation générée.

## Critères de réussite

Le tooling est prêt pour une première release quand :

- `npm create craft-ts` produit un projet qui passe `craft check` ;
- `craft build` produit un manifest immuable ;
- les runtimes Node et Worker fonctionnent sans configuration manuelle cachée ;
- SPA et SSG produisent les artefacts et fallbacks documentés ;
- une Lambda de démonstration fonctionne avec le même contrat ;
- Alchemy reste une dépendance optionnelle ;
- au moins un provider d'infrastructure et un provider de publication statique
  consomment le même manifest ;
- aucun secret n'est généré ou commité ;
- les erreurs indiquent le fichier, le runtime/provider concerné et la
  correction attendue ;
- la CI générée vérifie le véritable artefact de production.

## Décisions prises

Les points ci-dessous étaient ouverts avant implémentation ; ils sont tranchés
et ne doivent pas être rejoués sans raison.

- **Nom de la CLI** : binaire `craft-ts`, package `@craft-ts/cli`. Le binaire
  `craft` est déjà pris par `@craft-ts/dev-tools` (`route`, `graph`,
  `security check`, `create`) et deux packages ne peuvent pas déclarer le même
  binaire.
- **Emplacement du manifest** : `craft.deploy.ts` à la racine de l'application,
  avec repli sur `.mts`, `.mjs`, `.js` et `.json`. Les chemins qu'il contient
  sont relatifs au répertoire d'exécution de la commande (`--root`, par défaut
  le répertoire courant), donc à la racine du monorepo.
- **Forme des champs** : `runtime`, `platform` et `static.mode` sont des unions
  de littéraux ; le runtime discrimine la section obligatoire au typage
  (`static` + `client`, `server`, `worker`, `lambda`). Le `provider` n'est pas
  un champ du manifest : il est passé à la commande.
- **Champ `source`** ajouté aux sections `server`, `worker` et `lambda` : le
  module qui produit `entry`. Sans lui, aucune analyse statique n'est possible
  avant le premier build, ce qui vide `craft check` de son intérêt.
- **Prerender SSG** : `static.routes` est la liste exhaustive des chemins
  littéraux ; une route non réductible à un document unique est refusée et doit
  passer par `static.serverRoutes`. Un document est reconnu comme
  `<route>.html` ou `<route>/index.html`.
- **Couplage Nx** : aucun. La CLI ne connaît que des chemins et des commandes ;
  les cibles Nx restent déclarées comme des chaînes dans le manifest.
- **Provider initial** : Alchemy, en package séparé. Docker et la publication
  statique restent vérifiés par `check`, pas déployés.
- **`preview` renvoie un plan** au lieu de ne rien renvoyer, et `check` renvoie
  des diagnostics au lieu de lever : le plan est la surface d'approbation de
  `craft-ts deploy`, et les diagnostics du provider doivent rejoindre ceux de
  `craft-ts check`.
- **Les capacités sont vérifiées sur le provider chargé**, pas sur la matrice
  documentée, pour qu'un projet puisse déployer avec un provider que CraftTS ne
  fournit pas.
- **`craft-ts deploy` exige `--yes`** après avoir affiché le plan ; sans lui il
  s'arrête sur `CRAFT_DEPLOY_DEPLOY_NOT_CONFIRMED`.
- **Alchemy passe par un port de runtime** (`AlchemyRuntime`) : c'est ce qui
  rend « une preview ne mute rien » démontrable en test, et ce qui concentre
  l'API Alchemy dans une seule table, `ALCHEMY_RESOURCE_EXPORTS`.
- **Politique source maps** : `forbidden` par défaut, `external` ou `allowed`
  sur choix explicite de l'application.
- **Versionnement du manifest** : `protocolVersion` littéral (`'1'`), refusé
  s'il diffère plutôt que réinterprété.
- **Documentation** : sous `apps/docs/guide/deployment/`, et vérifiée par un
  test qui compare la page des diagnostics au catalogue de codes et la page des
  providers à la matrice exportée.

## Points à décider avant implémentation (tranchés)

- nom final de la CLI : `craft`, `craft-ts` ou `@craft-ts/cli` ;
- emplacement du manifest : `craft.deploy.ts`, `craft.config.ts` ou section de
  `project.json` ;
- forme exacte des champs `runtime`, `platform`, `provider` et `static.mode` ;
- protocole de prerender SSG et format de la liste de routes ;
- génération via templates npm ou via un package `create-craft-ts` ;
- niveau de couplage entre Nx et la CLI ;
- provider initial : Alchemy uniquement ou publication statique/Docker d'abord ;
- niveau de support des providers Analog-like : publication d'artefact,
  runtime managé ou provisionnement d'infrastructure ;
- politique source maps, compression et cache par runtime/provider ;
- stratégie de versionnement et migration du manifest ;
- emplacement de la documentation générée et stratégie de vérification des
  exemples.

## Recommandation

Commencer par `@craft-ts/deploy` + `craft check` + manifest, puis ajouter la
CLI de génération. L'intégration Alchemy vient ensuite comme provider
optionnel. Cette séquence apporte immédiatement de la valeur à tous les
projets CraftTS, y compris ceux qui déploient sans Alchemy. Ajouter le mode SSG
et la matrice de providers au contrat avant de multiplier les intégrations, afin
que les providers Analog-like et Alchemy consomment le même modèle sans
polluer `@craft-ts/core`.
