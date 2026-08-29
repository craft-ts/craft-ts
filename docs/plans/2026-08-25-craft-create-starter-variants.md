# Plan — variantes de démarrage de `craft create`

## Objectif

Faire de `craft create` un générateur de starters réellement configurables et
exécutables dès le premier `npm install && npm run dev`.

Les choix proposés sont :

- runtime frontend plain CraftTS ou Effect v4 ;
- backend absent, Promise/plain server functions ou Effect v4 server functions ;
- i18n activé ou non ;
- design system activé ou non ;
- typed CSS activé ou non ;
- workspace standalone ou Nx ;
- sources de référence locales pour l’IA, CraftTS et éventuellement EffectTS ;
- dépendances consommées depuis npm ou depuis les builds locaux des sources de
  référence ;
- intégrations d’agents.

Quand i18n est activé, le starter contient un cas minimal complet avec `en-US`
comme locale de base, `fr-FR` comme seconde locale, trois pages routées et des
traductions visibles. Quand Effect v4 est activé, les services, loaders,
computations et traductions dans les programmes Effect utilisent exclusivement
les APIs Effect dédiées (`Context.Service`, `Layer`, `queryEffect`,
`computedEffect`, `mutationEffect`, `asyncProcessEffect`, `translateEffect`,
etc.).

Le plan couvre aussi la génération et la vérification automatique de toutes les
combinaisons supportées.

## État actuel constaté

Le point d’entrée est :

```text
libs/dev-tools/src/scripts/create/create-project.ts
libs/dev-tools/src/bin/craft.ts
libs/dev-tools/src/scripts/create/create-project.spec.ts
```

Aujourd’hui :

- `@craft-ts/i18n`, le catalogue et les scripts i18n sont générés même sans
  choix explicite ;
- le design system et le plugin `@craft-ts/style/vite` sont générés même sans
  choix explicite ;
- le CLI accepte déjà `--effect`, `--agents`, `--locales`,
  `--default-locale` et `--i18n strict|loose` ; ce dernier contrôle la
  validation, pas l’activation ;
- le starter plain utilise `query` et `craftComputed` ;
- le starter Effect utilise `queryEffect` mais conserve encore
  `craftComputed` et `i18n.t` dans la page principale ;
- les tests inspectent les fichiers générés mais ne parcourent pas une matrice
  complète de projets installés, compilés, buildés et démarrés.
- le starter est actuellement pensé comme un package standalone ; il ne sait
  pas encore être ajouté proprement à un workspace Nx existant ;
- le choix actuel `mode: plain|effect` ne distingue pas le runtime navigateur du
  runtime des server functions ;
- le template ne propose pas encore de server function backend configurable ;
- aucun clone local de CraftTS ou d’EffectTS n’est encore décrit dans le
  template, les agents ou les scripts de mise à jour.

La première tâche devra donc séparer ce qui est actuellement toujours présent
avant d’ajouter les options.

## Décisions structurantes

### Une configuration normalisée unique

Introduire un modèle interne, utilisé par le CLI, le mode interactif et le
renderer de templates :

```ts
type StarterConfig = {
  /** Legacy input only; rendering uses the two explicit runtime axes below. */
  readonly mode?: 'plain' | 'effect';
  readonly frontendRuntime: 'plain' | 'effect';
  readonly backendRuntime: 'none' | 'promise' | 'effect';
  readonly workspace: {
    readonly kind: 'standalone' | 'nx';
    readonly projectName: string;
    readonly rootDir: string;
  };
  readonly i18n: {
    readonly enabled: boolean;
    readonly locales: readonly string[];
    readonly defaultLocale: string;
    readonly validation: 'strict' | 'loose';
  };
  readonly designSystem: 'none' | 'basic';
  readonly typedCss: boolean;
  readonly references: {
    readonly craftTs: boolean;
    readonly effectTs: boolean;
    readonly mode: 'context';
    readonly craftTsRef: string;
    readonly effectTsRef: string;
  };
  readonly agents: readonly CreateAgent[];
};
```

`createCraftProject()` reçoit une configuration normalisée et ne contient plus
de logique de prompt. Les règles de défaut et de validation vivent dans une
fonction dédiée, par exemple `normalizeCreateOptions()`.

Le champ historique `mode` ne doit plus piloter directement les templates. Il
reste accepté comme alias de migration, puis devient :

```text
mode=plain  → frontendRuntime=plain, backendRuntime=none
mode=effect → frontendRuntime=effect, backendRuntime=none
```

Le backend Effect est toujours un choix explicite, afin de pouvoir générer un
frontend plain qui appelle des server functions Effect sans installer ni
importer les adaptateurs Effect dans le navigateur.

`CreateProjectResult` doit retourner `frontendRuntime`, `backendRuntime` et la
configuration complète effective. Le champ de résultat `mode` peut rester
temporairement comme valeur dérivée pour les consommateurs existants, mais ne
doit plus être utilisé pour décider quels fichiers écrire.

Règles de validation :

- `--locales` et `--default-locale` nécessitent i18n activé ;
- la locale par défaut doit appartenir à la liste ;
- i18n activé sans locales explicites utilise `['en-US', 'fr-FR']`, avec
  `en-US` par défaut ;
- typed CSS est indépendant du design system ;
- design system + typed CSS utilise les sheets typées ;
- design system sans typed CSS utilise des classes CSS ordinaires, sans
  importer `@craft-ts/style` ;
- `references.effectTs` nécessite `frontendRuntime=effect` ou
  `backendRuntime=effect` ;
- `backendRuntime=effect` nécessite une surface server functions ;
- `backendRuntime=effect` ne rend pas le frontend Effect obligatoire ;
- `frontendRuntime=effect` ne rend pas le backend Effect obligatoire ;
- les références clonées servent uniquement de contexte pour les agents ; les
  dépendances d’exécution restent toujours les paquets npm publiés ;
- aucun fichier, script ou dépendance optionnelle ne doit rester dans une
  variante désactivée.

