# Plan : contraindre des tests de comportement

> Statut (2026-11-02) : lot 1 fait et commité ; lot 2 fait (e2e et tests de service/template), sauf la vérification « observé » ; lot 3 à faire.

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

### Lot 1 — Statique, sans dépendance aux tests ✅

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
- [ ] Autres apps (`demo`, `demo-effect`, `demo-ssr`, `quickstart-effect`,
  `demo-with-server-function`, attestation-app) : non branchées.
- Non retenu pour l'instant : les méthodes exposées des `state`
  (`select`, `close`…), trop proches de simples setters ; les transitions
  une par une des machines à états (le graphe ne les expose pas).

**P3. Tester par les frontières**

- [x] Règle `behavior-test-mocks-boundaries` (suite d'architecture) : dans les
  maps `register` des helpers craft, un mock n'est accepté que pour un service
  frontière (HTTP ou server function, directement ou par une primitive ;
  `browserBoundary` ; code hors de l'app). Une chaîne (`'notReached'`) ou un
  `provideX()` garde le vrai service. Waiver `<spec>:<clé>`.
- [ ] Pas d'import d'un membre `craftPrivate` dans un test : non fait (à
  vérifier d'abord si le typage de `sut` ne l'interdit pas déjà).
- [x] Règle ESLint `craft-ts/no-spy-on-system-under-test` (dans
  `recommended`) : pas de `toHaveBeenCalled*` ni de `spyOn` sur le `sut` ; les
  appels aux mocks de frontière restent permis.
- [x] Règle ESLint `craft-ts/e2e-user-facing-locators` (dans `configs.e2e`) :
  pas de sélecteur de classe ou d'id. `demo-ecommerce` corrigé : rôles
  `list`/`listitem` sur la liste des produits de l'admin, e2e `admin` vérifié.
- [ ] `debug-session-dashboard` (7) et `review-attestation` (23) ont encore
  des sélecteurs de classe ; leurs e2e ne prennent pas `configs.e2e`.

**P5. Cliquet**

- [x] Diff `main` ↔ PR : catalogue lu au merge-base (`main`, puis
  `origin/main`, ou `CRAFT_BEHAVIOR_BASE`).
- [x] Waivers `architecture/behavior-waivers.ts` typés sur le catalogue ;
  raison vide, obligation disparue ou (lot 2) prouvée → échec.
- [x] Obligation nouvelle sans preuve ni waiver → échec ; supprimée → permis.
- Le cliquet ne s'active qu'une fois `behaviors.catalog.ts` présent sur
  `main` : avant le merge, il n'y a pas de base et il ne bloque rien.

### Lot 2 — Preuve par la trace

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
- [ ] Le runtime n'émet pas encore les identifiants du catalogue ; la
  correspondance par nom en tient lieu.
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
- [ ] Les preuves unitaires prouvent mais ne sont pas comparées à la base
  (index hors git) : retirer le seul test unitaire d'une obligation ne bloque
  pas encore. Il faudrait l'index de `main` en artefact de CI.
- [x] Extraction depuis les références e2e déjà versionnées
  (`e2e/__sessions__`) : aucun stockage en plus. `demo-ecommerce` : 12
  obligations sur 34 prouvées par ses 3 tests.
- [x] Index : pas de fichier ; recalculé depuis les références, et au
  merge-base depuis git (`git show`).
- [x] Cliquet complet : obligation prouvée sur la base, toujours là, plus
  prouvée → bloquant (waivable avec raison). Couverture affichée, jamais
  imposée.
- [ ] Vérification « observé » (assertion après l'événement) : non fait ; les
  assertions Playwright n'apparaissent pas dans les traces.
- [x] Avertissement test orphelin.

Observation : `admin.edit-product` clique sur « +1 stock », mais sa référence
(2026-10-25) ne contient ni `adminAction` ni `ecommerce.product.save`. À
regarder : référence ancienne ou capture incomplète.

Observation : l'enregistreur e2e (`send-context-to-ai.ts`) compte comme
réussie une invocation qui rend une exception Craft en valeur ; une preuve
`#success` lue dans une trace e2e peut donc venir d'un échec. L'enregistreur
de test, lui, la compte comme échec.

Fini quand : retirer le test qui couvre une obligation fait échouer la PR
(fait pour les e2e, pas encore pour les tests unitaires), et une exception
HTTP prouvée par un test de service suffit (fait : l'exception est notée avec
son discriminant).

### Lot 3 — Discrimination, puis aide

**P4. Mutants sémantiques**

- [ ] Un mutant par type d'obligation via override runtime : loader de mutation
  vide, exception remplacée par un succès, transition bloquée, `reactOn` coupé.
- [ ] Sélection des tests par empreinte, arrêt au premier échec.
- [ ] Cache des résultats.
- [ ] Garde-fous e2e instables (baseline verte, échec après l'événement).
- [ ] Commande locale `craft mutants --changed`.
- [ ] Passage de nuit non bloquant, puis PR bloquante pour le neuf.

**P6. Combler les trous**

- [ ] Vue « Couverture » dans le dashboard (plutôt qu'« Écarts », qui compare
  des sessions) avec trois catégories :

| Catégorie | Action |
|---|---|
| Observée dans une session, pas couverte | « Générer l'e2e » depuis la session à cet événement ; l'IA écrit l'assertion |
| Jamais observée, chemin heureux | Candidate à la suppression, ou reprise guidée pour l'atteindre |
| Jamais observée, exception | Test de service avec mock à la frontière, ou override du registre pendant une reprise guidée |

## Questions ouvertes

- Faut-il continuer à committer les traces e2e complètes, ou les passer en
  artefacts de CI (supprime le problème d'historique git) ? Dépend de l'usage
  des références hors ligne dans le dashboard.
- Budget exact du passage PR des mutants, à fixer après les mesures de nuit.
- Forme du marquage explicite des comportements hors primitives craft.
