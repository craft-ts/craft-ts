# Plan — remise en cohérence après les vagues style, Effect et i18n

Audit du 2026-08-25, sur `main` à `235a96b3`. Le `tsc -b` du workspace passe : rien
n'est cassé au sens strict. Ce plan traite des **trous de couverture** et des
**désalignements entre surfaces** accumulés depuis la dernière release
(`0.7.0-beta.13`, 2026-08-21).

## Objectif

Rendre publiable et découvrable ce qui a été construit depuis la dernière release :

- les quatre packages neufs (`style`, `style-testing`, `i18n`, `i18n-effect`)
  doivent partir en release sans casser le starter ;
- le système de style doit être **activable** par un lecteur de la doc — aujourd'hui
  le plugin de build qui l'exécute n'est mentionné nulle part ;
- l'i18n doit exister sur les surfaces de découverte (doc, référence, skills MCP),
  pas seulement dans les fichiers générés par `craft create` ;
- `craft create` doit produire un projet qui utilise le design system typé, pas un
  `styles.css` brut ;
- les garanties de typage annoncées par l'i18n doivent être prouvées par des tests.

## Décisions structurantes

### La release passe avant la doc

Les quatre packages sont versionnés `0.7.0-beta.13` mais absents du pipeline. Le
starter généré dépend de `@craft-ts/i18n@^0.7.0-beta.13`. Publier en l'état produit
un starter dont le `npm install` échoue. Rien d'autre dans ce plan n'a d'urgence
comparable.

### `tools/release.mjs` reste la source de vérité

`nx.json` (`release.projects`, 8 entrées) et `tools/release.mjs` (`releasePackages`,
11 entrées) divergent déjà aujourd'hui. On ne résout pas la divergence en dupliquant
la liste une troisième fois : `release.mjs` fait foi, et `nx.json` est aligné dessus
une fois pour toutes.

### Le style se documente par son activation, pas par son vocabulaire

Les 5 pages existantes décrivent bien le *pourquoi* de chaque mécanisme. Ce qui
manque n'est pas de la prose supplémentaire sur `when`/`set` : c'est la page qui dit
quoi installer, quel plugin brancher, et où `bp`, `scheme`, `palette` sont définis.
Sans elle, les pages actuelles ne sont pas exécutables.

### L'i18n obtient une page de guide, pas seulement un SKILL.md

Le plan i18n (`docs/plans/2026-08-23-type-safe-i18n.md`, section « Documentation et
règles agent ») ne scopait la doc qu'aux fichiers *générés*. C'était cohérent à
l'époque ; ça ne l'est plus : l'i18n est la seule feature du dépôt sans page de
guide, sans entrée de référence et sans mention dans les skills MCP.

### Les deux `cssVars` cohabitent, mais se citent

`meta.cssVars` (contrat de composant, `libs/component/src/lib/types.ts:594`) et
`cssVars(prefix, specs)` (`libs/style/src/lib/css-vars.ts:105`) sont deux mécaniques
différentes sous le même nom. On ne renomme rien — le coût de migration est réel et
les deux sont légitimes. On rend la distinction explicite dans les deux pages.

## État

| Vague                            | Tâches  | Bloque quoi                         |
| -------------------------------- | ------- | ----------------------------------- |
| 0 — packaging de release         | 1 → 6   | **la prochaine publication npm**    |
| 1 — rendre le style activable    | 7 → 13  | l'adoption du design system         |
| 2 — rendre l'i18n découvrable    | 14 → 20 | l'adoption de l'i18n                |
| 3 — preuves                      | 21 → 25 | la crédibilité des garanties typées |
| 4 — cohérence de surface         | 26 → 32 | rien, mais s'accumule               |

---

## Vague 0 — packaging de release

### Tâche 1 — ajouter les quatre packages à `releasePackages`

`tools/release.mjs:9`. Quatre entrées, sur le modèle de `craft-ts-effect` :

| key              | name                       | project                  | sourceManifest                    | distRoot                     |
| ---------------- | -------------------------- | ------------------------ | --------------------------------- | ---------------------------- |
| `style`          | `@craft-ts/style`          | `craft-ts-style`         | `libs/style/package.json`         | `dist/libs/style`            |
| `style_testing`  | `@craft-ts/style-testing`  | `craft-ts-style-testing` | `libs/style-testing/package.json` | `dist/libs/style-testing`    |
| `i18n`           | `@craft-ts/i18n`           | `craft-ts-i18n`          | `libs/i18n/package.json`          | `dist/libs/i18n`             |
| `i18n_effect`    | `@craft-ts/i18n-effect`    | `craft-ts-i18n-effect`   | `libs/i18n-effect/package.json`   | `dist/libs/i18n-effect`      |

