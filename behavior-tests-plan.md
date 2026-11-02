# Plan : contraindre des tests de comportement

> Statut (2026-11-02) : lots 1 et 2 faits et commités ; lot 3 : mutants des
> tests unitaires (P4) et vue Couverture (P6) faits ; mutants e2e et CI à
> faire.

## Objectif

Obliger le système (humains et agents) à écrire des tests qui prouvent les
**comportements recherchés**, pas l'implémentation : des tests qui survivent aux
refactorisations et qui échouent quand un comportement casse. Pas un test par
fonction.

## Principe

**Les obligations viennent du graphe, les preuves viennent des traces.**

On ne peut pas décider de façon déterministe qu'un test est « intéressant ». On
vérifie trois conditions nécessaires, chacune déterministe :

1. **Exercé** : le comportement apparaît dans la trace d'un test vert.
2. **Observé** : après le déclencheur, le test vérifie un résultat sur une
   surface publique (DOM par rôle/texte, membres exposés d'un service), pas des
   appels à des mocks.
3. **Discriminant** : si on casse le comportement, au moins un test échoue.

## Briques existantes réutilisées

| Brique | Où | Rôle dans le plan |
|---|---|---|
| Graphe d'architecture (routes, mutations, `craftMethod`, HTTP + exceptions typées, machines, guards, server functions) | `libs/dev-tools/src/scripts/architecture-graph.ts` | Source des obligations (P1) |
| Catalogue généré + hash du graphe | `apps/*/architecture/catalog.ts` | Modèle pour le catalogue de comportements |
| Obligations calculées depuis le graphe | `visualHappyPath` (happy path par page, scénario par exception HTTP), `routeDiProofViolations` | Précédent : même forme de règle, mais preuve déclarée/typée, pas exécutée |
| Waivers raisonnés | `apps/*/architecture/waivers.ts` | Échappatoire pour l'existant (P5) |
| Contrat `craftSession({ id })` + historique `keep` + plafonds en octets | `libs/playwright-sessions` | Traces e2e et leurs limites (P2) |
| Événements de trace (`primitive`, `invocation`, `exception`, `route`, `http`, `interaction`) | `packages/session-trace` | Matière des empreintes de couverture (P2) |
| Point d'override runtime | `SERVICE_RUNTIME_OVERRIDES`, `registry_override` | Injection des mutants (P4), forçage d'exceptions (P6) |
| Export de recette, reprise guidée | `recipe_exportPlaywright`, skill `craft-ts-guided-resume` | Squelettes d'e2e depuis une vraie session (P6) |

## Décisions clarifiées

### Déterminisme du catalogue (P1)

- La génération est déterministe : analyse statique, mêmes sources + même
  `tsconfig` + même version de TypeScript → même catalogue, même hash.
  Vérification « catalogue à jour » en CI comme pour `catalog.ts`.
- Sortie **triée**.
- Ce que le graphe ne sait pas lire (URL dynamique, exception non inférable) ne
  se devine pas : la génération **échoue** tant qu'un contrat explicite n'est
  pas déclaré (même mécanisme que `unresolved-http` / `httpContracts`).
- Déterministe ≠ exhaustif : le catalogue ne voit que les comportements
  exprimés par les primitives craft. Les règles métier dans des fonctions pures
  ou des `computed`, le DOM manipulé à la main ou les librairies tierces passent
  par un **marquage explicite** (vérifiable, mais pas automatique).
- **Identifiants construits sur des noms**, jamais sur un chemin ou une ligne :
  un déplacement de code ne change rien ; un renommage change l'identifiant, et
  c'est voulu (changement de contrat visible dans le diff).
- Granularité : **ce qu'un utilisateur peut déclencher × chaque issue typée**.
  Les `computed` et le code interne ne sont pas des obligations.

| Proposition | Déterministe ? |
|---|---|
| P1 catalogue | Oui |
| P3 règles de frontières | Oui |
| P5 cliquet | Oui |
| P2 preuve par la trace | Seulement si les tests le sont |
| P4 mutants | Oui à tests égaux, coûteux |

### Cliquet par obligation, pas par taux (P5)

Un taux global punit la suppression d'une feature bien testée et se contourne
en compensant ailleurs. On compare `main` et la PR **obligation par
obligation** :

| Cas | Règle |
|---|---|
| Obligation supprimée (feature retirée) | Toujours autorisé |
| Obligation ajoutée | Prouvée dans la PR, ou waiver avec raison |
| Obligation présente, prouvée sur `main`, plus prouvée dans la PR | **Bloquant** |
| Obligation présente, non prouvée sur `main` | Toléré, reste dans le rapport |

- Le taux reste un indicateur du rapport, jamais bloquant.
- Waiver qui vise une obligation disparue → **échec** (waiver périmé).
- Test dont l'empreinte ne contient plus que des obligations supprimées →
  **avertissement** « test orphelin ».
- Renommage = supprimée + ajoutée ; si le même test couvre la nouvelle, rien
  ne bloque.

Formulation retenue : **aucune obligation existante ne perd sa preuve, et toute
obligation nouvelle arrive avec la sienne.**

### Stockage des traces (P2, P4)

Constat : 3 sessions e2e de `demo-ecommerce`, 6 à 9 Ko compressées chacune,
versionnées dans git, plafonds 100 Ko/session et 300 Ko/test. Le risque n'est
pas la taille du dossier de travail mais l'**historique git** (chaque référence
réécrite reste à vie) et l'extension aux tests de service/template.

