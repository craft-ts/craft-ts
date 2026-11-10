# Analyse : des sessions manuelles aux tests de non-régression rejoués

> 2026-11-07 — analyse et plan par lots, rien n'est implémenté.
> Objectif : les sessions que les développeurs (puis les testeurs) enregistrent en
> utilisant l'application deviennent, sans écrire de test, une suite rejouée sur
> chaque changement, avec captures d'écran et comparaison base/tête — à la manière
> de Meticulous, pour toute application CraftTS, en commençant par les démos.

## 1. Ce que fait Meticulous

| étape | Meticulous |
| --- | --- |
| Enregistrement | Un script dans les environnements local, staging et preview (prod en option) capture interactions, requêtes/réponses réseau, URL de départ, métadonnées. |
| Sélection | Le « golden set » : 200 à 500 sessions choisies automatiquement pour **maximiser la couverture** (code, pages, diversité des parcours) et **minimiser la redondance**, avec la récence en appoint. Rafraîchi en continu ; une session qui n'apporte plus de couverture unique est remplacée. |
| Rejeu | Navigateur lancé sur l'URL de départ, **interactions rejouées** (vrais événements DOM), **réseau bouchonné** par les réponses enregistrées (pas de backend, pas de compte de test), moteur d'ordonnancement déterministe au niveau de Chromium. |
| Preuve | Captures aux navigations, aux changements significatifs du DOM et aux moments choisis. « Replay accuracy » = part des interactions rejouées avec succès. |
| Comparaison | Run **base** (commit de main d'où part la PR) contre run **tête** (chaque commit de la PR), diff pixel à pixel. |
| Revue | Diffs postés sur la PR : non approuvé / approuvé / rejeté. |
| Boucle locale | `meticulous local relevant-sessions` : les sessions concernées par les changements non commités. |
| Vieillissement | Les formes de réponses périmées sont corrigées, les sessions obsolètes remplacées. |

Leur limite structurelle : ils ne voient que **du DOM et des pixels**. Ils mesurent la
couverture par instrumentation du JavaScript et jugent par diff d'images, d'où le
besoin d'un Chromium modifié pour tenir le déterminisme.

## 2. Ce que CraftTS a déjà (et que Meticulous n'a pas)

Presque toute la chaîne existe, mais elle est tournée vers le **débogage** d'une
session, pas vers une **suite** rejouée sur un changement de code.

| brique | où | ce qui sert ici |
| --- | --- | --- |
| Capture v7 | `libs/component/src/lib/ai/debug-session-*` + `provideCraftDebugSessionCapture` | DOM, HTTP/fetch/XHR/WS/Worker, navigation, **état des primitives**, invocations Craft par **adresse**, stockage, snapshots, viewport, environnement, multi-onglets. Événements déjà caviardés. |
| Archive | `apps/log-server` (`.debug-sessions/`) | Réception WebSocket, index, élagage 100 sessions / 30 jours. |
| Rejeu | `debug-session-replay.ts`, bridge, dashboard | Transports bouchonnés, **horloge virtuelle Craft** (`VirtualCraftTemporalRuntime`), détection d'écart, restauration du stockage et des snapshots. |
| Captures | `apps/log-server/src/thumbnails/*` + `debug-session-thumbnail-plan.ts` | Chromium headless (Playwright) qui pilote le dashboard en mode worker, **plan de capture** (départ, navigation, craft, checkpoint, interaction, fin), attente de DOM calme. |
| Trace normalisée | `packages/session-trace` | Clés stables (`route:`, `invocation:<adresse>`, `server-fn:`, `checkpoint:`, `interaction:`), comparaison par **invariants** et **bruit** (champs qui varient entre runs verts), diff de Myers. |
| Historique e2e | `libs/playwright-sessions` | Sessions vertes versionnées en gzip dans `__sessions__`, comparaison sur échec, rejeu de la référence sur le build courant. |
| Couverture de comportements | `behavior-coverage.ts`, `@craft-ts/dev-tools` | Catalogue d'obligations par app, et **quelles sessions montrent un comportement qu'aucun test ne prouve**. |
| Contrat de scénario | `debug-session-scenario.ts` | `ReplayScenario` : checkpoints, assertions d'événements, assertions visuelles (rôle, nom accessible), tolérances, cycle de vie `active / needs-review / recapture-required / incomplete-or-not-replayable`. Peu branché. |
| Jugement humain | `libs/attest` | Registre `current / renewed / review / missing` : un jugement **survit** à un changement de code si la preuve ne bouge pas. |
| Graphe | `libs/graph-mcp`, rapports de graphe de dépendances | Fichier → primitives, routes, services. |
| Recettes | `resume-recipes.ts`, export Playwright | Parcours rejouables, export en échafaudage (TODO à la main). |

**L'avantage de fond** : là où Meticulous devine le sens à partir des pixels et du JS
instrumenté, une session CraftTS porte déjà la sémantique — quelle méthode a été
appelée, quelle route activée, quelle primitive a changé et vers quelle valeur. On
peut donc :

- mesurer la couverture en **unités sémantiques stables** (adresses Craft) plutôt
  qu'en lignes de JS, qui bougent à chaque refactor ;
- juger un rejeu par sa **trace** avant ses pixels — la trace dit *pourquoi* l'écran
  diffère ;
- trier le bruit sans Chromium modifié : la notion d'« invariants vs bruit » de
  `session-trace` s'applique telle quelle à des rejeux répétés.

## 3. Les écarts à combler

### É1 — Le rejeu actuel réinjecte l'état au lieu de le recalculer (bloquant)

Entre deux interactions, `restorePrimitiveChangesBetweenSteps` réécrit les valeurs
enregistrées des primitives (`options.restoreState`). C'est juste pour le débogage
(retrouver exactement l'écran vu), mais **masque les régressions de logique** dans un
test : un loader qui parse mal, un `craftComputed` faux, un état mal dérivé sont
écrasés par la valeur enregistrée. Le README de `playwright-sessions` le dit déjà pour
le rejeu de référence.

→ Il faut un **mode « suite »** : ne bouchonner que les frontières (transports,
horloge, aléa, stockage initial), laisser tout le reste se recalculer sur le code de
tête, et faire des changements de primitives enregistrés des **attendus** (comparés
avec tolérances) au lieu d'entrées. C'est exactement le modèle de Meticulous (réseau
seul), avec en plus un oracle d'état. `?replay-verify-state=1` en est l'amorce pour
l'état possédé par une méthode.

### É2 — Les clics ne sont pas rejoués (le bouton débranché passe)

Mode `invocation` : les actions DOM sont des indices visuels, le rejeu appelle
directement les méthodes Craft. Un bouton dont le `(click)` a disparu passe.
Meticulous, lui, dispatche de vrais événements.

→ Un **mode interaction** : résoudre la cible (nom Craft `data-craft-name`, puis rôle +
nom accessible, puis sélecteur enregistré), dispatcher l'événement réel, et vérifier
que **l'invocation enregistrée se produit** (même adresse). C'est plus fort que
Meticulous : un clic qui ne déclenche plus la bonne méthode est un écart nommé, pas
juste un pixel qui bouge. Quand la cible est introuvable, repli sur l'invocation
directe **inscrit dans le résultat** (« étape non prouvée par interaction »), à la
manière des hypothèses tracées d'`@craft-ts/attest`. Le mode `legacy-dom` existant est
le point de départ.

### É3 — Pas de comparaison base/tête

Aujourd'hui : une session observée contre des runs verts **du même code**. Il manque
un rejeu du même jeu de sessions sur **deux builds** (base de la PR, tête) avec
comparaison.

### É4 — Le déterminisme ne couvre que le temps Craft

L'horloge virtuelle pilote le runtime temporel Craft, pas `Date`, `Math.random`, les
animations CSS, les polices, les images. Inutile de modifier Chromium : Playwright
fournit `page.clock`, `reducedMotion`, `animations: 'disabled'` à la capture,
`document.fonts.ready`, et l'attente de DOM calme existe déjà. Le reste du bruit se
traite par **rejeu répété de la base** (section 4, D4).

### É5 — Rien ne choisit les sessions

L'archive garde tout (puis élague par âge). Il manque la sélection d'un ensemble
**durable** qui maximise la couverture.

### É6 — Les sessions vieillissent

Une session enregistrée il y a trois semaines peut ne plus être rejouable : forme de
réponse changée, adresse renommée, route supprimée. Il faut distinguer **« la session
est périmée »** de **« l'application a régressé »**, sinon la suite crie au loup.

### É7 — Collecte limitée à la machine du développeur

Le log-server écoute en loopback. Les testeurs, la staging : plus tard, et pas sans
caviardage vérifié (le README de `playwright-sessions` rappelle que les sessions
committées ne sont pas caviardées).

## 4. Décisions de conception proposées

**D1 — Le test, c'est la session rejouée, pas du code Playwright généré.**
L'export de recette en `.spec.ts` reste un échafaudage plein de TODO ; générer du code
qui se périme est ce que Meticulous évite. Une entrée de suite = une session + son plan
de capture + ses attendus (`ReplayScenario`, déjà défini).

**D2 — La couverture se compte en unités sémantiques.**
Unités = clés de `session-trace` (routes, invocations avec issue `succeeded`/`failed`
et type d'exception, server functions, checkpoints par adresse, interactions nommées)
+ obligations du catalogue de comportements (`behavior-coverage`). Pas de couverture
V8 au départ : coûteuse, Chromium seulement, et instable au refactor. Elle pourra
départager plus tard.

**D3 — Sélection = couverture d'ensemble gloutonne, pondérée.**
Une session entre si elle apporte une unité que l'ensemble n'a pas ; poids plus fort
aux obligations non prouvées, aux chemins d'exception, aux routes rares ; doublons
éliminés par le `hash` de trace ; récence en départage ; **rejouabilité exigée**
(rejeu sans écart sur main avant d'entrer). Chaque session sélectionnée garde la liste
des unités qu'elle est seule à couvrir : c'est sa raison d'être, affichée au dashboard,
et ce qui permet de la remplacer quand une session plus récente couvre la même chose.

**D4 — Le juge est la trace d'abord, l'image ensuite ; le bruit vient de la base rejouée deux fois.**
Pour chaque point de capture : (1) trace normalisée comparée par `session-trace`,
(2) **digest de layout** (le format de `visual-attestation-plan.md` : positions,
tailles, débordements), (3) PNG pour l'humain. Base rejouée **deux fois** : ce qui
diffère entre les deux runs de base est du bruit, masqué (même logique que le bruit
entre runs verts). Un écart de pixels sans écart de layout ni de trace est rangé
« mineur », pas « régression ».

**D5 — L'approbation passe par `@craft-ts/attest`.**
Sujet = `golden:<session>:<point>`, preuve = empreinte (trace + digest). Approuver un
écart crée l'attestation ; un code qui change sans changer la preuve la renouvelle
seul. Pas de second système d'approbation.

**D6 — Une session périmée sort de la suite, elle ne la fait pas échouer.**
Détecteurs, du moins cher au plus cher : réponse enregistrée qui ne passe plus le
schéma de la server function ; adresse invoquée absente du registre/graphe ; écart de
rejeu **avant** le premier point de capture. Elle passe en `recapture-required`, ses
unités uniques sont réaffichées comme « à ré-enregistrer » sur la page Couverture
(lien direct vers la page à refaire). Une régression, elle, est un écart **après** un
rejeu sain de la base.

**D7 — Stockage du jeu sélectionné.**
Le manifeste (`.craft/golden/manifest.json` par app : sessions, unités, raisons) est
committé. Les sessions elles-mêmes : gzip déterministe comme `__sessions__`, committé
**seulement** derrière un contrôle de caviardage ; les captures ne sont jamais
committées (régénérables, artefacts de CI, cache local). → **Point à trancher** (§6).

**D8 — Une seule mécanique de rejeu headless.**
Le capteur de vignettes du log-server devient le **runner** commun (vignettes, suite,
rejeu de référence de `playwright-sessions`), paramétré par l'URL du build cible.
Pas un deuxième moteur.

## 5. Plan par lots

Chaque lot est utile seul.

**État au 2026-11-09** (branche `feat/session-regression-suite`, commitée, non poussée) :
la boucle locale tourne de bout en bout — choisir les sessions, les rejouer base contre
tête, dire régression / changement / inchangé, voir base et tête côte à côte, approuver
un changement voulu ; la suite réelle de demo-ecommerce (11 sessions) passe. Restent : le
lot 7 (non commencé), la CI (écartée faute de crédit), le packaging pour les apps
craft-ts (mis de côté) et les points « Reste » ci-dessous, qui attendent tous un vrai cas
(autre origine, autre app). Les questions du §6 ne sont pas tranchées.

**Décision du 2026-11-07 : les sessions déjà archivées ne sont pas prises en compte.**
On prépare d'abord le système ; les sessions qui l'alimenteront seront enregistrées
une fois qu'il sera en place. Le jeu d'essai des lots est donc synthétique (traces
construites dans les specs) ou produit par les e2e (`__fixtures__` de
`session-trace`, histoires `__sessions__`), jamais `.debug-sessions/`. L'ancien
lot 0 (mesurer la rejouabilité des sessions archivées) est abandonné ; la
rejouabilité sera mesurée par le système lui-même (lot 2, statut de chaque session).

### Lot 1 — Unités de couverture et sélection (pur, sans navigateur) — ✅ fait, commité

Fait :
- `packages/session-trace/src/coverage-units.ts` : `sessionCoverageUnits`,
  familles et poids, échecs pondérés par famille, `behaviorCoverageUnit`.
- `packages/session-trace/src/golden-set.ts` : `selectGoldenSet` (couverture
  gloutonne pondérée, dédoublonnage par hash, élagage des redondantes, budget,
  stabilité via `previous`, `toRecapture`), `goldenSessionsShowing` (amorce du
  lot 6), `isGoldenSetManifest`.
- `apps/log-server` : `POST /sessions/golden-set` (lecture seule) ; candidates =
  sessions humaines terminées et entières de l'origine ; `replayable` lu dans le
  manifeste des vignettes (`ready` → oui, arrêt sur un écart → non).
- `packages/log-mcp` : outil `sessions.goldenSet` (lit et écrit
  `<app>/.craft/golden-set.json`, priorités = comportements non prouvés).

Fait (2026-11-08) : page **Suite** du dashboard (sessions retenues, ce que chacune
seule montre, laissées de côté, chemins à réenregistrer, rejeu de toute la suite).
La commande pour les humains est `sessions:check`, qui lit le golden set dans l'archive.

Fait (2026-11-09) : `npm run sessions:check -- --select [--app <nom>] [--max-sessions <n>]`
choisit la suite et l'écrit dans `<app>/.craft/golden-set.json` (même proposition que
l'outil MCP `sessions.goldenSet` : la suite en place reste stable, les comportements
qu'aucun test ne prouve passent d'abord) ; le check rejoue ce manifeste tant qu'il est
là, la proposition de l'archive sinon. Sur demo-ecommerce : 11 sessions gardées sur 29.
Le nom `craft-ts sessions select` attend le packaging (mis de côté).

Reste : le stockage des sessions elles-mêmes (D7, §6) — le manifeste se committe, les
sessions restent dans l'archive du poste.

Prévu :

- `coverageUnits(trace, catalog?)` et `selectGoldenSet(sessions, options)` dans
  `@craft-ts/session-trace` (déjà partagé par fixture, serveur, MCP, dashboard).
- Commande `craft-ts sessions select --app <app>` → manifeste avec, par session, ses
  unités uniques et sa raison.
- Dashboard : page **Suite** (sessions retenues, pourquoi, unités sans session).
- Outil MCP `sessions.select` / `sessions.suite`.

### Lot 2 — Mode « suite » du rejeu (É1) et déterminisme (É4) — ✅ fait, commité ; heure civile corrigée (2026-11-10)

Fait :
- `createReplayController({ stateSource: 'recomputed' })`
  (`libs/component/.../debug-session-replay.ts`) : les changements que le code
  rejoué produit lui-même (query, mutation, asyncProcess, et state possédé par
  une méthode rejouée) ne sont plus réinjectés mais **attendus**, vérifiés avant
  l'action suivante et en fin de rejeu ; l'écart propose l'état attendu comme
  récupération. Un state qu'aucune méthode rejouée ne possède (champ saisi) est
  toujours restauré. Bridge (`stateSource`) et dashboard (`?replay-state=recomputed`).
- Surface worker du dashboard : `seekTo(index)` (action par action, arrêt en
  pause) à côté de `advanceTo` (lecture, pour les vignettes).
- `@craft-ts/playwright-sessions/suite` : `replayGoldenSession(context, …)` —
  seek déterministe à chaque point du plan, page rejouée immobile (CSS sans
  animation, `reducedMotion`, `Math.random` à graine, polices chargées), PNG +
  mesure injectée (`measure`, ex. `collectLayoutDigest` de
  `@craft-ts/style-testing/digest` : la lib est sous style-testing dans le
  graphe, elle ne peut pas l'importer). Pilote worker partagé avec le rejeu de
  référence e2e (`baseline-replay.ts` réécrit dessus).
- Preuve de bout en bout : `apps/demo-ecommerce/e2e/golden-replay.spec.ts`
  (parcours d'achat enregistré « à la main » puis rejoué en mode recalculé :
  17/17 actions, captures + digest).

Constats :
- **Onglet fermé pendant une requête** → session non rejouable dans *aucun*
  mode (« operation … has no recorded terminal result »). La sélection l'exclut
  déjà ; à terme, couper la queue inachevée au lieu de refuser la session.
- **Faux vert confirmé** : la confirmation de commande (`placeOrderProcess`,
  lancé par le clic, pas par une méthode) n'est pas rejouée en mode invocation
  et son état n'est pas enregistré : le rejeu finit « completed » sur le
  panier vide au lieu de « Merci pour votre commande ». La capture le montre,
  pas l'oracle d'état → le lot 4 (vrais clics) est nécessaire.
- Les indices visuels du rejeu (badge « Onglet fermé », marqueur de clic)
  apparaissaient dans les captures → fait : marqués `data-replay-cue` et cachés à la
  capture (`HIDE_REPLAY_CUES`).
- Le capteur de vignettes du log-server garde son propre pilote (le log-server
  est compilé et publié, il ne peut pas dépendre de `playwright-sessions`).
- **Heure civile au rejeu (2026-11-10)** — cas précis : la promotion de la semaine de
  demo-ecommerce (fin datée par le serveur, compte à rebours à la seconde lu par
  `CraftTemporalRuntime.dateNow()`, prix remisés tant qu'elle court). Constat : l'horloge
  virtuelle du rejeu démarrait au temps écoulé de la session (`elapsedMs`), donc
  `dateNow()` rendait le 1ᵉʳ janvier 1970 (`promoNow` = 3000 au lieu de 1794289982876) et
  4 e2e de rejeu divergeaient. Corrigé : `VirtualCraftTemporalRuntime(initialTime,
  { dateOrigin })` sépare l'heure civile du temps virtuel, et le rejeu la cale sur le
  `timestamp` enregistré (`recordedDateOrigin`). Une minuterie réelle dérive de quelques
  ms par tick alors que l'horloge virtuelle est exacte : deux dates lues de l'horloge
  (millisecondes entre 2000 et 2100) sont la même à 2 s près (`REPLAY_CLOCK_TOLERANCE_MS`).
  Suites (2026-11-10, même jour) :
  - le code qui lit `Date` lui-même (une bibliothèque, une app sans la règle
    `no-direct-temporal-globals`) lit aussi l'heure de l'enregistrement : pendant un
    rejeu, `Date.now()` et `new Date()` suivent l'horloge civile du rejeu (l'heure où
    elle est arrivée, plus le temps réel écoulé depuis : une échéance calculée avec
    `Date` expire toujours). Le moteur garde ses propres échéances sur l'horloge réelle
    (`realDateNow`), et rend `Date` à la page à la fin du rejeu (`followRecordedDate:
    false` le coupe) ;
  - un rappel programmé (`CraftTemporalRuntime.schedule`) s'exécute dans le flux qui
    l'a programmé, pas dans celui du dernier clic : le compte à rebours lancé au
    chargement n'est plus attribué au clic, une relance reste celle de son clic
    (`ɵcarryAcrossTemporalTasks`, porteur de la corrélation) ;
  - le helper e2e `archiveSettled` ne compte plus les événements du compte à rebours :
    l'enregistrement d'une page ouverte grossit chaque seconde, le reste se stabilise.

Prévu à l'origine :

- Option de rejeu `stateSource: 'recorded' | 'recomputed'` : en `recomputed`, les
  `primitive-change` ne sont plus restaurés mais comparés (tolérances du
  `ReplayScenario`), l'écart nomme l'adresse et le chemin.
- Runner : `page.clock` figé sur l'heure enregistrée, `Math.random` graine fixe,
  `reducedMotion`, animations coupées à la capture, polices chargées, DOM calme.
- Extraction du runner depuis `thumbnails/playwright-capturer.ts`, URL cible en
  paramètre, sortie = captures + digests de layout + trace observée.

### Lot 3 — Base contre tête — ✅ fait en local, commité ; CI écartée

Fait (`@craft-ts/playwright-sessions/suite`) :
- `compareGoldenRuns` : base ×2 (ou plus, `--noise-runs`) + tête ×1 par session. Verdicts `regression`
  (la base va au bout, pas la tête ; ou une action dont l'élément a disparu),
  `changed`, `unchanged`, `stale` (la base ne rejoue plus : à réenregistrer,
  ne prouve rien), `flaky` (les deux bases divergent). Par moment : mesures
  aplaties (nœuds du digest indexés par leur chemin ; un nœud ajouté/retiré =
  une ligne), pixels (pixelmatch) ; ce qui diffère entre les deux bases est du
  bruit, écarté des deux.
- `goldenCheckReport` / `renderGoldenCheckReport` / `writeGoldenCheckReport` :
  markdown (tableau des sessions, images base/tête/diff, mesures changées) +
  JSON sans images ; `passed` faux sur régression ou changement non approuvé.
- `runGoldenCheck` : builds servies **l'une après l'autre à la même adresse**
  (les réponses enregistrées sont appariées par URL, origine comprise) ;
  `commandServer` (commande + URL, groupe de processus arrêté) et
  `gitWorktreeServer` (ref dans un worktree temporaire, `node_modules` lié,
  supprimé à l'arrêt) ; `prepareContext` par build.
- Preuve e2e (`apps/demo-ecommerce/e2e/golden-check.spec.ts`) : tête identique →
  `unchanged` (aucune fausse alerte) ; tête restylée → `changed`, le rapport
  nomme `h1 … styles.color` / `letter-spacing` / largeur ; bouton débranché →
  `regression` avec l'appel manquant.

Fait (2026-11-08) : commande locale `npm run sessions:check -- --base <ref> [--head <ref>]`
(`tools/sessions-check/`, golden set lu dans l'archive, base servie depuis un worktree,
tête = arbre de travail ou un ref, rapport dans `tmp/sessions-check/<app>`). Éprouvée sur
l'archive réelle de demo-ecommerce (11 sessions, ~5 min) : sans changement 11 inchangées ;
contre un commit cassé (choix de formule non oubliés + couleur du logo) 3 régressions
(appel `formulaPicks.forget` manquant) et 5 changements (couleur nommée, images). Limite :
une session sans action n'a aucun moment photographié, donc un changement visuel y passe.
`gitWorktreeServer` est éprouvé sur un vrai serveur d'app (Vite de demo-ecommerce, base
servie depuis un worktree, à chaque `sessions:check`).

Fait (2026-11-09) :
- **Vue base/tête** sur la page Suite : « Voir les différences » ouvre, moment par moment,
  les images base, tête et différence (le log-server les sert depuis le dernier rapport,
  `GET /sessions/check/image?origin=&path=`, chemin validé) et les mesures changées.
- **Session sans action** : son seul moment est la page telle qu'elle s'ouvre. Sur la
  tête « logo seul », les 3 sessions sans action passent d'« inchangée » à « changement ».
  Une session rechargée plusieurs fois (12 chargements d'un onglet caché par le serveur
  de dev) est rejouée en autant d'onglets, que le dashboard montre en grille. Corrigé
  (2026-11-10) : le runner montre l'onglet photographié seul, à sa taille enregistrée
  (`showAlone` sur la surface du worker : les autres tuiles sortent de la grille, leurs
  pages tournent toujours, à la même taille), puis rend la grille. 1646×834 au lieu de
  la tuile de 394×201. Un dashboard sans `showAlone` donne encore la tuile.

Fait (2026-11-10) : `--noise-runs <n>` (`noiseRuns` de `runGoldenCheck`, 2 par défaut, au
moins 2) : la base est rejouée n fois, et le bruit est tout ce qui diffère entre la
première et l'une des autres (mesures et pixels). Trois rejeux attrapent plus souvent une
valeur qui ne bouge qu'un rejeu sur trois (un curseur, une animation) ; `flaky` dès qu'un
des rejeux ne va pas au même point.

Reste : servir une build à une autre origine que celle de l'enregistrement (un vrai cas :
une preview ou un staging). Écarté : l'action CI (pas de crédit).

Prévu à l'origine :

- `craft-ts sessions check --base <ref>` : build de la base dans un worktree (cache
  par commit), deux serveurs, base ×2 + tête ×1 par session, comparaison D4.
- Rapport `md` + `json` (même forme que `craft-session-diff`), et vue dashboard :
  l'actuelle `#/compare` gagne un onglet visuel base/tête synchronisé.
- Sessions périmées classées à part (D6), jamais en rouge.

### Lot 4 — Mode interaction (É2) — ✅ fait, commité

Fait :
- `createReplayController({ mode: 'interaction' })` : garde les frontières du
  mode invocation (transports enregistrés, pas de réseau vivant) mais
  **dispatche** chaque action sur son élément (valeur + `input`/`change` pour
  un champ) au lieu d'appeler les méthodes ou de piloter le routeur. Oracle :
  les appels racines enregistrés après l'action doivent sortir des
  gestionnaires — vérifié *avant* l'état (la cause avant la conséquence) ;
  l'écart nomme les appels manquants. Élément introuvable (2 s) → repli sur
  l'invocation avec une note `[Interaction non prouvée]`. Avec
  `stateSource: 'recomputed'`, tout changement d'état après une action
  dispatchée est attendu, champs saisis compris.
- Bridge (`mode: 'interaction'`), dashboard (`?replay-mode=interaction`), surface
  worker (`warnings`), runner : `replayMode: 'interaction'` par défaut,
  `unprovenInteractions`, `notes`, `debug` (console).
- Le pont MCP des dev tools ne démarre plus dans une page rejouée
  (`craft-debug-replay=1`) : sa reconnexion était un transport non enregistré
  que le rejeu bloquait comme écart, au hasard du minutage.
- Preuve e2e (`golden-replay.spec.ts`) : le rejeu montre maintenant « Merci
  pour votre commande » ; le même enregistrement rejoué sur une app dont le
  bouton « Confirmer » a perdu son gestionnaire s'arrête sur
  `missing: [service:cart / mutation:syncServerCart / method:mutate]`.

Mesuré (2026-11-09) sur la suite réelle de demo-ecommerce : 0 action en repli sur
3 732 (11 sessions humaines). Les indices visuels sont masqués dans les captures
(lot 2). Reste : la même mesure sur une autre app.

Prévu à l'origine :

Dispatch réel sur cible résolue, invocation attendue comme oracle, repli tracé.
Le plus gros morceau, dans `debug-session-replay.ts` ; à faire après le lot 3 parce
que la comparaison visuelle attrape déjà les régressions de rendu en mode invocation.

### Lot 5 — Approbation et CI — ✅ approbation locale faite, commitée (2026-11-09) ; CI écartée

Fait (approbation, en local) :
- **Ce qui s'approuve, c'est la différence, pas la session.** `compareGoldenRuns` donne à
  chaque session `changed` un `change` : les moments qui diffèrent et une empreinte
  (sha-256) de leur statut et de **toutes** leurs différences de mesures (chemin, base,
  tête), pas seulement des 40 listées (`measureFingerprint` par moment). Les pixels
  n'entrent pas dans l'empreinte (leur taux bouge d'un rejeu à l'autre), mais un moment
  qui ne diffère que par ses pixels est compté dans la liste des moments.
- **Registre `attest` existant** (`.craft/attestations.jsonl`, D5) : genre
  `golden-session` ajouté à `SubjectKind` ; sujet `golden:<app>:<session>`, empreinte =
  preuve = celle de la différence, verdict `ok`, `by` = `git config user.name`, note =
  moments + base → tête. `approval.ts` de `@craft-ts/playwright-sessions/suite` :
  `approveGoldenChange` (refuse une régression, une session sans changement),
  `isGoldenChangeApproved` (`statusOf` → `current`), `updateGoldenLedger` (relu juste
  avant d'écrire, écrit entier par renommage, refuse un registre aux lignes illisibles
  pour ne pas les perdre). La CLI `attest status` signale ces sujets comme orphelins sans
  les supprimer.
- **Rapport** : `goldenCheckReport(…, { app, origin, isApproved })` marque `approved` les
  `changed` dont la différence précise est au registre ; `approved` compté à part ;
  `passed` = aucune régression et tout changement approuvé. Markdown : « ✅ changement
  approuvé », empreinte et commande d'approbation sous chaque changement.
- **Commande** : `npm run sessions:check -- --approve <session>` (id ou début d'id) porte
  sur la dernière vérification (`tmp/sessions-check/<app>/report.json`) ; refuse une
  régression (« elle se corrige, elle ne s'approuve pas »), une session inchangée, un
  id ambigu ; réécrit le rapport. Le check suivant lit le registre : résumé
  « changement approuvé N », code 0 si tout changement l'est.
- **Dashboard** : page Suite, section « Dernière vérification base contre tête »
  (verdicts, sessions à regarder, bouton « Approuver ce changement » sur les seuls
  changements non approuvés). Le log-server lit le dernier rapport de l'origine
  (`GET /sessions/check?origin=`) et approuve en lançant la commande
  (`POST /sessions/check/approve`) : un seul écrivain du registre. Actif quand le
  serveur tourne dans un dépôt qui a `tools/sessions-check/` (`DEBUG_SESSION_CHECK=0`
  le coupe).

Preuve (2026-11-09, archive réelle de demo-ecommerce, 11 sessions) : tête = commit hors
branche qui ne change que la couleur du logo (`.brand`) → « changement 8 · inchangée 3 »,
code 1 ; 7 approbations par `--approve`, la 8ᵉ par le bouton de la page Suite ; relancé
→ « changement approuvé 8 · inchangée 3 », code 0 (l'empreinte est stable d'un rejeu à
l'autre) ; tête = logo + espacement du bandeau → « changement 8 », code 1 de nouveau.
`--approve` sur une session inchangée est refusé. Le refus d'une régression est prouvé
par les tests (lib, lanceur, log-server), pas sur une vraie régression de l'archive.

Écarté pour l'instant : l'action CI et le résumé de PR (pas de CI voulue).

### Lot 6 — Sessions concernées par un changement (la boucle locale, et l'IA) — ✅ fait, commité

Fait (2026-11-08) : `npm run sessions:check -- --base <ref> --changed [--scope <dossier>] [--list]`
ne rejoue que les sessions que le diff base → tête touche (graphe de l'app analysé
en mémoire, `relevantGoldenSessions`). Sur demo-ecommerce, « les choix de formule ne
sont plus oubliés » : 4 sessions sur 11, dont les 3 régressions, en 2,8 min au
lieu de 5. Trois corrections de l'impact :
- une ligne supprimée ne compte que pour les nœuds qui l'entourent (elle marquait
  l'appel de la ligne du dessus, `cart.cartLines`, lu partout) ;
- `provides` n'est plus suivi à rebours (un service fourni par une page prenait
  son arbre de rendu, et chaque page qui a sa propre instance semblait touchée) ;
- une feuille de style compte comme inconnue du graphe : toutes les sessions.

Fait :
- `libs/graph-mcp/src/relevant-sessions.ts` : lignes modifiées (`git diff -U0`,
  fichiers nouveaux compris) → nœuds du graphe qui les couvrent → leur impact
  (`impactOf`, relations de `DEPENDENCY_FORWARD`) → unités qu'ils nomment
  (service → `invocation:cart.…` ; méthode d'une primitive →
  `invocation:cart.add` ; composant / élément interactif → `interaction:…` ;
  route → `route-activation:` / `route:` ; server function → `server-fn:`) →
  sessions du golden set, `direct` avant `impact`. Prudent : un fichier de code
  inconnu du graphe rend toutes les sessions concernées (`unmapped`) ; specs,
  docs et e2e ignorés. Chemins canonisés (`realpath`) : git et le graphe ne
  voient pas toujours le même chemin à travers un lien symbolique.
- Outil MCP `sessions.relevant` du serveur graph-mcp : `since` (HEAD par
  défaut), `files`, `goldenSet`, `scope` (le dossier de l'app par défaut, pour
  qu'un chantier ailleurs dans le monorepo ne rende pas tout concerné) ; chaque
  session avec un lien de dashboard qui la rejoue comme la suite.
- Vérifié sur le vrai graphe de demo-ecommerce et ses sessions e2e : bouton
  « Confirmer » → achat en direct ; tableau d'admin → sessions d'admin, pas
  l'achat ; server function `ecommerce.checkout` → achat ; et par le vrai
  serveur MCP en stdio.

Avant ce lot : les indices visuels du rejeu (voile d'onglet, marqueur de clic)
sont marqués `data-replay-cue` et masqués des captures (suite et vignettes).

Rejeu sans dashboard ouvert à la main (fait le 2026-11-07) : le log server
rejoue une session comme la suite (`POST /sessions/:id/suite-replay`, Chromium
caché, actions dispatchées, état recalculé, pas d'image) et le MCP des logs
l'expose (`sessions.replay`, `passed` vrai seulement si tout va au bout, clics
prouvés). La boucle de l'agent : `sessions.relevant` (graph MCP) →
`sessions.replay` (logs MCP) → écarts nommés.

Constat : le Chromium du paquet `playwright` (147) affichait le premier écran
plus lentement que celui de `@playwright/test` (153) ; l'attente de 2 s de
l'élément d'une action était trop courte et repliait le clic en invocation.
Elle est passée à 10 s (`interactionTargetTimeoutMs`) : un élément présent ne
coûte rien, un élément absent après 10 s est un constat.

Prévu à l'origine :

Fichiers modifiés → graphe → adresses touchées → sessions dont la trace les contient.
`craft-ts sessions check --changed` et outil MCP `sessions.relevant` : après une
modification, l'agent rejoue lui-même les 5 sessions concernées et voit les écarts
**nommés** (adresse, route) avant de rendre la main. C'est l'angle « agent-first »
que Meticulous n'a pas.

### Lot 7 — Collecte au-delà du poste (É7) — ⬜ non commencé

Mode distant du log-server (jeton, origines, TLS), contrôle de caviardage bloquant à
l'ingestion, rétention ; preview/staging en premier, jamais la prod par défaut.

## 6. Questions ouvertes

1. **Stockage des sessions sélectionnées** : committées dans le dépôt (simple, revue
   en PR, mais poids et données) ou stockage à part (artefacts CI / dossier ignoré,
   reconstruit à partir du manifeste) ?
2. **Ordre des lots 3 et 4** : la comparaison visuelle d'abord (proposé), ou le mode
   interaction d'abord si le lot 0 montre que le mode invocation laisse passer trop ?
3. **Seuil de bruit** : tranché (2026-11-10) — 2 par défaut, `--noise-runs 3` pour une
   app animée.
4. **Applications cibles du pilote** : `demo-ecommerce` (comptes, admin, scénario de
   rôle refusé) paraît le meilleur terrain ; `demo` en second.

## 7. Risques

- **Faux verts du mode invocation** tant que le lot 4 n'est pas fait : à afficher
  dans chaque rapport (« clics non rejoués »), pas à taire.
- **État serveur hors réseau** (cookies de session, horloge serveur) : bouchonné par
  les réponses enregistrées, donc invisible ; une régression purement serveur n'est
  pas dans le périmètre (comme chez Meticulous).
- **Coût CI** : deux builds et trois rejeux par session ; borné par la taille du jeu
  (viser 30 à 80 sessions par app de démo, pas 500) et le cache de build de base.
- **Données personnelles** dès qu'on sort du poste : le lot 7 ne s'ouvre pas sans
  caviardage vérifié.

## Constat résolu (2026-11-08) : catalogue vide au démarrage d'un rejeu

En suite e2e complète, environ un rejeu sur trois démarrait sur un catalogue vide
(« + Ajouter » introuvable). Trouvé par trace dans la page rejouée :

- `bootstrapCraft` n'attend pas les promesses des initialiseurs : la retenue du
  pont de rejeu ne retenait rien, et une page pouvait monter avant que le
  dashboard envoie la session ;
- sa requête de démarrage tombait alors sur la garde des transports, installée
  au lancement sans adaptateur, qui rejette tout `fetch` : la query du
  catalogue passait en `exception` (`HttpError` statut 0) pour tout le rejeu.

Corrigé : au lancement, le `fetch` du pont est posé par-dessus la garde des
transports et **retient** les requêtes jusqu'à l'installation des réponses
enregistrées, puis les y fait passer. Même chose côté client HTTP Craft : un
appel fait pendant une session de rejeu avant l'installation de ses résultats
attend au lieu d'être rejeté (et échoue, sans jamais partir en réseau, si la
session se termine d'abord).

Deux défauts trouvés en chemin : la coupe de fin gardait le début d'une
opération dont elle retirait la fin (elle recule désormais jusqu'à ce que toute
opération gardée ait son résultat), et un onglet fermé juste après la dernière
réponse pouvait la perdre avant qu'elle atteigne le log server (les helpers e2e
attendent que l'archive cesse de grossir). Mesure : 5 séries golden sur 5 vertes
(20 tests), aucun clic non prouvé, puis la suite complète 8/8.

## Rechargement de page suivi (2026-11-08)

Une page chargée à nouveau (F5, adresse tapée) démarre une nouvelle app dans le
même enregistrement. Le rejeu la suit désormais : `splitPageReloads` fait de
chaque chargement après le premier un onglet virtuel (`<id>~rechargement-N`),
ouvert à l'adresse rechargée au moment du rechargement, l'onglet d'avant se
fermant alors ; le dashboard le rejoue avec sa propre restauration du stockage
navigateur et ses propres réponses enregistrées, sur l'horloge commune des
onglets. La coupe de fin et la couverture du log server ne coupent plus à un
rechargement quand la session a des participants.

Trouvé en chemin : la frame vide d'un onglet programmé déclenchait la poignée de
main avec le pont (son `load` d'`about:blank`), qui échouait au bout de 5 s et
faisait échouer tout rejeu à plusieurs onglets, selon l'ordre des événements.

e2e : un achat avec F5 au milieu se rejoue entier (rien de coupé, aucun clic non
prouvé), et le bouton de confirmation débranché après le rechargement donne
l'écart attendu.

## Mesure sur des sessions faites à la main (2026-11-08)

Deux sessions libres sur demo-ecommerce (417 et 390 actions : recherche,
panier, connexion rapide en admin, édition de produits…), rejouées par le log
server comme la suite (vrais clics, état recalculé).

- **Clics non prouvés : 0** sur les deux sessions, dès le premier rejeu.
- **Écarts : les deux s'arrêtaient** (action 319/417 et 77/390), sur des faux
  écarts : la vérification de l'état n'attendait que 50 tâches avant de
  conclure, alors qu'une connexion (réponse décodée, navigation, page chargée
  en différé) ou une synchronisation du panier prend plus longtemps. Un des
  trois points de comparaison n'attendait même pas du tout.
- Corrigé : les trois points de comparaison attendent l'état jusqu'au temps de
  stabilisation (`settleTimeoutMs`, 2,5 s par défaut) ; un vrai écart est
  signalé un peu plus tard, un faux n'est plus signalé. Les deux sessions se
  rejouent alors en entier (417/417, 390/390), sans clic non prouvé.

Limite : deux sessions, une seule personne. La forme des écarts (asynchrone,
pas les gestes) est le résultat qui compte.

## Sessions combinées (2026-11-10)

Trois parcours enregistrés à la main ont fini dans une seule session (`495a2fb9`, 6 onglets) :
l'identifiant de session est partagé par l'origine (`localStorage`) et le serveur n'en ouvre
une nouvelle que quand la précédente n'enregistre plus ; un onglet de preview laissé ouvert
depuis la veille l'a gardée ouverte, et chaque onglet ouvert ensuite l'a rejointe.

- Fait : `POST /sessions/extract { sessionId, participantIds }` (log-server,
  `DebugSessionStore.extract`) copie des onglets dans une session à eux, terminée, la
  source intacte, avec `extractedFrom`. Un onglet est entier (ses chargements, son
  instantané initial), il se rejoue seul. Les deux onglets humains → `db2b8915` (admin,
  743/743 à chaque rejeu, 8 photos 722×826) et `7e649903` (admin puis panier, 413/413 sur
  5 rejeux, écart 1 fois sur 6). Deux parcours d'un même onglet restent ensemble.
- Constat : les ticks de la promo étaient enregistrés au nom d'un clic. Première piste
  (un service global créé pendant un clic) : vraie en principe, corrigée — un service
  global se construit hors de tout flux (`ɵrunOutsideScheduledContext`) —, mais ce n'était
  pas la cause ici. La cause : le wrapper de corrélation posait la corrélation de début
  (`getCurrentStartCorrelationId`, ce que l'enregistreur lit) pour toute la vie du
  générateur ; suspendu en plein vol (la synchro du panier qui attend le serveur), il la
  laissait au clic, et tout ce qui tournait entre-temps — un tick — était enregistré à son
  nom. Corrigé : posée autour de chaque pas synchrone, rendue pendant la suspension.
- Effet sur les attentes : l'appel que perd le bouton « Confirmer » débranché est
  `cartLines.clear` (la synchro du serveur tourne dedans, elle n'est plus un appel racine
  à part) ; les trois e2e qui l'affirment ont été mis à jour.
- Conséquence : `db2b8915` et `7e649903`, enregistrées avec la fuite, attendent des ticks
  sous des clics et s'écartent maintenant à chaque rejeu (596/743, 318/413) : à
  réenregistrer, sans onglet de preview ouvert.
- Reste : empêcher qu'un onglet oublié garde une session ouverte indéfiniment.

## Sources

- [meticulous.ai](https://www.meticulous.ai/)
- [Glossaire Meticulous](https://app.meticulous.ai/docs/concepts/glossary)
- [Skill « simulate and diff »](https://skills.sh/alwaysmeticulous/skills/meticulous-simulate-and-diff)
- [Skill « cli local »](https://skills.sh/alwaysmeticulous/skills/meticulous-cli-local)