Attention : `releaseTrackedFiles` est dérivé de `releasePackages`, donc les quatre
manifestes entrent automatiquement dans le commit de release. Vérifier que
`tools/release.test.mjs` passe toujours.

### Tâche 2 — renommer les projets nx `i18n` et `i18n-effect`

`libs/i18n/project.json` et `libs/i18n-effect/project.json` : `"name"` passe à
`craft-ts-i18n` et `craft-ts-i18n-effect`, comme les onze autres. Répercuter dans
tout appel `nx run` / `nx run-many --projects` qui les nomme.

À faire **avant** la tâche 1 si on veut que la colonne `project` du tableau soit
juste du premier coup.

### Tâche 3 — aligner `nx.json` sur `release.mjs`

`nx.json`, `release.projects` : la liste compte 8 entrées et en oublie 7
(`log-server`, `log-mcp`, `function-registry-mcp` déjà, plus les 4 neufs). Aligner
sur les 15 de `release.mjs`.

### Tâche 4 — donner `nx-release-publish` aux projets i18n

`libs/style/project.json` et `libs/style-testing/project.json` ont déjà la cible
(configurée pour rien tant que la tâche 3 n'est pas faite). `libs/i18n` et
`libs/i18n-effect` ne l'ont pas. Copier le bloc :

```json
"nx-release-publish": { "options": { "packageRoot": "dist/{projectRoot}" } }
```

### Tâche 5 — uniformiser le tsconfig de build

`libs/i18n` et `libs/i18n-effect` buildent sur `tsconfig.lib.prod.json` ;
`libs/style` et `libs/style-testing` sur `tsconfig.lib.json`. Choisir la convention
majoritaire du dépôt et aligner les quatre, sinon le prochain package neuf tirera à
pile ou face.

### Tâche 6 — corriger `RELEASING.md`

Le fichier parle de « five packages » et énumère cinq noms (`core`, `component`,
`effect`, `dev-tools`, `mcp`). Il y en a 11 aujourd'hui, 15 après la tâche 1. Les
sections concernées : l'intro, les étapes 1/2/6/10, la liste des droits npm, et le
bloc `npm view … dist-tags`.

**Critère de sortie de la vague 0** : `npm run release:check` passe, et un
`npm pack --dry-run` de chacun des quatre packages neufs produit un tarball.

---

## Vague 1 — rendre le système de style activable

### Tâche 7 — page « Activer @craft-ts/style »

Nouvelle page, `apps/docs/guide/style/setup.md`, insérée dans le sidebar
(`apps/docs/.vitepress/config.mts`, section « Components & templates ») **avant**
« Typed styles ». Elle doit couvrir, dans cet ordre :

1. `npm install @craft-ts/style` (+ `@craft-ts/style-testing` en devDependency) ;
2. le plugin Vite `craftStyle` de `@craft-ts/style/vite` — options réelles,
   dont `dumpPath` et `alias` ; référence de travail :
   `apps/demo/vite.config.ts:59` ;
3. ce que le plugin produit : le CSS émis **et** le dump que lisent le graphe de
   dépendances et les outils MCP ;
4. ce qui casse sans lui (aucun CSS, `style_matrix` sans dump).

C'est le trou le plus grave de l'audit : `craftStyle` et `@craft-ts/style/vite` ont
**zéro occurrence** dans toute la doc, alors que le message d'erreur du serveur MCP
(`packages/mcp/src/mcp-server.ts:246`) renvoie l'utilisateur vers
`craftStyle({ dumpPath })`.

### Tâche 8 — page « Définir son design system »

Nouvelle page, `apps/docs/guide/style/define.md`. `defineAxis`,
`defineBreakpoints`, `defineContainer`, `definePalette`, `defineStateAxis`,
`axisPoint`, `seal` : tous exportés, tous à **0 occurrence** dans `guide/style/`.

Aujourd'hui `tokens.md` et `variants.md` utilisent `bp`, `scheme`, `palette`, `v`,
`unit` sans jamais montrer d'où ils sortent — et la page qui s'appelle « Axes and the
matrix » ne montre pas `defineAxis`. Prendre `apps/demo/src/app/examples/design-system/foundation.style.ts`
comme référence.

### Tâche 9 — mettre des `import` dans les exemples style

`guide/style/tokens.md`, `variants.md`, `obligations.md` : aucun bloc de code n'a de
ligne d'import. Un lecteur ne peut pas savoir que `when`, `set`, `space`, `palette`,
`display` viennent tous de `@craft-ts/style`. À faire après la tâche 8 pour que les
identifiants importés existent quelque part.

### Tâche 10 — documenter les requêtes de graphe

`guide/style/testing.md`, section « What the graph adds » : les cinq fonctions
(`matrixSizeByComponent`, `impactedClasses`, `varsWrittenBy`, `danglingVars`,
`unproven`) existent bien dans `libs/dev-tools/src/scripts/style-architecture.ts` et
sont réexportées par l'entrée principale `@craft-ts/dev-tools` — mais le bloc n'a pas
d'import, donc rien ne le dit. Ajouter la ligne, et mentionner les trois outils MCP
correspondants (`style_impact`, `style_matrix`, `style_debt`).

### Tâche 11 — `craft create` installe et branche le style

`libs/dev-tools/src/scripts/create/create-project.ts` :

- `packageJson()` : `@craft-ts/style` en dependency, `@craft-ts/style-testing` en
  devDependency (lignes ~150-165) ;
- `viteConfig` : importer et brancher `craftStyle` ;
- un fichier `src/app/ui/*.style.ts` témoin, avec une palette, un axe d'état et une
  variable typée — assez pour que `no-raw-class` et `style-file-boundary` aient
  quelque chose à garder ;
- réduire `src/styles.css` à ce qui doit rester global.

Le starter active déjà `craftRules.configs.recommended`, qui met `no-raw-class`,
`no-free-has`, `no-raw-css-value` et `style-file-boundary` en `'error'`
(`libs/dev-tools/src/eslint-rules/recommended-config.cjs:22`). Ces règles sont gardées
sur l'import de `@craft-ts/style`, donc elles ne pètent pas aujourd'hui — mais un
projet neuf embarque la config d'un système qu'il n'installe pas, et n'obtient aucune
des garanties que la doc met en avant.

### Tâche 12 — section style dans `BASE_AGENT_SKILL`

Même fichier, la constante `BASE_AGENT_SKILL` (ligne ~31). Elle détaille l'i18n en
quatre lignes et ne dit **rien** du style. Ajouter un point : où vivent les sheets,
la règle statique→classe / dynamique→variable typée, et l'interdiction de construire
une classe au runtime.

### Tâche 13 — couvrir le style dans les skills MCP

`packages/mcp/skills/craft-ts/SKILL.md` : **0 occurrence** de `@craft-ts/style` ou
`craftStyles` dans les 7 skills, alors que le serveur MCP expose trois outils style.
Ajouter la section au skill `craft-ts`, ou créer `craft-ts-style` si le volume le
justifie.

Vérifier au passage que `packages/mcp/content/docs-index.json` (daté du 21/08, il ne
contient **aucune** des 5 pages `/guide/style/*`) se régénère bien : `bundle-docs`
tourne dans `npm run build` de `packages/mcp`, donc l'artefact commité est
simplement périmé — le régénérer et le commiter.

---

## Vague 2 — rendre l'i18n découvrable

Zéro occurrence de « i18n » dans tout `apps/docs` (md, mts, vue confondus).

### Tâche 14 — pages de guide i18n

Nouveau dossier `apps/docs/guide/i18n/` :

- `index.md` — le contrat : union fermée de clés, parité de locales, paramètres
  typés, pluriels par locale ;
- `catalog.md` — `defineCatalog`, `msg`, `plural`, `defineLocale`,
  `defineLocaleLike` ;
- `tokens.md` — les tokens sémantiques livrés (`number`, `money`, `dateLong`, …) et
  `defineToken` / `defineTokenFactory` pour les tokens projet ;
- `runtime.md` — `createI18nRuntime`, `t` / `translate`, `bind` (le traducteur
  réactif), `loadLocale` et `createI18nLoader` ;
- `effect.md` — `@craft-ts/i18n-effect` : `provideI18nRuntime`, `translateEffect`,
  `I18nEffectService`.

Référence de travail : `libs/i18n/src/lib/i18n.ts` et la démo routée
`apps/demo/src/app/examples/i18n/`.

### Tâche 15 — entrées de navigation

`apps/docs/.vitepress/config.mts` : section i18n dans le sidebar guide, et ajout de
`@craft-ts/i18n` au menu « Packages » de la nav (qui liste aujourd'hui 5 packages sur
15).

### Tâche 16 — section i18n dans la référence

`apps/docs/reference/index.md` : **0 occurrence** de style ou d'i18n. Ajouter deux
sections, sur le modèle des sections existantes (`## Primitives`, `## Tooling`, …).

### Tâche 17 — `@craft-ts/i18n-effect` dans le « Package map »

`apps/docs/guide/advanced/effect.md`, section « Package map » (ligne ~411). Le
tableau liste les packages Effect et oublie le seul qui soit neuf.

### Tâche 18 — les exemples dans `resources/examples.md`

`apps/docs/resources/examples.md` : 0 mention de l'i18n **et** 0 mention du
design system. Les deux démos existent et sont routées
(`apps/demo/src/app/examples/i18n/`, `apps/demo/src/app/examples/design-system/`,
cette dernière avec son README).

### Tâche 19 — couvrir l'i18n dans les skills MCP

Comme la tâche 13. Le `BASE_AGENT_SKILL` du starter parle déjà bien de l'i18n ; les
skills publiées de `@craft-ts/mcp` n'en disent rien. Les deux surfaces agent doivent
raconter la même chose.

### Tâche 20 — un exemple i18n-effect dans `demo-effect`

`@craft-ts/i18n-effect` n'est utilisé nulle part hors de son propre spec (15 lignes)
et du starter. Une route dans `apps/demo-effect` qui provisionne `i18nLayer` et
consomme `translateEffect` — c'est ce qui rendra la tâche 14 `effect.md` écrivable à
partir de code réel.

---

## Vague 3 — preuves

### Tâche 21 — tests de types négatifs pour l'i18n

`libs/i18n/src/lib/i18n.spec.ts` : **0** `@ts-expect-error`, et aucun usage de
`libs/test-type`. À comparer à `libs/style` (39) et `libs/core` (125).

Les critères d'acceptation du plan i18n
(`docs/plans/2026-08-23-type-safe-i18n.md`, « Critères d'acceptation ») ne sont
prouvés nulle part :

- une clé inconnue échoue au typecheck ;
- un paramètre de mauvais type échoue au typecheck ;
- une locale incomplète échoue au typecheck ou à `i18n:check` ;
- une catégorie de pluriel nécessaire ne peut pas être omise.

Quatre fixtures, sur le modèle de ce que fait `libs/style` avec `test-type`.

### Tâche 22 — étoffer `libs/i18n-effect`

15 lignes de spec pour un package publié. Au minimum : la parité entre
`translateEffect` et `runtime.t`, et le comportement quand la locale n'est pas
chargée (`I18nRuntimeError` `LOCALE_NOT_LOADED`).

### Tâche 23 — snippets compilés pour le style

`apps/docs/tests/snippets/` couvre `guide/{advanced,ai,app,components,reactivity,routing,state,testing}`.
Pas de `guide/style`. Les pages écrites en vague 1 doivent passer par
`<<< @/tests/snippets/guide/style/...` comme le reste de la doc — sinon les deux API
les plus récentes restent les seules dont la doc ne peut pas dériver.

### Tâche 24 — snippets compilés pour l'i18n

Idem pour `guide/i18n/`.

### Tâche 25 — fermer la moitié visuelle du niveau 3

`typed-style-system-plan.md:20` porte encore « **faite** (moitié visuelle non
vérifiée) » pour la vague 3. Soit on vérifie le témoin
(`apps/demo/src/app/examples/design-system/scroll.ts` + son e2e), soit on inscrit
l'écart comme dette assumée avec sa raison — mais on ne laisse pas la ligne dans cet
état dans un plan marqué terminé.

---

## Vague 4 — cohérence de surface

### Tâche 26 — trancher le sort des 4 pages orphelines

Présentes sur disque, absentes du sidebar et de la nav :

- `apps/docs/guide/components/css-variables.md` — c'est la page de l'**ancien**
  `cssVars` ; l'entrée « Tokens and variables » du sidebar pointe désormais vers
  `/guide/style/tokens` ;
- `apps/docs/guide/components/schedule-for.md` ;
- `apps/docs/guide/testing/architecture/route-component-files.md` ;
- `apps/docs/guide/migration/wave-1-tag-and-provided-in.md`.

Pour chacune : réintégrer au sidebar, ou supprimer. Les laisser publiées mais
inatteignables est le pire des trois.

### Tâche 27 — désambiguïser les deux `cssVars` et les deux récits de style

`meta.cssVars` sur `craftComponent` et `cssVars(prefix, specs)` de `@craft-ts/style`
portent le même nom pour deux mécaniques différentes. De même,
`guide/components/styles.md` (`meta.styles` en chaîne, `@scope`) et `guide/style/*`
(typé, émis au build) racontent deux histoires qui ne se citent pas.

Ajouter en tête de chaque page un encart « lequel choisir », avec le lien croisé.
Pas de renommage : le coût de migration est réel et les deux API sont légitimes.

### Tâche 28 — sous-section `computedEffect`

`apps/docs/guide/advanced/effect.md`, section « Choose the right adapter » : elle a
un `###` pour `queryEffect`, `mutationEffect`, `asyncProcessEffect` et `runEffect`,
mais pas pour `computedEffect` — qui est pourtant bien présent dans la table de
décision (ligne 30) depuis `0aded2d3`.

### Tâche 29 — documenter les exports Effect orphelins

`composeEffect`, `runYieldedEffect`, `assertNoRequirements`, `CRAFT_EFFECT_LEVEL`,
`resolveEffectLevel`, `AsEffect` : exportés par `libs/effect/src/index.ts`, 0
occurrence dans la doc. Soit une ligne dans la référence, soit les sortir de l'API
publique.

(`installCraftSyncEffectBridge` est le cas légitime : `installCraftEffectBridge`
l'installe déjà — `libs/effect/src/lib/run-effect.ts:106`. Une note suffit.)

### Tâche 30 — documenter les règles ESLint neuves

29 règles sur 95 ne sont documentées nulle part dans `apps/docs/guide` ni
`apps/docs/reference`. Traiter au moins celles introduites par les vagues récentes :
`no-free-has`, `style-file-boundary`, `craft-css-token-registry`, `no-raw-css-value`,
`require-effect-adapters`, `craft-signal-source-name-match`.

Cas à part : `no-raw-class` est **cité** dans `guide/style/variants.md` mais absent
de la page de référence des règles — un lecteur qui la cherche ne la trouve pas.

### Tâche 31 — remettre une CI

`.github/workflows/` n'existe plus : `ci.yml` supprimé en `6371642c`,
`production-readiness.yml` en `c86228cc`. Il ne reste que des fichiers
d'instructions. `npm run release:preflight` existe mais ne tourne que si quelqu'un
le lance à la main.

Ironie utile : `craft create` génère un `.github/workflows/ci.yml` complet
(lint, typecheck, `i18n:check`, `i18n:test`, architecture) pour les projets créés.
Le dépôt peut partir de ce template.

À trancher explicitement : si la suppression était volontaire (durée, coût), écrire
la décision quelque part plutôt que de laisser l'absence se lire comme un oubli.

### Tâche 32 — remettre `README.md` à jour

`README.md:126-135` décrit un `libs/` de 4 entrées (il y en a 12 : `cli`,
`component`, `core`, `deploy`, `deploy-alchemy`, `dev-tools`, `effect`, `i18n`,
`i18n-effect`, `style`, `style-testing`, `test-type`) et un `apps/` qui en oublie
trois (`demo-ssr`, `demo-with-server-function`, `log-server`). La ligne 267 énumère
cinq packages releasés.

Zéro occurrence de « i18n », « design system » ou « typed style » dans tout le
README — la vitrine du dépôt ignore les deux chantiers du mois.

---

## Critères d'acceptation

- `npm run release:check` passe, et les quatre packages neufs produisent un tarball.
- Un `craft create` suivi de `npm install` réussit contre le registre public.
- Un projet créé par `craft create` contient au moins une sheet `@craft-ts/style` et
  un `craftStyle` branché dans son `vite.config.ts`.
- Un lecteur qui suit `guide/style/setup.md` de bout en bout obtient du CSS émis et
  un dump lisible par `style_matrix`.
- `grep -ri i18n apps/docs` retourne des résultats.
- Une clé de traduction inconnue, un paramètre mal typé, une locale incomplète et une
  catégorie de pluriel manquante échouent chacun dans un test dédié.
- `nx test docs` couvre les snippets style et i18n.
- Aucune page `.md` de `apps/docs` n'est absente du sidebar sans décision écrite.

## Hors périmètre

- Renommer `cssVars` d'un côté ou de l'autre.
- Fusionner `guide/components/styles.md` et `guide/style/*` en un seul récit.
- La vague 5 du plan style (réduction de matrice) : elle reste fermée sur ses
  mesures — médiane 1, maximum 18, seuil 24.
- La phase 5 du plan i18n (harness typographique, screenshots multilingues,
  SSR/hydratation multilingue) : c'est un chantier à part, pas une remise en
  cohérence.
- Traduire la documentation elle-même en plusieurs langues.