On sépare :

| | Trace complète | Empreinte de couverture |
|---|---|---|
| Contenu | Événements, DOM, HTTP, timings | Identifiants d'obligations touchées + hashes |
| Sert à | Rejeu, debug, « Reprendre ici », comparaison | P2, P4 |
| Taille | ~10 Ko/test | quelques centaines d'octets/test |
| Produite par | e2e seulement | tous les tests |

- Tests de service et de template : **empreinte seulement**, jamais de trace
  complète.
- Mutants : on ne stocke que le résultat
  `(obligation, hash, tué/survivant, test tueur)`.
- L'index des empreintes est une donnée dérivée : **pas dans git**, en cache ou
  artefact de CI de `main` ; une PR récupère celui de `main` et recalcule ce
  qu'elle touche.

### Déclenchement des mutants (P4)

Deux leviers :

- Ne relancer que les tests dont l'empreinte contient l'obligation, arrêt au
  premier échec.
- Cache par `hash(code atteint par l'obligation) + hash(tests couvrants)`.

| Moment | Ce qu'on lance | Bloquant ? |
|---|---|---|
| En local | Rien d'automatique ; commande à la demande `craft mutants --changed` | Non |
| PR | Mutants des obligations nouvelles ou modifiées, tests de service/template seulement, budget ≈ 5 min | Oui, pour le neuf seulement |
| Nuit sur `main` | Tout ce qui n'est pas en cache, e2e compris ; survivants dans le rapport | Non |

Garde-fous contre les e2e instables : jouer d'abord la version saine (verte
sinon on ne conclut rien) ; ne compter comme tué qu'un échec d'assertion situé
**après** l'événement de l'obligation dans la trace.

Démarrage : quelques semaines de passage de nuit **non bloquant** pour mesurer
le taux de survie et le temps réel, avant de rendre la PR bloquante.

### Obligations non couvertes (P6)

Elles sont **calculées**, pas devinées :

```
non couvertes = catalogue (P1)
              − union des empreintes des tests verts (P2)
              − obligations sous waiver
```

Pour proposer une session à transformer en test, on cherche dans les sessions
enregistrées (log-server) un événement qui porte l'identifiant de l'obligation.
C'est une recherche exacte **à condition** que le runtime et le catalogue
partagent les mêmes identifiants (aujourd'hui le graphe et le registre
adressable nomment chacun de leur côté).

## Lots

### Lot 1 — Statique, sans dépendance aux tests ✅ (terminé 2026-11-02)

Code : `libs/dev-tools/src/scripts/behavior-catalog.ts` (+ spec), exporté par
`@craft-ts/dev-tools` et `@craft-ts/dev-tools/behavior-catalog`.

**P1. Catalogue de comportements**