Le choix `en-US` / `fr-FR` doit être le cas de démonstration par défaut, pas une
contrainte du moteur : les locales fournies explicitement continuent d’être
supportées.

### CLI non interactif et rétrocompatibilité

Conserver les options existantes et ajouter une forme explicite pour chaque
feature :

```text
--i18n <strict|loose|none>
--no-i18n
--frontend-runtime <plain|effect>
--backend-runtime <none|promise|effect>
--effect-scope <none|frontend|backend|both>
--design-system <basic|none>
--no-design-system
--typed-css
--no-typed-css
--workspace <standalone|nx>
--references <none|craft-ts|all>
--craft-ts-ref <git-ref>
--effect-ts-ref <git-ref>
--clone-craft-ts
--no-clone-craft-ts
--clone-effect-ts
--no-clone-effect-ts
```

`--i18n strict|loose` garde son sens actuel et active i18n. `none` et
`--no-i18n` le désactivent.

Les options canoniques sont `--frontend-runtime` et `--backend-runtime`.
`--effect-scope` est un raccourci pour les cas courants :

| Valeur | Frontend | Backend/server functions |
|---|---|---|
| `none` | plain | aucun |
| `frontend` | Effect v4 | aucun |
| `backend` | plain | Effect v4 |
| `both` | Effect v4 | Effect v4 |

`--effect=v4` reste accepté comme alias historique de `--frontend-runtime=effect`.
Il ne doit pas activer le backend par surprise. Pour un full-stack Effect, utiliser
`--effect-scope=both` ou fournir explicitement
`--backend-runtime=effect`. `--effect=none` conserve le frontend plain et le
backend absent.

Pour préserver le comportement des scripts existants, le profil non
interactif sans option nouvelle conserve le starter actuel : i18n strict,
design system basic et typed CSS activé. Les nouveaux choix permettent ensuite
de demander un starter minimal.

`--yes` applique ce profil stable sans poser de question. `--json` doit
retourner la configuration effective dans le résultat de création.

Le profil stable clone uniquement les sources demandées explicitement. Le
clone de repositories et le passage en dépendances locales sont des effets
réseau et disque importants : ils ne doivent jamais être déclenchés par une
détection implicite ou par `--yes` sans option de référence.

### Mode interactif

Quand les options ne sont pas entièrement fournies et que stdin est un TTY,
`craft create` pose les questions suivantes :

1. répertoire du projet ;
2. Effect v4 côté frontend ? ;
3. ajouter des server functions backend ? ;
4. si oui, backend Promise/plain ou Effect v4 ? ;
5. i18n ;
6. si oui, locales et locale par défaut ;
7. design system ;
8. typed CSS ;
9. workspace standalone ou Nx ;
10. cloner les sources de référence pour l’IA ;
11. si nécessaire, utiliser les dépendances locales ;
12. intégrations d’agents.

Chaque question doit afficher le choix recommandé. Les réponses explicites en
ligne de commande ne sont jamais redemandées. Un mode interactif doit produire
exactement la même `StarterConfig` qu’un appel équivalent avec flags.

Ajouter des helpers de prompt testables sans TTY : réponse oui/non, sélection
de valeur, liste de locales et validation des valeurs. Ne pas appeler
`readline` depuis le renderer.

Si Effect v4 est sélectionné sur au moins un axe, la question EffectTS est
proposée avec la valeur recommandée correspondant à la référence compatible
enregistrée dans le manifeste. Si les deux axes sont plain/absent, le clone
EffectTS est désactivé et ne peut être forcé qu’avec une option explicite.

## Runtime frontend et backend indépendants

Le choix Effect doit être modélisé par deux programmes TypeScript séparés :

```text
frontendRuntime: plain | effect
backendRuntime: none | promise | effect
```

Le backend `promise` représente une server function portable qui utilise les
APIs Promise de `@craft-ts/core`. Le backend `effect` utilise
`serverFunction`, `craftMiddleware`/`effectServerMiddleware`, `Context.Service`,
`Layer` et `executeEffect`. Le frontend appelle toujours une facade client
typée ; il ne reçoit jamais les implémentations ou les Layers du backend.

### Quatre profils runtime

| Profil | Navigateur | Server functions | Packages/adaptateurs Effect dans le frontend |
|---|---|---|---|
| plain seul | `query`, `craftComputed`, `craftService` | absent | aucun |
| frontend Effect | `queryEffect`, `computedEffect`, `provideLayer` | absent ou Promise | oui, frontend seulement |
| backend Effect | `query`, `craftComputed`, `craftService` | `Effect.gen`, `Layer`, `executeEffect` | aucun |
| full-stack Effect | `queryEffect`, `computedEffect`, `provideLayer` | `Effect.gen`, `Layer`, `executeEffect` | oui, frontend et backend |

Le profil backend Effect est le cas important à préserver : le navigateur
reste plain, mais une page peut appeler une server function dont le handler et
le repository sont entièrement Effect v4. Le package `effect` est alors une
dépendance serveur/runtime et aucun fichier sous `src/app` ne doit importer
`@craft-ts/effect`, `effect` ou `provideLayer`.

### Surface server functions générée

Quand `backendRuntime` vaut `promise` ou `effect`, ajouter une surface minimale
à la base :

```text
src/server/application.ts
src/server/node-http.ts
src/server/server.ts          # compatibility exports
src/server/repository.ts
src/server/<name>.fn-serveur.ts
src/<name>.fn-client.ts
```

`application.ts` owns the CraftTS registry and the Effect runtime `Layer`;
`node-http.ts` only adapts the Node stream to a Web `Request` and delegates body
limits and cancellation to the registry. `server.ts` remains a small
compatibility barrel for existing imports.

Le frontend possède une page qui appelle la facade client et expose loading,
success et erreur. Le serveur possède un test direct de la registry et un
test HTTP. Le choix backend ne peut donc pas être seulement une dépendance : il
modifie aussi le runtime Vite/dev, les scripts, les tsconfig, les tests et la
documentation générés.

Pour `backendRuntime=promise` :

- utiliser `portableServerFunction`, `serverLayer`, `mapContext` et
  `flatMapContext` selon le contrat existant ;
- ne générer aucun import `effect` dans `src/server` ;
- exécuter la registry avec l’adaptateur Promise par défaut.

Pour `backendRuntime=effect` :

- utiliser `Context.Service` et `Layer` pour le repository ;
- utiliser `Effect.gen`, `Schema` et les erreurs typées dans le handler ;
- exécuter la registry avec `executeEffect(layer).run` ;
- placer les middlewares dans `*.mw-serveur.ts` et utiliser
  `effectServerMiddleware` quand le middleware est lui-même Effect ;
- installer les Layers à la frontière serveur, jamais dans le bundle browser.

### Tsconfig, lint et skills séparés

Générer des programmes distincts quand le backend existe :

```text
tsconfig.app.json       # frontend/browser
tsconfig.server.json    # server functions
tsconfig.effect.json    # union des fichiers Effect nécessaires
```

Le preset ESLint doit s’appliquer par répertoire et par axe : le preset Effect
est activé sur `src/app/**` uniquement si `frontendRuntime=effect`, et sur
`src/server/**` uniquement si `backendRuntime=effect`. Les tests doivent
vérifier les imports interdits dans les deux directions.

Les instructions générées pour les agents doivent contenir deux sections
distinctes : « Frontend runtime » et « Backend runtime ». Elles doivent
explicitement expliquer qu’un backend Effect n’autorise pas à introduire
Effect dans les composants navigateur.

## Sources de référence locales pour l’IA

### But et emplacement

Quand l’utilisateur active les sources de référence, le générateur clone les
repositories dans un sous-dossier stable :

```text
.references/
  manifest.json
  craft-ts/
  effect-ts/
```

Le clone doit contenir tout l’arbre de travail du repository afin que l’IA
puisse naviguer dans les packages, exemples, tests, guides et scripts. Le
clone peut être shallow (`--depth 1`) pour ne pas transporter tout l’historique
Git ; il ne doit pas être sparse ni limité aux seuls packages consommés.

Le manifeste est la source de vérité et doit enregistrer l’URL, la ref demandée,
le SHA résolu, le chemin local, la version du schéma et l’état du dernier build :

```json
{
  "craftTs": {
    "url": "https://github.com/craft-ts/craft-ts.git",
    "requestedRef": "...",
    "resolvedSha": "...",
    "path": ".references/craft-ts"
  },
  "effectTs": {
    "url": "https://github.com/Effect-TS/effect.git",
    "requestedRef": "...",
    "resolvedSha": "...",
    "path": ".references/effect-ts"
  }
}
```

Créer une seam unique `scripts/reference-resolver.mjs` avec des fonctions du
type `resolveReferencePath(root, 'craftTs')` et
`resolveReferenceManifest(root)`. Les scripts, les targets Nx, les liens
d’agents et le mode `local` passent par cette seam ; aucun appelant ne concatène
directement `.references` ou ne suppose que le projet est standalone.

Pour les liens lisibles par l’IA, préférer des chemins Markdown relatifs et les
chemins absolus calculés uniquement au runtime des scripts. Ne pas créer de
symlinks par défaut : ils se comportent différemment selon Windows, macOS, CI
et les outils d’indexation.

### Résolution CraftTS et EffectTS

Ne pas hardcoder une branche nommée « v4 » sans la vérifier : la branche
EffectTS en développement peut changer. Le générateur doit utiliser un
manifest de compatibilité versionné avec `@craft-ts/dev-tools` :

```ts
const referenceCompatibility = {
  craftTs: {
    repository: 'https://github.com/craft-ts/craft-ts.git',
    ref: '<craft-ts-compatible-tag-or-commit>',
    packages: ['@craft-ts/core', '@craft-ts/component', '@craft-ts/dev-tools'],
  },
  effectTs: {
    repository: 'https://github.com/Effect-TS/effect.git',
    ref: '<pinned-v4-tag-or-commit>',
    packages: ['effect', '@effect/tsgo'],
  },
} as const;
```

La valeur Effect doit être remplacée par un tag ou un SHA réellement vérifié
contre la plage actuellement utilisée par le starter (`effect@^4.0.0-rc.110`)
et le runner `effect-tsgo`. Si aucun tag
v4 compatible n’existe, le resolver peut partir de `main`, lire le manifest du
repository, vérifier la major v4, puis enregistrer le SHA résolu. Il doit
échouer clairement si la vérification ne passe pas, jamais cloner une version
v3 en silence.

Les refs passées par l’utilisateur sont autorisées, mais elles doivent être
résolues en SHA et validées par les mêmes contrôles. Les URLs arbitraires ne
sont pas acceptées par défaut : prévoir une liste d’hôtes autorisés ou une
option explicite d’extension pour éviter qu’un template exécute un clone
inattendu.

### Références locales pour les agents

La vendorisation Git et la résolution des dépendances sont deux décisions
distinctes. Les référentiels CraftTS et EffectTS sont intégrés sous
`.references/*` avec `git subtree` uniquement pour permettre aux agents de
rechercher les implémentations, types, tests et exemples. Le starter utilise
toujours les paquets npm publiés déclarés dans `package.json`.

La génération ne doit ni installer ni construire les clones, ni écrire de
dépendances `file:`, ni ajouter d’alias TypeScript/Vite vers leurs sources. Les
scripts `update:*` mettent uniquement à jour le checkout et le SHA du manifeste.

### Scripts de mise à jour

Ajouter aux scripts du projet standalone :

```text
update:craft-ts
update:effect-ts
update:references
```

Ils appellent un seul orchestrateur généré, par exemple
`scripts/update-references.mjs`, qui :

- lit `.references/manifest.json` ;
- exécute `git subtree pull --squash` pour la ref demandée ;
- met à jour uniquement le subtree demandé et son SHA source ;
- ne modifie que le checkout et le SHA du manifeste ;