- [x] Schéma d'identifiants par noms, sources d'obligations réellement
  retenues :
  - `route:<collection>:<chemin>` (route avec composant)
  - `guard:<collection>:<chemin>.<canActivate|canMatch|…>`
  - `method:<propriétaire>.<nom>` (`craftMethod`)
  - `mutation:<propriétaire>.<nom>#success`
  - `command:<propriétaire>.<nom>#success` : une `query` appelée par sa
    `method` (`adminAction`, `placeOrderProcess`) ; le graphe la marque
    désormais (`triggeredByMethod`, `dependency-graph.ts`)
  - `async-process:<propriétaire>.<nom>#success`
  - `state-machine:<propriétaire>.<nom>`
  - `server-function:<id>`
  - `http-exception:<METHOD> <url>#<discriminant>`
  - `declared:<id>` (option `declared`, avec raison)
- [x] `apps/<app>/architecture/behaviors.catalog.ts`, trié, vérifié par
  `toMatchFileSnapshot` : en CI un catalogue périmé échoue, `vitest -u` le
  réécrit.
- [x] Échec de génération sur un appel HTTP illisible tant que `httpContracts`
  ne le nomme pas. Clé par nom (`fichier#primitive`), pas par ligne, pour
  qu'une édition au-dessus de l'appel ne casse pas le contrat.
- [x] Marquage explicite : option `declared` de la suite d'architecture.
- [x] Branché dans `demo-ecommerce` (34 obligations) et
  `debug-session-dashboard` (21 obligations).
- [x] Autres apps branchées dans leur suite d'architecture (2026-11-02) :
  `demo` (81), `demo-effect` (15), `demo-ssr` (7), `quickstart-effect` (1),
  `demo-with-server-function` (23), attestation-app (64). Catalogue, cliquet
  et fichier de couverture ; pas encore de preuves (ni index unitaire ni
  références e2e lues), donc tout y est non prouvé jusqu'au premier test.
  Les tests de gabarit des exemples de `demo` donnent une vue fabriquée :
  c'est l'usage du helper, la règle des frontières les accepte (voir P3).
- Non retenu pour l'instant : les méthodes exposées des `state`
  (`select`, `close`…), trop proches de simples setters ; les transitions
  une par une des machines à états (le graphe ne les expose pas).

**P3. Tester par les frontières**