Les scripts doivent être idempotents, fonctionner hors ligne si le SHA est
déjà présent, et ne jamais faire de `git reset --hard` dans un dossier que
l’utilisateur a modifié sans demander confirmation. Les changements locaux
doivent être détectés avant toute mise à jour.

Les agents doivent recevoir des liens relatifs et explicites, par exemple :

```text
Lire .references/craft-ts/README.md pour le domaine CraftTS.
Lire .references/craft-ts/apps/demo-effect pour les exemples Effect v4.
Lire .references/effect-ts/packages/effect pour l’API Effect v4.
```

La génération de ces liens doit être conditionnelle aux clones réellement
présents.

Les sources de `.references` sont suivies dans le Git du projet comme des
subtrees squashés. Le README doit expliquer comment les actualiser avec
`npm run update:references`; le lockfile et les paquets npm restent
indépendants de la présence de ces sources comme dépendances d’exécution.

## Intégration standalone et Nx

Ajouter `--workspace standalone|nx`. Sans option, détecter `nx.json` dans la
racine ciblée ; en cas de détection, demander confirmation en mode interactif
et refuser une création ambiguë en mode non interactif.

### Projet standalone

Le starter possède son propre `package.json`, lockfile, `tsconfig`, scripts et
`.references`. Les trois pages sont générées dans le répertoire cible et les
scripts `update:*` sont exécutables depuis ce répertoire.

### Nouveau workspace Nx

Quand `--workspace=nx` vise un répertoire vide :

- initialiser un workspace Nx une seule fois ;
- créer l’application sous `apps/<projectName>` ;
- conserver `package.json`, `package-lock.json`, `nx.json` et les configs
  TypeScript à la racine ;
- placer `.references` à la racine du workspace ;
- exposer les mises à jour comme targets Nx et comme scripts racine ;
- ne jamais créer un second `nx.json`, un second lockfile ou un Nx imbriqué.

### Workspace Nx existant

Quand la racine contient déjà `nx.json` :

- utiliser le nom de projet Nx comme identité canonique ;
- ajouter ou fusionner `apps/<projectName>/project.json` sans écraser les
  targets existants ;
- ajouter les références TypeScript au niveau attendu par le workspace ;
- ajouter les dépendances au `package.json` racine, jamais dans un package
  enfant isolé ;
- placer `.references` à la racine détectée ;
- générer les targets `typecheck`, `test`, `architecture`, `build`, `e2e` et
  `update-references` avec les conventions Nx du workspace ;
- faire fonctionner les commandes aussi bien via `npm run` que via
  `nx run <project>:<target>`.

Les scripts de mise à jour deviennent alors des targets :

```text
nx run <project>:update-craft-ts
nx run <project>:update-effect-ts
nx run <project>:update-references
```

Le runner doit utiliser `NX_DAEMON=false` dans les opérations Git/build
reproductibles et respecter le cache Nx pour les validations du projet. Les
références clonées ne doivent pas être ajoutées aux sources applicatives du
projet ni analysées par défaut par les targets `lint`, `typecheck` ou
`architecture`.

### Template adapté au workspace

L’adaptation Nx ne se limite pas à ajouter une dépendance :

- `package.json`, scripts et lockfile suivent le niveau racine ;
- `project.json` décrit les targets du projet ;
- `vite.config.ts`, Playwright et Vitest utilisent des chemins relatifs au
  projet Nx ;
- les artefacts `.craft`, catalogues d’architecture et dumps de style restent
  dans le project root ;
- README, `.mcp.json` et instructions d’agents pointent vers la racine réelle
  et `.references` réel ;
- le profil Effect ajoute ses `tsconfig` et targets au bon niveau sans
  convertir le workspace entier en Effect.

## Adaptation complète du template selon les options

Chaque option doit modifier un `TemplateContext` complet, pas seulement
`package.json` :

| Option | Fichiers/configurations qui doivent changer ensemble |
|---|---|
| i18n | packages, catalogue, locales, runtime, pages, scripts, tests, README, `lang`/`dir` |
| frontend Effect | packages, bridge, Layers, `queryEffect`/`computedEffect`, lint, tsconfig frontend, tests, skill |
| backend Effect | packages serveur, server functions, `Effect.gen`, Layers, `executeEffect`, tsconfig server, tests, skill |
| design system | blocs UI, imports de pages, thème, page de composition, tests et README |
| typed CSS | `@craft-ts/style`, plugin Vite, import virtuel, sheets, lint, tests et CSS global |
| références | `.references`, manifeste, liens agents/MCP, scripts update et mode de dépendances |
| Nx | emplacement des fichiers, manifests racine, `project.json`, targets, chemins et commandes |

Ajouter un test de cohérence qui parcourt les imports et les scripts générés :
une feature active doit être atteignable depuis une page ou un target, et une
feature inactive ne doit laisser ni fichier orphelin ni référence textuelle
dans le README.

## Architecture des templates

Remplacer le gros assemblage implicite de `templates(context)` par des
fragments conditionnels :

```text
base/
effect/
i18n/
design-system/plain/
design-system/typed-css/
typed-css/
agents/
```

Le code peut rester dans `create-project.ts` au début, mais chaque fragment
doit avoir une fonction de rendu claire et un contrat de fichiers. Une étape
ultérieure pourra déplacer les chaînes vers des fichiers de fixtures si le
fichier devient trop volumineux.

### Base commune

Toutes les variantes doivent contenir :

- une app CraftTS framework-independent ;
- trois routes lazy-loadées : `/`, `/services`, `/about` ;
- la preuve DI des routes (`ValidateCascadeRoutesFile`, `CanRun`) ;
- un service ou utilitaire démontré par les pages ;
- une page de succès et d’erreur compréhensibles ;
- tests unitaires, architecture, typecheck et Playwright ;
- la surface logs/MCP existante ;
- un README qui décrit uniquement les fonctionnalités effectivement générées.

Les trois pages doivent montrer le même contrat visuel et le même mécanisme de
DI que le mode choisi :

| Page | Démonstration |
|---|---|
| `/` | chargement d’une donnée et état loading/success/error |
| `/services` | service injecté au scope app ou route, rendu dans la page |
| `/about` | route lazy, composition de composants et lien vers les deux autres |

Quand i18n est actif, chaque page affiche au moins un message traduit. La page
`/services` doit aussi afficher une valeur formatée avec un token typé et un
pluriel minimal.

### Variante i18n

Ajouter conditionnellement :

```text
@craft-ts/i18n
src/i18n/catalog.ts
src/i18n/project-tokens.ts
src/i18n/runtime.ts
src/i18n/locales/en-US.ts
src/i18n/locales/fr-FR.ts
src/i18n/index.ts
```

Le catalogue minimal doit contenir :

- un titre de page ;
- un message avec `number`, `money` ou `dateLong` ;
- un pluriel (`one` / `other`) ;
- un libellé de statut ou d’erreur.

`en-US` est défini avec `defineLocale`, `fr-FR` avec
`defineLocaleLike`. Le runtime expose le changement de locale utilisé par les
tests, par exemple via `?locale=fr-FR` et `?locale=en-US`. Le document HTML,
`lang` et `dir` restent synchronisés.

Scripts et tests conditionnels :

```text
i18n:check
i18n:test
e2e/i18n.spec.ts
```

Quand i18n est désactivé, aucun import, script, fichier ou test i18n ne doit
être présent. Les textes de la base sont alors des chaînes simples.

### Variantes runtime Effect v4

Le package `@craft-ts/effect` et `effect` sont ajoutés uniquement si
`frontendRuntime=effect` ou `backendRuntime=effect`. Les imports et les fichiers
qui les utilisent dépendent toutefois de l’axe sélectionné. Les services
Effect suivent cette forme :

```ts
class StarterService extends Context.Service<StarterService, Shape>()(
  'starter/StarterService',
) {}

const StarterServiceLive = Layer.succeed(StarterService, implementation);
```

La configuration fournit les Layers avec `provideLayer()` et installe le
bridge une seule fois avec `installCraftEffectBridge()`.

Dans les fichiers de l’axe frontend Effect :

- lecture asynchrone : `queryEffect` ;
- dérivation synchronisée déclarée Effect : `computedEffect` ;
- écriture : `mutationEffect` ;
- processus long : `asyncProcessEffect` ;
- traduction dans un programme Effect : `translateEffect` ;
- service : `Context.Service` + `Layer` + `provideLayer`.

Dans les fichiers de l’axe backend Effect, utiliser `Effect.gen`,
`Context.Service`, `Layer`, `executeEffect` et les adaptateurs de server
functions, mais ne jamais importer les primitives frontend comme `queryEffect`
ou `computedEffect` dans un handler.

Interdire dans chaque axe les APIs de l’autre runtime : les fichiers frontend
plain ne peuvent pas importer `queryEffect`, `computedEffect`, `effect` ou
`provideLayer`; les fichiers backend Promise ne peuvent pas importer `Effect`,
`Layer` ou `executeEffect`; les composants n’appellent jamais directement
`Effect.runPromise`/`Effect.runSync`. Le renderer Craft et les helpers de
structure (`craftComponent`, `div`, `p`, etc.) restent communs.

Quand i18n est actif sur un axe Effect, ajouter `@craft-ts/i18n-effect` et les
fichiers d’adaptation uniquement dans le programme qui exécute Effect. Une
fonction de traduction typée doit appeler `translateEffect` dans le service ou
le domaine Effect ; `i18nRuntime.t` reste la voie plain du navigateur quand le
frontend est plain, et ne doit pas remplacer `translateEffect` dans un
programme backend Effect.

### Variante typed CSS

Quand typed CSS est actif :

- ajouter `@craft-ts/style` dans les dépendances et
  `@craft-ts/style-testing` dans les devDependencies ;
- activer `craftStyle()` dans `vite.config.ts` ;
- importer `virtual:craft-style.css` depuis `main.ts` ;
- ajouter `style:check` au package et au workflow CI générés ;
- générer uniquement des `*.style.ts` pour les styles applicatifs ;
- conserver dans `src/styles.css` seulement les règles globales que les sheets
  ne peuvent pas posséder ;
- ne construire aucune classe dynamiquement ; les variantes passent par
  `data-*`, les axes et `assign()`.

La référence de conception est :

```text
apps/demo/src/app/examples/design-system/components.style.ts
```

Le starter typed CSS doit rester minimal : palette ou thème, `stack`, `card`,
`button`, `alert` et éventuellement un `meter` à custom property typée. Chaque
bloc doit être réellement utilisé dans une page, pour que le démarrage
montre la composition et pas seulement des exports inutilisés.

Ajouter une spec de style légère qui vérifie au minimum :

- classes constantes ;
- absence de template string dans les bindings de classe ;
- variantes via attributs ;
- variables enregistrées avec le bon type ;
- plugin Vite présent.

Quand typed CSS est désactivé, retirer le plugin, l’import virtuel et les
packages associés. Si le design system reste activé, ses blocs utilisent une
feuille CSS ordinaire, mais aucun fichier ne doit prétendre démontrer typed CSS.

### Variante design system

Quand le design system est actif, générer une petite surface démontrable :

```text
src/app/ui/foundation.style.ts       # typed CSS uniquement
src/app/ui/components.style.ts      # typed CSS uniquement
src/app/ui/components.ts            # composants composables
src/app/design-system-page.ts       # page /about ou page dédiée
```

La page doit montrer :

- une composition `Stack` → `Card` → `Button` ;
- un `Alert` dont la tonalité est un axe ;
- une variante de taille ou de densité ;
- une valeur dynamique par custom property si typed CSS est actif.

Ne pas recopier tout l’exemple de la demo : extraire le plus petit cas qui
prouve palette/thème, composition, variante et valeur dynamique.

## Matrice de variantes

Les axes runtime et les trois options de template donnent 48 variantes valides
quand les server functions sont disponibles :