- [x] Règle `behavior-test-mocks-boundaries` (suite d'architecture) : dans les
  maps `register` des helpers de service, un mock n'est accepté que pour un service
  frontière (HTTP ou server function, directement ou par une primitive ;
  `browserBoundary` ; code hors de l'app). Une chaîne (`'notReached'`) ou un
  `provideX()` garde le vrai service. Waiver `<spec>:<clé>`.
  Les helpers de gabarit (`setupCraftComponentTemplateTest`,
  `setupCraftDirectiveTemplateTest`) ne sont pas contrôlés, choix de
  l'utilisateur du 2026-11-02 : ils rendent un gabarit à partir de la vue
  qu'on leur donne, une vue fabriquée y est l'usage, pas un contournement.
  Contrepartie assumée : un test de gabarit peut mocker sa vue sans waiver.
- [x] Pas d'accès à un membre `craftPrivate` dans un test : déjà garanti,
  sans règle. Un tel membre vit dans le générateur du service (rien à
  importer), `sut` ne le type pas et ne le porte pas à l'exécution. Figé par
  un test de `setup-craft-service-testing-by-register.spec.ts`.
- [x] Règle ESLint `craft-ts/no-spy-on-system-under-test` (dans
  `recommended`) : pas de `toHaveBeenCalled*` ni de `spyOn` sur le `sut` ; les
  appels aux mocks de frontière restent permis.
- [x] Règle ESLint `craft-ts/e2e-user-facing-locators` (dans `configs.e2e`) :
  pas de sélecteur de classe ou d'id. `demo-ecommerce` corrigé : rôles
  `list`/`listitem` sur la liste des produits de l'admin, e2e `admin` vérifié.
- [x] `debug-session-dashboard` et `review-attestation` corrigés : rôles,
  libellés et textes ; la mécanique du replay (cadre, viewport, marqueur de
  clic) par son `data-lab`. Règle seule branchée (pas `e2e-session-contract` :
  ces e2e n'enregistrent pas de session) ; le lint de la lib couvre désormais
  `libs/review-attestation/e2e`. Une exception commentée :
  `#craft-replay-frame`, l'id étant le contrat testé. Assertion creuse
  trouvée : `.folder-layout-view` n'existait plus, remplacée par
  `[data-folder-layout="view"]`. Non couvert par la règle : `frameLocator`.
  Toute la suite `review-replay` est rouge sur HEAD (le cadre rejoué ne
  s'affiche pas) : ses localisateurs n'ont pas pu être exécutés.

**P5. Cliquet**

- [x] Diff `main` ↔ PR : catalogue lu au merge-base (`main`, puis
  `origin/main`, ou `CRAFT_BEHAVIOR_BASE`).
- [x] Waivers `architecture/behavior-waivers.ts` typés sur le catalogue ;
  raison vide, obligation disparue ou (lot 2) prouvée → échec.
- [x] Obligation nouvelle sans preuve ni waiver → échec ; supprimée → permis.
- Le cliquet ne s'active qu'une fois `behaviors.catalog.ts` présent sur
  `main` : avant le merge, il n'y a pas de base et il ne bloque rien.

### Lot 2 — Preuve par la trace ✅ (terminé 2026-11-02)

Code : `libs/dev-tools/src/scripts/behavior-proofs.ts` (trace → obligations),
`libs/playwright-sessions/src/reference-traces.ts` (références e2e, maintenant
et au merge-base), `libs/core/src/lib/behavior-proof-recorder.ts` +
`libs/core/src/behavior-proofs.vitest-setup.ts` (enregistrement pendant un
test vitest), `libs/dev-tools/src/scripts/behavior-proof-index.ts` (reporter
vitest et lecture de l'index).

**P2. Empreintes de couverture**

- [x] Correspondance trace → obligations **par nom**, sans changer le
  runtime : `service:session / query:signInProcess` prouve
  `…:session.signInProcess#…` quel que soit le type de primitive ;
  `server-fn:<id>` ok → `server-function:<id>` ; `route-activation:<chemin>`
  → la route de ce chemin ; exception d'une invocation → la
  `http-exception` de ce discriminant. Deux candidats possibles → aucune
  preuve (jamais deviné).
- [x] Le runtime nomme chaque invocation comme le catalogue (2026-11-02) :
  `ɵbehaviorTarget` de `core` (`service:cart / state:lines / method:add` →
  `cart.add`) est la seule définition. L'enregistreur des tests et celui des
  sessions l'écrivent (`detail.behavior`, `payload.behavior`) ;
  `session-trace` la recopie dans l'étape ; dev-tools et le log-server la
  lisent telle quelle. Seul repli : `session-trace` la recalcule pour une
  session enregistrée avant (les références e2e versionnées). Le préfixe de
  sorte (`method:`, `command:`…) reste au graphe, qui seul la connaît.
  Vérifié : demo-ecommerce toujours 22/34, et une session réelle porte
  `cart.add`, `storefrontView.storeQuery`.
- [x] Tests de service et de template : un `provideFnWrapper` de `core`
  note, pendant chaque test, chaque invocation réglée (adresse de l'hôte,
  issue, exception) une seule fois ; c'est l'empreinte, au même format
  qu'une étape de trace e2e. `ɵregisterCraftTestProviders` la fait recevoir
  par les quatre racines de test (`setupCraftServiceTest`,
  `setupCraftServiceTestingByRegister`, `CraftTestBed`, helpers de
  composant). Une exception rendue comme **valeur** (server function, loader
  typé) compte comme un échec, pas comme un succès.
- [x] Branchement vitest : `setupFiles` (setup de `core`, range l'empreinte
  dans `task.meta`) + `reporters: ['default', behaviorProofReporter({ rootDir })]`
  (`dev-tools`, Node pur). Seuls les tests **verts** entrent dans
  `.craft/behavior-proofs.json` (hors git), clé `<fichier> > <nom complet>` ;
  un lancement partiel ne réécrit que les fichiers lancés ; un fichier de test
  supprimé sort de l'index à la lecture.
- [x] `demo-ecommerce` : `architecture` dépend de `test` (nx), l'index est une
  sortie de `test`. Premier test de service (`cart-logs-state.spec.ts`) :
  15 obligations sur 34 prouvées (12 par les e2e).
- [x] Preuves unitaires comparées à la base (2026-11-02) :
  `readBehaviorProofIndexAtBase` lit l'index que le dernier passage sur
  `main` a publié (`CRAFT_BEHAVIOR_BASE_PROOFS`, sinon
  `.craft/behavior-proofs.base.json`) et le garde entier, fichiers de test
  supprimés compris. Sans ce fichier (en local) rien n'est comparé, comme
  avant. Vérifié sur demo-ecommerce : un test unitaire disparu qui prouvait
  `session.signOutProcess` sur la base fait échouer le cliquet. La
  publication de l'index par la CI est dans P4 (passage CI).
- [x] Extraction depuis les références e2e déjà versionnées
  (`e2e/__sessions__`) : aucun stockage en plus. `demo-ecommerce` : 12
  obligations sur 34 prouvées par ses 3 tests.
- [x] Index : pas de fichier ; recalculé depuis les références, et au
  merge-base depuis git (`git show`).
- [x] Cliquet complet : obligation prouvée sur la base, toujours là, plus
  prouvée → bloquant (waivable avec raison). Couverture affichée, jamais
  imposée.
- [x] Vérification « observé » : une étape ne prouve que si une assertion
  réussie vient après elle. Le contrôle est faible exprès : il attrape le
  test sans assertion et le travail qui suit la dernière, pas une assertion
  qui regarde autre chose (c'est le rôle des mutants, lot 3).
  - vitest : le compteur `expect.getState().assertionCalls` au moment où
    chaque étape se règle. vitest compte à `expect(…)`, avant le matcher :
    un appel fait par le matcher lui-même (`expect(() => f()).toThrow()`)
    n'a pas d'assertion après lui. Les exceptions Craft sont des valeurs
    (`expect(craftUse(…))`), donc pas concernées.
  - e2e : `expect` de `@craft-ts/playwright-sessions` (réexporté par les
    fixtures) note l'heure de la dernière assertion réussie ;
    `lastAssertionAt` est rangé dans le run de `history.json` (`null` :
    aucune, avec un avertissement) et le nombre d'étapes observées est
    recalculé à la lecture, pour qu'un nouveau normaliseur ne le rende
    jamais faux. Une référence d'avant le contrôle compte toutes ses étapes.
  - Premier effet : `shop.checkout` finissait par `waitFor()`, sans aucune
    assertion ; il vérifie maintenant la confirmation.
- [x] Avertissement test orphelin.

- [x] `admin.edit-product` ne montrait ni `adminAction` ni
  `ecommerce.product.save` : bug du normaliseur de `@craft-ts/session-trace`.
  Une page rechargée (`page.goto`) garde son participant mais renumérote ses
  opérations depuis 1, et les opérations étaient regroupées par id seul : la
  seconde page perdait les siennes. Une opération est maintenant
  participant × chargement de page × id. Références `admin.edit-product`,
  `admin.multicontext` et `shop.checkout` réenregistrées ; `demo-ecommerce`
  passe à 22 obligations prouvées sur 34. `guided-resume` ne garde aucune référence
  (`capture: 'none'`) : il ne prouve rien. Son e2e échouait sur le
  dashboard (alias `@craft-ts/i18n`, `source$` hors contexte d'injection…),
  réparé dans `6a674c5bd` puis fusionné ; il repasse.

- [x] L'enregistreur e2e (`send-context-to-ai.ts`) comptait comme réussie une
  invocation qui rend une exception Craft en valeur (une preuve `#success`
  pouvait venir d'un échec) : elle est maintenant `failed`, avec son `_tag`,
  comme dans l'enregistreur de test. Les références e2e enregistrées avant
  ce correctif gardent l'ancienne issue jusqu'à leur prochain
  réenregistrement.

Fini quand : retirer le test qui couvre une obligation fait échouer la PR
(fait pour les e2e, pas encore pour les tests unitaires), et une exception
HTTP prouvée par un test de service suffit (fait : l'exception est notée avec
son discriminant).

### Lot 3 — Discrimination, puis aide ✅ (terminé 2026-11-02)

**P4. Mutants sémantiques**

Code : `libs/core/src/lib/behavior-mutant.ts` (le mutant, un
`provideFnWrapper`), le setup vitest de `core` (le lit dans
`CRAFT_BEHAVIOR_MUTANT`), `libs/dev-tools/src/scripts/behavior-mutants.ts`
(plan, exécution, cache), commande `craft mutants`.

- [x] Un mutant par obligation, appliqué au runtime **à l'étape qui la
  prouve** (clé d'invocation de l'empreinte), sans toucher au code :
  - `skip` pour `method`, `mutation`, `command`, `async-process`,
    `state-machine` : l'invocation ne fait rien et ne rend rien ;
  - `succeed` pour `http-exception` : l'exception (valeur Craft ou throw)
    devient un succès vide.
  Le point d'override retenu est le `FN_WRAPPER` de l'enregistreur, pas
  `SERVICE_RUNTIME_OVERRIDES` : il voit déjà chaque invocation sous la même
  adresse que l'empreinte. Une transition de machine ou un `reactOn` coupé
  un par un restent à faire (le graphe ne les expose pas).
- [x] Sélection des tests par empreinte : seuls les tests dont l'empreinte
  prouve l'obligation tournent (les autres sont `skip` par le setup), arrêt
  au premier échec (`--bail=1`).
- [x] Cache `.craft/behavior-mutants.json` (hors git), par obligation :
  hash du mutant, de ses tests et des sources de l'app (`src`, tests
  compris). Une app inchangée ne relance rien.
- [x] Garde-fous : les tests tournent d'abord sans mutant (rouge → rien
  n'est conclu) ; un mutant qu'aucun test n'a atteint (index périmé) est
  « non atteint », ni tué ni survivant. Le reporter n'écrit pas l'index
  pendant un passage de mutants.
- [x] Commande `craft mutants [--root] [--config] [--changed] [--json]`,
  sortie 1 sur un survivant ; `--changed` = obligations nouvelles depuis le
  catalogue de base, déclarées dans un fichier modifié ou prouvées par un
  test modifié (toutes, sans base). Cible nx `demo-ecommerce:mutants`
  (dépend de `test`).
- [x] `demo-ecommerce` : 4 mutants, 4 tués, ~8 s. Vérifié à la main qu'un
  test creux (`toBeGreaterThanOrEqual(0)` après `emptyCart`) laisse
  survivre son mutant.
- [x] Mutants e2e (2026-11-02), `craft mutants --e2e` (cible nx
  `demo-ecommerce:mutants-e2e`) : plan tiré des références versionnées
  (groupées par projet Playwright et id `craftSession`), une passe
  Playwright par mutant. La fixture de `playwright-sessions` lit
  `CRAFT_BEHAVIOR_MUTANT`, saute les tests qui ne prouvent pas l'obligation,
  pose le mutant dans chaque contexte (script d'init) ; la page l'applique
  via `provideCraftDevTools` (`ɵprovidePageBehaviorMutant`, inerte sinon) et
  appelle une binding exposée, qui survit aux navigations. « Tué » = échec
  après que le mutant a agi ; jamais atteint = « non atteint ». Capture en
  mode `compare` : un test peut lire sa session, aucune passe mutée ne
  devient référence. Cache `.craft/behavior-mutants.e2e.json` ; la
  couverture fusionne les deux caches, le pire verdict l'emporte.
  Le cache e2e hache `src` et `e2e` : un test e2e modifié relance son
  mutant. demo-ecommerce : 5 mutants en ~6 min, tous tués. Le survivant du
  premier passage (`mutation:cart.syncServerCart#success` : le panier
  serveur n'apparaît nulle part dans la boutique, `shop.checkout` passait
  sans lui) est tué depuis que le test vérifie le panier serveur dans le
  magasin du run, seule frontière où la synchronisation se voit.
- [x] Passage CI (2026-11-02, accord de l'utilisateur pour réintroduire un
  workflow) : `.github/workflows/behaviors.yml`. Sur PR et push sur `main` :
  `nx run-many -t architecture` (cliquet de toutes les apps). Sur PR,
  l'index unitaire du dernier passage vert de `main` est téléchargé
  (`gh run download`, artefact `behavior-proofs-main`) et
  `demo-ecommerce:mutants -- --changed` bloque sur un survivant. Sur push
  sur `main`, l'index est publié. La nuit (et à la demande) : tous les
  mutants, unitaires puis e2e, sans bloquer, verdicts gardés en artefact.
  Non vérifié sur GitHub (rien n'est poussé) : à surveiller au premier
  passage, en particulier `npm ci` (lock retouché à la main).

**P6. Combler les trous**

Code : `libs/dev-tools/src/scripts/behavior-coverage.ts` (le rapport),
`apps/log-server/src/behavior-coverage.ts` (`GET /sessions/behavior-coverage`),
page `apps/debug-session-dashboard/src/features/coverage`.

- [x] Rapport `.craft/behavior-coverage.json` (hors git), écrit par la suite
  d'architecture de chaque app : chaque obligation avec son statut (prouvée,
  excusée, non prouvée), les tests qui la prouvent, la raison du waiver, le
  verdict du mutant, et **comment une session la montre** (descripteur
  `BehaviorStepMatch`, calculé par dev-tools pour que le serveur n'ait pas à
  relire le catalogue).
- [x] Le log-server (`CRAFT_BEHAVIOR_APPS`, dossiers d'apps) cherche chaque
  obligation non prouvée dans les sessions qu'il garde, normalisées comme les
  références e2e (cache par session et `updatedAt`) : les 3 dernières
  sessions qui la montrent, et l'événement où elle commence. 0,65 s pour 122
  sessions au premier appel.
- [x] Page « Couverture » du dashboard (barre de navigation), six sections
  dans l'ordre de ce qu'il y a à faire :

| Section | Action proposée |
|---|---|
| Preuves creuses (mutant survivant) | Revoir l'assertion du test |
| Vus dans une session, sans test | « Ouvrir la session » à l'événement (`#/sessions/:id?event=`, le replay s'y place une fois prêt), puis « Reprendre ici » : l'IA en tire l'e2e |
| Jamais vus · chemin heureux | Reprise guidée pour l'atteindre, ou suppression |
| Jamais vus · exception | Test de service avec mock à la frontière |
| Excusés | Raison du waiver |
| Prouvés | Tests et verdict du mutant |

- [x] Vérifié dans le navigateur sur les vraies sessions : `demo-ecommerce`
  22/34 prouvées, 7 vues en session sans test (dont `/`, `/connexion`,
  `session.signOutProcess`, `ecommerce.product.delete`) ; le lien place le
  replay à l'étape 53/199, l'ouverture sans `?event` reste au début.
- [x] « Écrire l'e2e » sur un comportement vu en session : la session s'ouvre
  à l'événement (`?event=&behavior=&app=`), puis « Reprendre ici » s'ouvre
  avec l'intention remplie (écrire le test Playwright qui prouve cette
  obligation, assertion par rôles et textes, `craftSession`, le lancer pour
  que sa référence prouve). La personne garde le dernier clic : l'onglet de
  l'agent doit s'ouvrir dans un vrai clic. Vérifié sur le dashboard 4210 (le
  dialogue fermé sans envoi).
- [x] La recherche dans les sessions lit le nom écrit par le runtime
  (`detail.behavior`), comme les preuves (voir P2).

## Questions ouvertes

- Faut-il continuer à committer les traces e2e complètes, ou les passer en
  artefacts de CI (supprime le problème d'historique git) ? Dépend de l'usage
  des références hors ligne dans le dashboard.
- Budget exact du passage PR des mutants, à fixer après les mesures de nuit.
- Forme du marquage explicite des comportements hors primitives craft.