```text
2 runtimes frontend (plain/effect)
× 3 runtimes backend (none/promise/effect)
× 2 i18n on/off
× 2 design system on/off
× 2 typed CSS on/off
= 48 starters
```

Le backend `none` ne génère pas de surface server function ; les deux autres
valeurs en génèrent une. Le profil historique sans server function reste une
cellule de compatibilité couverte par `backend=none`.

Le workspace et les clones ne doivent pas multiplier aveuglément cette
matrice. Utiliser deux matrices complémentaires :

1. les 48 variantes de contenu et de runtime, exécutées en standalone et en
   Nx par un smoke représentatif ;
2. une suite de référence dédiée qui couvre `context` et `local`, CraftTS seul
   et CraftTS + EffectTS, avec le clone réel ou un miroir local de test.

Cela permet de tester toutes les adaptations du template sans cloner 64 fois
les repositories externes.

La matrice doit être déclarée comme donnée, pas reconstruite dans plusieurs
tests. Chaque cellule contient la configuration et les assertions attendues :

| Axe | Assertions positives | Assertions négatives |
|---|---|---|
| frontend plain | `query`, `craftComputed`, services plain | aucun import Effect dans `src/app` |
| frontend Effect | `queryEffect`, `computedEffect`, `Context.Service`, `Layer` | aucun `query`/`craftComputed` dans `src/app` |
| backend Promise | `portableServerFunction`, `serverLayer`, `flatMapContext` | aucun import Effect dans `src/server` |
| backend Effect | `serverFunction`, `Effect.gen`, `Context.Service`, `Layer`, `executeEffect` | aucun handler Promise ou Effect frontend dans `src/server` |
| i18n | packages, `en-US`, `fr-FR`, catalogue, scripts | aucun fichier/import i18n si off |
| design system | blocs et page de composition | aucun bloc DS si off |
| typed CSS | plugin, sheets, import virtuel, style test | aucun `@craft-ts/style` si off |
| references | manifeste, subtrees, liens d’agents, scripts update | aucun `.references` si off |
| workspace | `project.json` et targets Nx, ou package standalone | aucun Nx imbriqué |

## Tests et vérification

### Tests unitaires du générateur

Modifier :

```text
libs/dev-tools/src/scripts/create/create-project.spec.ts
```

Ajouter :

- tests de normalisation des defaults et des contradictions ;
- tests du parser pour chaque option, alias et forme `--flag=value` ;
- test du prompt interactif avec une readline simulée ;
- génération data-driven des 48 variantes runtime/template valides ;
- présence et absence des fichiers/dépendances/scripts selon la config ;
- test de parité `en-US`/`fr-FR` et du message traduit sur les trois pages ;
- test d’interdiction des APIs Effect dans un frontend plain ;
- test d’interdiction des APIs Effect dans un backend Promise ;
- test d’interdiction des APIs frontend Effect dans un backend Effect ;
- test d’interdiction des APIs plain dans les axes Effect correspondants ;
- test direct et HTTP de la server function pour les backends Promise et Effect ;
- test de l’intégration typed CSS et des classes constantes ;
- vérification que le README généré ne mentionne pas une feature absente.
- vérification de la cohérence des chemins relatifs vers `.references` et des
  scripts `update:*` ;
- test de génération dans un workspace Nx vide et dans un workspace Nx déjà
  existant, sans second lockfile ni second `nx.json`.

Ces tests restent rapides et n’installent pas de dépendances réseau.

### Smoke tests des projets générés

Créer un runner dédié, par exemple :

```text
tools/test-generated-starters.mjs
```

Pour chaque cellule de la matrice :

1. créer le starter dans un dossier temporaire ;
2. exécuter `npm install` ;
3. exécuter `npm run typecheck`, `npm test`, `npm run architecture`,
   `npm run typecheck-architecture` et `npm run build` ;
4. ajouter `npm run i18n:check` et `npm run i18n:test` si i18n est actif ;
5. ajouter `npm run effect-check` si Effect est actif ;
6. vérifier l’émission typed CSS et la matrice de styles si typed CSS est actif ;
7. lancer le serveur et un smoke Playwright pour vérifier que les trois routes
   répondent et que les textes attendus s’affichent ;
8. pour i18n, recharger en `fr-FR` et vérifier un texte traduit et `lang`.

Pour les variantes Nx, exécuter les mêmes contrôles via `nx run
<project>:<target>` et vérifier `nx graph`/`nx show project` pour confirmer que
les targets appartiennent au bon projet. Pour les variantes avec références,
vérifier le manifeste, le SHA, l’absence de fichiers hors `.references` et les
liens relatifs exposés aux agents.

Le runner doit partager le cache npm et être shardable en CI. Le CI doit
exécuter toutes les cellules, pas seulement le profil par défaut. Les logs
doivent imprimer la configuration de la cellule avant l’échec.

### Vérification du package publié

Ajouter une vérification séparée qui :

- construit le package `@craft-ts/dev-tools` ;
- l’exécute depuis un dossier vide avec
  `npx --package @craft-ts/dev-tools craft create ...` ;
- vérifie que le binaire `craft` est bien publié ;
- lance au moins `craft create --help` et une création non interactive.

Cela évite de réintroduire le problème où `npx craft` résout le paquet npm
sans rapport `craft@0.1.0` au lieu du package qui expose le binaire.

### Smoke des références locales

Ajouter un test contrôlé qui clone ou prépare un miroir local de chaque
référence, puis vérifie :

- résolution d’un tag et d’un SHA ;
- refus d’une version Effect non-v4 ;
- détection de changements locaux avant mise à jour ;
- reconstruction des packages en mode `local` ;
- réécriture stable des dépendances `file:` et du lockfile ;
- succès de `npm run update:references` deux fois de suite ;
- même comportement via les targets Nx.

Les tests réseau complets doivent être séparés du test unitaire et pouvoir être
désactivés en développement local, mais rester présents dans le job CI dédié.

## Gate de release obligatoire

Les tests de génération ne doivent pas être uniquement un job manuel ou un test
du package source. Ils doivent être exécutés avant chaque release, après que les
versions candidates des packages ont été préparées et avant toute publication
npm.

### Commandes de release

Ajouter un script dédié :

```text
generated-starters:check
generated-starters:release
```

`generated-starters:check` est le feedback loop rapide pour le développement.
`generated-starters:release` exécute la matrice complète avec les artefacts de
release.

Modifier `package.json` pour intégrer le gate dans la chaîne existante :

```text
release:preflight
  → typecheck/lint/architecture/docs/security/production
  → generated-starters:release

release:check
  → release:preflight
  → tools/release.test.mjs
  → tools/release-local.test.mjs
```

Le script doit rester un target explicite dans `release:preflight`, et
`tools/release.test.mjs` doit vérifier sa présence comme il vérifie déjà
`typecheck`, `lint`, `architecture` et `nx test docs`.

### Tester la version candidate, pas npm public

Avant publication, les versions candidates ne sont pas encore disponibles sur
npm public. Le gate doit donc :

1. recevoir `CRAFT_RELEASE_VERSION=<version>` ou un argument équivalent ;
2. préparer les manifests et builds des packages de la release ;
3. créer les tarballs candidats avec `npm pack` ;
4. publier ces tarballs dans le registre Verdaccio local déjà prévu par le
   workspace (`@craft-ts/source:local-registry`) sous un tag temporaire ;
5. créer chaque starter avec la version candidate dans toutes ses dépendances
   CraftTS ;
6. exécuter `npm install` dans le starter en pointant vers ce registre local ;
7. lancer les validations du starter ;
8. supprimer le registre et les répertoires temporaires à la fin du job.

Le renderer ne doit plus dépendre uniquement de la constante compilée
`CRAFT_TS_STARTER_VERSION` pour ce test. Ajouter une surcharge de version dans
la configuration interne du générateur, réservée au runner de release, ou un
resolver de version explicite. La génération normale conserve le comportement
du package publié.

Le runner doit vérifier que :

- les packages installés portent exactement la version candidate ;
- `@craft-ts/i18n-effect` et `@craft-ts/effect` utilisent la même release
  CraftTS que le reste du starter ;
- la plage `effect@^4.0.0-rc.110` et `@effect/tsgo` restent compatibles ;
- aucun starter ne résout accidentellement un ancien package depuis npm public ;
- le package qui expose le binaire est bien celui invoqué par le test.

### Périmètre de la matrice en release

À chaque `release:preflight`, exécuter :

- les 48 variantes runtime/template standalone ;
- les mêmes 48 configurations avec les dépendances de la release candidate ;
- un workspace Nx neuf avec le profil pédagogique complet ;
- un workspace Nx existant avec le profil minimal et le profil Effect ;
- le smoke de référence locale avec un miroir déterministe, sans cloner 64 fois
  les repositories externes.

Pour chaque starter candidate, le gate exécute au minimum :

```text
npm install
npm run typecheck
npm test
npm run architecture
npm run typecheck-architecture
npm run build
npm run e2e
```

Puis il ajoute les commandes conditionnelles :

```text
npm run i18n:check       # i18n
npm run i18n:test        # i18n
npm run effect-check     # Effect v4
npm run style:check      # typed CSS/design system
nx run <project>:<target> # variantes Nx
```

Le runner doit échouer au premier starter, mais imprimer la configuration
complète de la cellule, la version candidate, le registry utilisé et le chemin
du dossier temporaire conservé en cas d’échec.

### Ordonnancement avec `release-local`

Adapter `tools/release-local.mjs` pour transmettre explicitement la version
candidate au gate. Le scénario doit être :

```text
préparer la version candidate
→ npm run release:check avec CRAFT_RELEASE_VERSION
→ construire les packages candidats
→ exécuter le gate de génération contre le registre local
→ seulement ensuite publier/synchroniser les repositories externes
```

Si le processus actuel construit les packages après `release:check`, déplacer
le minimum nécessaire dans un helper de préparation de tarballs, sans publier
sur npm public. Le gate de génération reste obligatoire même si les tests de
release ont déjà passé sur les sources.

Ajouter une option de diagnostic locale, par exemple
`generated-starters:release --keep-fixtures`, mais ne jamais conserver par
défaut des `node_modules`, registries ou clones temporaires dans le workspace.

## Découpage d’implémentation

### Vague 1 — configuration et CLI

- [ ] Extraire `StarterConfig`, les types de feature et
  `normalizeCreateOptions()`.
- [ ] Ajouter le parsing des flags, alias et erreurs de combinaison.
- [ ] Ajouter les prompts interactifs et leurs tests.
- [ ] Faire retourner la configuration effective dans `CreateProjectResult` et
  `--json`.
- [ ] Conserver le profil par défaut rétrocompatible.
- [ ] Ajouter les options workspace, références, refs Git et mode de résolution
  local/context.

### Vague 2 — base et pages

- [ ] Réduire la base à trois routes/pages et rendre leurs textes/configuration
  indépendants d’i18n.
- [ ] Ajouter le service DI plain démontré par `/services`.
- [ ] Ajouter la surface optionnelle server function et sa facade client.
- [ ] Ajouter les tests unitaires et la preuve DI des trois routes.

### Vague 3 — i18n

- [ ] Rendre les dépendances, fichiers, scripts et tests i18n conditionnels.
- [ ] Générer `en-US` puis `fr-FR` avec le catalogue minimal.
- [ ] Afficher les traductions sur les trois pages et tester le changement de
  locale.
- [ ] Ajouter la voie `@craft-ts/i18n-effect` à chaque axe Effect qui en a
  besoin, sans contaminer l’autre axe.

### Vague 4 — Effect v4 cohérent

- [ ] Remplacer les APIs plain du frontend Effect par les adaptateurs dédiés.
- [ ] Ajouter un service frontend `Context.Service` et un `Layer` visible sur
  `/services` quand `frontendRuntime=effect`.
- [ ] Ajouter le backend Effect avec `Context.Service`, `Layer`, `Effect.gen`,
  `executeEffect` et une server function quand `backendRuntime=effect`.
- [ ] Vérifier le profil frontend plain + backend Effect sans import Effect dans
  `src/app`.
- [ ] Ajouter les assertions source et les `effect-check` générés par axe.
- [ ] Vérifier les traductions avec `translateEffect` dans chaque domaine Effect.

### Vague 5 — typed CSS et design system

- [ ] Rendre le plugin, l’import virtuel et les packages typed CSS conditionnels.
- [ ] Extraire le mini design system de l’exemple demo dans les templates.
- [ ] Ajouter les blocs Stack/Card/Button/Alert et leur page de composition.
- [ ] Ajouter la variante sans typed CSS sans import résiduel de `@craft-ts/style`.
- [ ] Ajouter les specs de style et le test de matrice minimal.

### Vague 6 — références locales et mise à jour

- [ ] Ajouter le manifeste de compatibilité CraftTS/EffectTS et le resolver de
  refs vers SHA.
- [ ] Implémenter la vendorisation complète dans `.references` avec vérification des
  hôtes, refs et changements locaux.
- [ ] Générer `.references/manifest.json`, les liens agents/MCP et les scripts
  `update:craft-ts`, `update:effect-ts`, `update:references`.
- [ ] Implémenter le mode `local` par artefacts buildés et dépendances `file:` ;
  refuser les aliases directs vers des sources TypeScript non buildées.
- [ ] Ajouter les tests de mise à jour idempotente et de refus d’un EffectTS
  incompatible.

### Vague 7 — Nx et validation exhaustive

- [ ] Ajouter le runner des 48 starters runtime/template valides.
- [ ] Générer un workspace Nx vide et intégrer un workspace Nx existant sans
  fichiers imbriqués.
- [ ] Ajouter les targets Nx et vérifier le cache/graph du projet.
- [ ] Ajouter le job CI shardé et le cache npm.
- [ ] Ajouter le job CI réseau dédié aux clones et aux mises à jour.
- [ ] Ajouter `generated-starters:check` et `generated-starters:release`.
- [ ] Brancher `generated-starters:release` dans `release:preflight` et ajouter
  l’assertion correspondante dans `tools/release.test.mjs`.
- [ ] Faire passer la version candidate et le registre local depuis
  `tools/release-local.mjs`.
- [ ] Publier les tarballs candidats dans Verdaccio et tester l’installation de
  chaque starter avant toute publication npm.
- [ ] Ajouter un test qui prouve qu’un package public d’une ancienne version ne
  peut pas masquer un package candidat manquant.
- [ ] Tester le package publié depuis un dossier vide.
- [ ] Mettre à jour `libs/dev-tools/README.md` et la documentation de référence
  avec les flags, le mode interactif et les quatre profils courants.
- [ ] Vérifier que `npm run typecheck`, les tests dev-tools et le smoke complet
  passent sans modifier les changements utilisateur déjà présents dans le
  workspace.

## Profils documentés à fournir

```bash
# Starter minimal plain
npx --package @craft-ts/dev-tools craft create my-app \
  --effect=none --i18n=none --design-system=none --no-typed-css

# Starter pédagogique complet
npx --package @craft-ts/dev-tools craft create my-app \
  --effect=none --i18n=strict --design-system=basic --typed-css

# Starter full-stack Effect + i18n
npx --package @craft-ts/dev-tools craft create my-app \
  --frontend-runtime=effect --backend-runtime=effect \
  --i18n=strict --design-system=basic --typed-css

# Frontend plain + server functions backend Effect
npx --package @craft-ts/dev-tools craft create my-app \
  --frontend-runtime=plain --backend-runtime=effect \
  --i18n=strict --design-system=basic --typed-css

# Starter avec contexte local CraftTS pour l’IA
npx --package @craft-ts/dev-tools craft create my-app \
  --references=craft-ts

# Starter Effect avec contexte local CraftTS + EffectTS pour l’IA
npx --package @craft-ts/dev-tools craft create my-app \
  --frontend-runtime=effect --backend-runtime=effect \
  --references=all

# Ajouter une application dans un workspace Nx existant
npx --package @craft-ts/dev-tools craft create apps/my-app \
  --workspace=nx --references=craft-ts

# Choix manuel
npx --package @craft-ts/dev-tools craft create my-app
```

## Critères d’acceptation

- Le mode interactif permet de choisir chaque feature sans éditer de fichier.
- Chaque combinaison de la matrice produit un projet cohérent et installable.
- Les options design system et typed CSS changent réellement le code, les
  imports, le build, les tests et la documentation générés ; elles ne sont pas
  de simples flags de dépendances.
- Les variantes désactivées ne contiennent aucun import, package, script ou
  test de la feature.
- Les trois pages démarrent et affichent le contenu attendu.
- Le profil i18n affiche `en-US` et `fr-FR`, avec parité stricte et pluriel.
- Le profil Effect n’utilise pas les primitives plain dans ses services,
  loaders ou dérivations.
- Le profil typed CSS n’utilise pas de classes dynamiques ni de CSS applicatif
  hors sheets typées.
- Les références activées sont clonées entièrement dans `.references`, avec un
  SHA enregistré et des liens locaux utilisables par les agents.
- Les scripts `update:*` ne remplacent jamais les dépendances npm par les
  clones et sont idempotents et sûrs face aux changements locaux.
- Le mode Nx fonctionne dans un workspace neuf comme dans un workspace
  existant, sans Nx ou lockfile imbriqué.
- `npm run release:preflight` exécute les tests de génération des starters.
- `release:check` refuse une release si une variante générée ne s’installe pas,
  ne compile pas, ne se build pas ou ne démarre pas avec les tarballs candidats.
- Les tests de release utilisent un registre local et ne dépendent pas d’une
  publication préalable sur npm public.
- Les 48 starters runtime/template passent le smoke CI et le package publié fonctionne depuis
  un dossier vide.
