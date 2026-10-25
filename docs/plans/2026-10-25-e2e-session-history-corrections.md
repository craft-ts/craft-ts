# Plan : corrections de l'historique de sessions e2e

Suite de [debug-session-e2e-session-history.md](debug-session-e2e-session-history.md).
Ce plan corrige ce que la revue du 2026-10-25 a trouvé dans les commits
`f506e2f8f`, `74f4fa774` et `2aa643af3` (fusionnés par `407bda9cd`).

## État de mise en œuvre (25 octobre 2026)

C0 à C6 et C8 à C11 sont faits ; C7 (expurgation) reste reporté. Écarts au plan :

- **C2** : `log-mcp` et `log-server` sont publiés et compilés par `tsc`
  (`rootDir: src`) ; ils ne peuvent importer ni les sources de
  `libs/component` ni une lib privée. Le module est donc un package publié,
  `packages/session-trace` (`@craft-ts/session-trace`), ajouté à la liste de
  release. Le sous-chemin `@craft-ts/component/session-trace`, jamais publié,
  est retiré au lieu d'être réexporté. La validation de `history.json` (C6.5) y
  vit aussi, pour la même raison ; `@craft-ts/playwright-sessions/history` la
  réexporte.
- **C1** : une clé `invocation` sans `replayInvocation` (queries) prend les
  `hostTags` joints avant `host`. Dans l'empreinte d'un état, les chaînes qui
  contiennent un chiffre et les nombres de la taille d'un horodatage sont
  masqués : sinon un id de commande ou un jeton rendrait chaque run « différent ».
- **C3** : « en trop » se compare au nombre **maximal** d'occurrences des runs
  verts (un nombre qu'un run vert a déjà atteint est normal). Les marqueurs ne
  sont jamais des trouvailles : le serveur ne connaît pas ceux de la fixture
  pour le run observé.
- **C8** : le contrat du worker n'a pas eu besoin de `playToEnd` ; `advanceTo`
  jusqu'au total suffit, le snapshot gagne `differenceDetail`. Un rejeu qui
  n'avance plus pendant 10 s est arrêté et rapporté.
- **C9** : chaque test du pilote part du catalogue initial, dans un magasin
  propre sous `tmp/` (le `data/store.json` versionné n'est plus modifié) ; la
  sortie Playwright va dans `tmp/` pour ne jamais salir l'arbre.
- **C10** : le spec du dashboard sert la réponse `/e2e-sessions/compare` par
  `page.route` et vérifie l'événement envoyé à chaque replay ; il ne fait pas
  tourner l'app ecommerce.

Vérifié : les quatre pannes de la revue donnent la bonne première divergence
sur le pilote réel ; deux runs successifs (`CI=1` puis `CRAFT_SESSIONS=update`)
ne modifient aucun fichier ; les historiques ont `dirty: false`.

Reste ouvert : le rejeu de la référence de `shop.checkout` s'arrête le plus
souvent à l'étape 11 sur 17. Le pont de la page rejouée ne répond pas à un
survol pendant un retour accéléré (`seekStepping` reste vrai). Le rapport le
dit ; la conclusion « le front a changé » n'a donc pas pu être vérifiée sur le
pilote.

## Constats de départ

Vérifiés en lançant le normaliseur sur les trois sessions versionnées de
`apps/demo-ecommerce/e2e/__sessions__/` et sur des copies modifiées.

| # | Constat | Preuve |
| --- | --- | --- |
| 1 | Les événements `craft` et `primitive` ne produisent aucun pas. | Un appel craft passé en `failed` : 0 trouvaille. |
| 2 | Toutes les réponses HTTP deviennent `http:GET:/`. | L'événement `succeeded` n'a que `operationId` et `response` ; un 500 sur la commande est rapporté comme `GET /`. |
| 3 | Toutes les server functions deviennent `http:POST:/__server-functions`. | L'identité réelle est `payload.body.id` (`ecommerce.catalog`, `ecommerce.auth.login`…). |
| 4 | Les survols deviennent `hover:enter` sans cible. | 13 pas de bruit sur 35 dans `shop.checkout`. |
| 5 | `packages/log-mcp/src/session-trace.ts` est une copie divergente. | Même session : 15 pas côté lib, 28 côté MCP. |
| 6 | `getSessionWithRetry` peut rendre la session d'un run précédent. | Repli sur « la plus récente du même `testId` » après un 404. |
| 7 | Le pilote ne se lance pas dans ce checkout. | `Cannot find package '@craft-ts/playwright-sessions/architecture'` ; la cible `e2e` dépend de `lint`, rouge pour une autre raison. |
| 8 | La lenteur compare des temps depuis le début de la session. | `elapsedMs` est cumulatif ; un retard au début se propage à tous les pas suivants. |
| 9 | Une requête en double n'est pas signalée. | Toutes les requêtes dupliquées : 0 trouvaille. |
| 10 | La fixture traite la session une fois **par page**. | Boucle `fixture.ts:75` : enregistrement, comparaison et pièces jointes répétés. |
| 11 | `dirty` vaut `true` dans les 3 historiques. | Les fichiers `__sessions__` salissent eux-mêmes l'arbre. |
| 12 | Un test `skipped` est comparé. | Condition `status !== 'passed'`. |
| 13 | La règle ESLint signale `test.skip(cond, '…')` et `test.describe.skip(...)`, et laisse passer `keep: KEEP`. | Vérifié par `ESLint.lintText`. |
| 14 | Le marqueur de la première étape est perdu. | « ouvrir la boutique » absent de `shop.checkout`. |
| 15 | Des secrets sont versionnés (**reporté**, voir la dernière section). | Mot de passe en clair dans un corps de requête, token d'authentification non expurgé dans une réponse. |
| 16 | Le rejeu de la référence conclut trop fort et dépend d'un libellé d'interface. | Le replay n'exécute pas les gestionnaires DOM ; clic sur « Lecture à vitesse réelle ». |
| 17 | Les tests du pilote prouvent peu. | Aucune assertion après le clic dans `admin.edit-product` ; deux participants non vérifiés ; `shop.checkout` teste aussi le dashboard. |

Forme réelle des événements, relevée dans `shop.checkout` :

```jsonc
// http, début : la requête
{ "kind": "http", "phase": "started", "operationId": "fetch-1",
  "payload": { "method": "POST", "url": "http://localhost:4205/__server-functions",
               "body": "{\"id\":\"ecommerce.catalog\",\"input\":{}}" } }
// http, fin : seulement la réponse (le corps est une chaîne JSON encodée deux fois)
{ "kind": "http", "phase": "succeeded", "operationId": "fetch-1",
  "response": { "status": 200, "body": "\"{\\\"categories\\\":[…]}\"" } }
// appel craft
{ "kind": "craft", "phase": "started" | "succeeded" | "failed", "operationId": "craft-call-5",
  "name": "method:add",
  "payload": { "host": "method:add",
               "replayInvocation": { "address": "service:cart / state:cartLines / method:add" } } }
// état des primitives : une carte adresse → valeur, sans payload
{ "kind": "primitive", "phase": "emitted", "state": { "service:cart / state:cartLines / state:cartLines#1": [] } }
// navigation : début avec l'URL, fin sans
{ "kind": "navigation", "phase": "started", "operationId": "navigation-…", "payload": { "url": "/panier" } }
{ "kind": "route-activation", "phase": "succeeded", "payload": { "routePath": "catalogue", "outcome": "activated" } }
// interaction
{ "kind": "dom", "payload": { "interactionName": "EcommerceCataloguePage:button:add-product:click",
                              "replayTarget": { "componentPath": ["da741a739827318f"] } } }
```

Phases possibles (`SendContextEventPhase`) : `started`, `emitted`, `succeeded`,
`failed`. Il n'y a pas de phase `aborted`, que le normaliseur actuel teste.

## Ordre

```
C0 ─┬─ C1 ─── C2 ─── C3 ─┬─ C9
    │                    └─ C10
    ├─ C4
    ├─ C5
    ├─ C6
    └─ C8
```

C1 à C3 sont le cœur : sans eux, l'historique ne sert pas au diagnostic. C4,
C5, C6 et C8 sont indépendants entre eux. C9 réenregistre les historiques une
fois les formats stabilisés. Un commit par lot. L'expurgation des secrets (C7)
est reportée : les données du pilote sont fictives.

---

## C0 — Débloquer le pilote

**Problème** : constat 7.

1. Créer le lien du workspace (`npm install` à la racine) et vérifier
   `node_modules/@craft-ts/playwright-sessions -> ../../libs/playwright-sessions`.
2. Ajouter `@craft-ts/playwright-sessions` et
   `@craft-ts/playwright-sessions/architecture` aux `paths` de
   `tsconfig.base.json`, comme `@craft-ts/component/session-trace`. Un checkout
   sans `npm install` récent résout alors quand même le package, pour tsc et
   pour le chargeur TypeScript de Playwright.
3. Cible `e2e` de `apps/demo-ecommerce/project.json` : dépendre de
   `architecture` et d'une nouvelle cible `lint-e2e` (`lintFilePatterns` :
   `apps/demo-ecommerce/e2e/**/*.ts`), pas de `lint` entier. Un problème de lint
   dans `src/` ne doit pas empêcher de lancer les e2e.

**Fini quand** : `npx nx run demo-ecommerce:architecture` est vert dans ce
checkout ; `npx nx run demo-ecommerce:e2e` démarre Playwright même si
`demo-ecommerce:lint` est rouge.

---

## C1 — Normaliseur v2

**Problème** : constats 1 à 4 et 14.

**Fichier** : `libs/component/src/lib/ai/debug-session-trace.ts` (ou la lib
dédiée décidée en C2). `SessionTrace.schemaVersion` passe à 2.

### Principe

1. **Indexer par `operationId` d'abord.** Un premier passage regroupe
   `started` et sa fin (`succeeded`/`failed`) par `operationId`. Une opération
   donne **un** pas, positionné à son début, qui porte :
   - l'identité, prise sur l'événement `started` ;
   - l'issue et le détail, pris sur l'événement de fin ;
   - `durationMs = fin.globalElapsedMs − début.globalElapsedMs` ;
   - une opération sans fin donne `outcome: 'pending'`.
2. **Une table par `kind`**, sans expression régulière. Un `kind` absent de la
   table est ignoré **et compté** dans `trace.ignored: Record<kind, number>`,
   pour qu'un trou de couverture se voie au lieu de passer en silence.

| `kind` | Pas | `key` | `detail` comparé |
| --- | --- | --- | --- |
| `http` (opération) | `http` | `http:<MÉTHODE>:<chemin>`, ou `server-fn:<body.id>` si le chemin est celui des server functions | `status`, `outcome` (`ok` / `error` si `failed` ou statut ≥ 400 / `pending`), clés du corps de réponse après double décodage |
| `craft` (opération) | `invocation` | `invocation:<replayInvocation.address>` (repli : `payload.host`, puis `name`) | `outcome` (`succeeded` / `failed` / `pending`), tag d'exception si `failed` |
| `navigation` (opération) | `route` | `route:<chemin de l'URL de début>` | clés de query triées, `outcome` |
| `route-activation` | `route` | `route-activation:<routePath>` | `payload.outcome` |
| `primitive` | `checkpoint` | `checkpoint:<adresse>` (un pas par adresse présente dans `state`) | empreinte de la valeur |
| `dom` | `interaction` | `interaction:<interactionName>` | valeur de champ si capturée |
| `custom` avec `name === 'test-marker'` | `marker` | `marker:<label>` | — |
| `hover`, `performance`, `storage`, `component-lifecycle`, `participant` | ignorés (comptés) | | |

3. **État des primitives** : n'émettre un pas `checkpoint` que si la valeur
   d'une adresse **change** par rapport à la précédente vue dans la session.
   Sinon chaque notification produirait un pas identique.
4. **Server functions** : le chemin est configurable
   (`normalizeSessionTrace(session, { serverFunctionPaths: ['/__server-functions'] })`,
   valeur par défaut). L'id vient de `JSON.parse(payload.body).id`.
5. **Clés de `ignored` et pas `exception`** : un événement `failed` de n'importe
   quelle opération produit, en plus de son pas, aucune duplication ; c'est le
   `detail.outcome` qui porte l'échec. Le type de pas `exception` est réservé
   aux erreurs globales si la capture en émet (à confirmer au début du lot en
   cherchant les `capture('…', 'failed'` et les erreurs non gérées).
6. **Marqueurs d'étape** (constat 14) : `normalizeSessionTrace` accepte
   `{ markers: readonly { label: string; at: number }[] }` (horodatage
   `Date.now()` côté Node). Ils sont insérés par horodatage, en plus des
   événements `test-marker` de la page. La fixture enregistre ses propres
   marqueurs (C4), qui ne dépendent plus d'une page chargée.
7. **Empreinte** : `hash` couvre `[key, detail]` dans l'ordre, ni temps ni
   `eventId`.

### Compatibilité des historiques existants

Ne pas faire confiance au `traceHash` stocké : les sessions complètes sont
versionnées, donc la trace se **recalcule** à la lecture (`readBaselines` et la
déduplication de `recordRun`). `HistoryRun` gagne `traceSchemaVersion` ; un run
de version différente est recalculé avant comparaison. Aucune migration de
fichier.

### Tests

Dans `debug-session-trace.spec.ts`, avec les trois sessions versionnées
**copiées** en fixtures de spec (`libs/component/src/lib/ai/__fixtures__/`,
pour qu'un réenregistrement du pilote ne casse pas les tests) :

- `shop.checkout` contient `server-fn:ecommerce.catalog`,
  `invocation:service:cart / state:cartLines / method:add`, au moins un
  `checkpoint:service:cart / …`, aucune clé `http:GET:/`, aucun pas `hover` ;
- `trace.ignored` liste `hover`, `performance`, `storage`…;
- un appel craft passé en `failed` → `outcome: 'failed'` sur le bon pas ;
- la dernière server function passée en 500 → pas `server-fn:<id de la
  commande>` avec `status: 500`, `outcome: 'error'` ;
- une opération sans fin → `outcome: 'pending'` ;
- une valeur de primitive inchangée n'ajoute pas de pas ;
- un marqueur fourni par horodatage s'insère au bon endroit ;
- deux normalisations de la même session donnent la même empreinte.

**Fini quand** : ces tests passent et `shop.checkout` donne une trace lisible
de bout en bout (catalogue → ajout panier → panier → paiement → commande).

---

## C2 — Un seul normaliseur

**Problème** : constat 5.

1. Supprimer `packages/log-mcp/src/session-trace.ts`.
2. `packages/log-mcp` importe le normaliseur et le comparateur partagés.
   Décision à prendre au début du lot, selon ce que la résolution permet :
   - **par défaut** : importer `@craft-ts/component/session-trace`, si
     `log-mcp` peut le résoudre à l'exécution (vérifier comment le serveur MCP
     est lancé et compilé) ;
   - **sinon** : extraire les deux fichiers dans une petite lib pure
     `libs/session-trace` (`@craft-ts/session-trace`, sans dépendance), que
     `@craft-ts/component` réexporte sous `./session-trace` pour ne rien casser.
3. Un spec `environment: 'node'` importe le module partagé et vérifie qu'il ne
   touche ni `window` ni `document`.
4. Le spec MCP existant compare le résultat de `sessions.compare` à celui de
   `compareSessionTraces` appelé directement sur les mêmes fichiers.

**Fini quand** : `rg "function normalizeSessionTrace"` ne trouve qu'une
définition ; les specs du MCP, du dashboard et de la fixture passent.

---

## C3 — Comparateur v2

**Problème** : constats 8 et 9, rapport Markdown trop pauvre.

**Fichier** : `debug-session-trace-compare.ts`.

1. **Occurrences en trop** : après l'alignement, un pas observé sans
   correspondance mais dont la clé est connue devient
   `{ kind: 'extra-occurrence', observed, expectedCount, observedCount }`.
   Les compteurs se calculent par clé : nombre minimal dans les références
   contre nombre observé. Sévérité `error` pour `http`, `server-fn` et
   `invocation`, `info` sinon.
2. **Durées** : la lenteur se mesure sur `durationMs` (C1), pas sur
   `elapsedMs`. Pour les pas sans durée (interactions, marqueurs), on mesure
   l'écart avec l'invariant aligné précédent. Seuil inchangé :
   `observé > 2 × max(références)` **et** `observé > max + 500 ms`.
3. **Ordre** : `findings` est trié dans l'ordre du run observé (position des
   pas observés ; les invariants absents sont placés après le dernier pas
   observé aligné qui les précède). `firstDivergence` suit cet ordre.
4. **Bruit** : un pas aligné partout dont certains champs varient entre
   références garde ces champs hors comparaison (déjà fait) ; un pas absent
   d'au moins une référence est du bruit (déjà fait). `noise` donne aussi le
   nombre d'occurrences par clé.
5. **Alignement** : remplacer la table pleine (mémoire proportionnelle à
   `n × m`) par un diff de Myers, linéaire en mémoire et rapide quand les
   traces se ressemblent. Garder la même interface `lcsPairs`.
6. **Rapport Markdown** (`renderSessionTraceComparison`) :
   - en-tête : nombre de références, test, projet ;
   - première divergence détaillée (attendu / observé, avec les champs en
     cause) ;
   - liste de toutes les trouvailles groupées par type, 20 au plus avec
     « et N autres » ;
   - nombre de pas de bruit ;
   - lien vers la vue de comparaison du dashboard (`dashboardUrl` passé dans le
     contexte) ;
   - avertissement « une seule référence » quand c'est le cas.

### Tests

- requête doublée → `extra-occurrence` (le cas « 0 trouvaille » de la revue) ;
- un pas lent au début ne rend pas lents les pas suivants ;
- trois références dont une varie sur un champ → ce champ n'est pas comparé ;
- un pas présent dans 2 références sur 3 → bruit ;
- ordre des trouvailles = ordre du run observé ;
- traces de 5 000 pas : comparaison en moins d'une seconde ;
- rendu Markdown figé (snapshot) sur un cas à plusieurs trouvailles.

**Fini quand** : les quatre pannes simulées de la revue (appel craft en échec,
500 sur la commande, clic manquant, requêtes doublées) produisent chacune une
première divergence juste et lisible.

---

## C4 — Fixture : une session par test, une seule fois

**Problème** : constats 6, 10, 11, 12, 14.

**Fichier** : `libs/playwright-sessions/src/fixture.ts` (à découper : la
logique de fin de test va dans `src/finalize.ts`, testable sans navigateur).

1. **Fin de test en deux temps** :
   1. appeler `finish()` sur **toutes** les pages encore ouvertes de tous les
      contextes ; collecter les ids effectifs ;
   2. dédupliquer les ids, puis récupérer, enregistrer ou comparer **une fois
      par id**. Avec un seul id attendu (cas normal), plusieurs ids distincts
      sont signalés dans le rapport (« la session a été coupée en N »).
2. **Plus de repli sur un autre run** : supprimer la recherche par `testId`.
   Après un 404, réessayer le même id jusqu'au délai, puis échouer avec un
   message qui cite l'id. En complément, le serveur garde l'UUID de la
   tentative (`test.runId`, ajouté aux métadonnées) et
   `GET /sessions?testId=…&runId=…` filtre exactement.
3. **Pages fermées par le test** : retenir l'id de chaque page dès qu'elle a
   envoyé `session:ready` (`page.on('close')` lit l'id déjà connu, mis à jour
   par `exposeBinding` ou par une lecture après chaque navigation). Une page
   fermée n'empêche plus de retrouver sa session.
4. **Statuts** : comparer seulement pour `failed`, `timedOut` et
   `interrupted`. `skipped` ne fait rien.
5. **`dirty`** : `git status --porcelain -- . ':(exclude)**/__sessions__/**'`,
   lu une fois par worker. `gitSha()` et `dirty` rendent `'unknown'` / `false`
   hors d'un dépôt git au lieu de lever une erreur.
6. **Marqueurs** : `craftSessions.step` enregistre `{ label, at: Date.now() }`
   côté fixture, toujours, et appelle aussi `mark()` dans les pages qui ont
   l'API. Les marqueurs de la fixture sont passés à `normalizeSessionTrace` et
   stockés dans l'entrée d'historique (`HistoryRun.markers`).
7. **Pièces jointes** : noms uniques par session
   (`craft-session-diff-<id court>.md` quand il y en a plusieurs).
8. **Option `store`** : la supprimer. Une seule convention
   (`<testDir>/__sessions__`) que le test d'architecture et le log-server
   connaissent. À rétablir seulement si un besoin réel apparaît.
9. Nettoyer : imports en double, `void craftSessionsOptions`, `pages` inutilisé,
   casts `as never` remplacés par le type `PortableSessionForTrace`.

### Tests (vitest, `finalize.ts` avec un faux client HTTP)

- deux pages, un même id → un seul `recordRun` ;
- deux ids distincts → avertissement dans le rapport ;
- 404 puis 200 sur le même id → session rendue ; 404 permanent → erreur qui
  cite l'id ; jamais de session d'un autre run ;
- `skipped` → ni comparaison ni pièce jointe ;
- `dirty` ignore `__sessions__`.

**Fini quand** : sur le pilote, deux runs verts successifs ne modifient aucun
fichier et les entrées d'historique ont `dirty: false` sur un arbre propre.

---

## C5 — Règle ESLint

**Problème** : constat 13, chemin d'import comparé mot pour mot.

**Fichier** : `libs/dev-tools/src/eslint-rules/e2e-session-contract.cjs`.

1. **Appels qui ne déclarent pas de test** : ne pas exiger d'annotation pour
   - `test.skip()`, `test.fixme()`, `test.slow()` sans argument ;
   - `test.skip(condition)` et `test.skip(condition, 'raison')`, c'est-à-dire
     quand le premier argument n'est pas une chaîne et qu'aucun argument n'est
     une fonction ;
   - `test.describe(...)` et ses variantes (`.skip`, `.only`, `.fixme`,
     `.serial`, `.parallel`, `.configure`).
2. **Annotation sur un `describe`** : la refuser explicitement avec un message
   (« l'annotation craftSession se pose sur chaque test, pas sur le groupe »),
   car un id hérité par plusieurs tests serait dupliqué.
3. **`keep` et `reason` non littéraux** : les signaler (`keep` doit être un
   entier littéral, `reason` une chaîne littérale), au lieu de les traiter
   comme `1` et absent.
4. **Module de fixture** : option `fixtureFiles` (chemins depuis la racine du
   projet ESLint, par exemple `['apps/demo-ecommerce/e2e/fixtures.ts']`). Le
   chemin d'import est résolu par rapport au fichier lint (avec ou sans
   extension, `index.ts`) et comparé au chemin absolu. `fixtureModules` reste
   accepté pour les noms de package.
5. **Ids en gabarit dans une boucle** : accepter `` id: `orders.${name}` `` quand
   toutes les expressions sont des variables de la boucle `for…of`
   englobante, comme prévu au plan initial.
6. Suggestion (pas d'autofix) qui insère
   `{ annotation: craftSession({ id: '<slug du titre>' }) }`.

### Tests

Un cas valide et un cas invalide par point, plus les deux faux positifs de la
revue et `keep: KEEP`.

**Fini quand** : la règle passe sur `apps/debug-session-dashboard/e2e` avec
`allowManualContexts: true` sans autre signalement que les tests réellement
sans annotation.

---

## C6 — Test d'architecture

**Problème** : unicité limitée à une config, pas de cas négatifs, contrôles
prévus non faits.

**Fichier** : `libs/playwright-sessions/src/architecture.ts`.

1. **Découverte des configs** : `findCraftSessionConfigs(workspaceRoot)` liste
   les `playwright.config.ts` du dépôt (hors `node_modules`, `.claude/worktrees`,
   `dist`, `tmp`) dont le `testDir` contient un import de la fixture. Le spec du
   pilote les vérifie toutes : l'unicité des ids devient réellement globale.
2. **Identité d'un test** : chemin absolu du fichier + chemin de titres, pour
   que deux apps qui ont chacune un `checkout.spec.ts` ne se confondent pas.
3. **Retry** : avertissement (sortie console, non bloquant) pour un test
   `keep: 1` dont l'historique contient un run `retry > 0`.
4. **Budgets** inchangés, mais calculés une fois par dossier de test.
5. Factoriser : la validation de `history.json` du log-server
   (`readE2eHistory`) et celle du package (`isHistory`) deviennent une seule
   fonction exportée par `@craft-ts/playwright-sessions/history` (pure, sans
   Playwright).

### Tests

Sortie `--list` et dossiers fabriqués dans un répertoire temporaire :

- id dupliqué entre deux configs ;
- même nom de fichier dans deux apps, ids différents → accepté ;
- dossier orphelin, projet inconnu, `keep` différent, fichier non référencé,
  session manquante, budget dépassé ;
- retry sur un test `keep: 1` → avertissement, pas d'échec.

**Fini quand** : chaque invariant a un test qui échoue pour la bonne raison.

---

## C8 — Rejeu de la référence

**Problème** : constat 16.

1. **Piloter le dashboard par le contrat du worker de miniatures**
   (`__craftReplayWorker`, `?replay-worker=1`) au lieu de cliquer sur
   « Lecture à vitesse réelle » et de lire `data-replay-state`. Si le contrat
   ne permet pas de « jouer jusqu'au bout et rendre l'état final », l'étendre
   (`playToEnd(): Promise<{ status: 'completed' | 'diverged' | 'error'; difference?: … }>`)
   avec un spec côté dashboard.
2. **Conclusion juste**. Texte quand la référence rejoue sans écart :

   > La référence verte rejoue sans écart sur le build courant, avec les
   > réponses enregistrées. L'écart vient soit des réponses réelles (données,
   > back, environnement), soit de l'interaction elle-même : le replay appelle
   > les méthodes enregistrées sans passer par les gestionnaires de clic, il ne
   > vérifie donc pas qu'un bouton est toujours branché.

   Texte quand elle diverge : « le front a changé ce parcours » suivi de la
   première différence du replay.
3. Le résultat est aussi écrit dans `craft-session-diff.json`
   (`baselineReplay: { status, difference? }`) pour le MCP et le dashboard.
4. Le délai reste borné (60 s) et ne rallonge pas silencieusement le test :
   s'il est dépassé, le rapport le dit.

**Fini quand** : sur le pilote, une panne de l'API (réponse 500 injectée par
`page.route`) donne « rejoue sans écart », et une régression front volontaire
(méthode `add` qui n'ajoute plus rien) donne « le front a changé ».

---

## C9 — Tests du pilote et réenregistrement

**Problème** : constat 17, historiques produits avec l'ancien format.

1. `admin.spec.ts` : vérifier l'effet du clic (le stock affiché augmente de 1).
2. `multicontext.spec.ts` : vérifier par `GET /sessions?testId=admin.multicontext&runId=…`
   que la session a deux participants.
3. `checkout.spec.ts` : retirer la partie dashboard. Le parcours d'achat ne
   teste que la boutique.
4. Nouveau spec `apps/debug-session-dashboard/e2e/e2e-comparison.spec.ts` (avec
   `allowManualContexts`) : il fabrique un historique dans un dossier
   temporaire, sert une session observée modifiée (500 sur la commande), ouvre
   `#/compare` et vérifie la première trouvaille affichée et le positionnement
   des deux replays.
5. Port du dashboard du pilote : `4212`, distinct de la config e2e du dashboard
   (`4211`).
6. Supprimer les trois historiques, réenregistrer avec
   `CRAFT_SESSIONS=update npm run e2e:demo-ecommerce` sur un arbre propre,
   relancer une fois pour vérifier qu'aucun fichier ne change, commiter.

**Fini quand** :

```bash
CI=1 npm run e2e:demo-ecommerce        # vert, aucun fichier modifié
CRAFT_SESSIONS=update npm run e2e:demo-ecommerce && git status --short apps/demo-ecommerce/e2e/__sessions__   # vide
```

---

## C10 — Vue de comparaison du dashboard

**Problème** : positionnement au prorata du temps, JSON brut, casts.

1. **Positionner sur l'événement** : le message `craft-e2e-replay` porte
   `eventId` au lieu de `progress`. La page de replay cherche l'index de
   l'événement dans la session chargée et s'y place (`seekReplayToShare`
   reçoit l'index, ou une nouvelle fonction `seekReplayToEvent`). Pour un
   invariant absent du run observé, le replay observé se place sur le dernier
   pas aligné qui le précède.
2. **Trouvailles lisibles** : libellé français par type (« Absent du run »,
   « Valeur différente », « Nouveau », « En trop », « Plus lent »), clé, champs
   en cause ; la première divergence est mise en avant. Le JSON brut passe dans
   un `details` fermé.
3. **Types** : un décodeur de la réponse `/e2e-sessions/compare` (comme les
   autres entrées de `replay-model.ts`) remplace les `as`, conformément au
   README du dashboard (« aucune assertion de type »).
4. **Serveur** : `/e2e-sessions/compare` peut rendre la comparaison calculée
   (même module qu'en C2) en plus des sessions, pour que le dashboard et le MCP
   affichent exactement la même chose. Le dashboard garde le calcul local en
   repli.
5. Uniformiser les expressions de validation du nom de projet entre les trois
   endpoints `/e2e-sessions` et ajouter les en-têtes CORS sur les réponses 404.

**Fini quand** : le spec de C9 point 4 vérifie qu'un clic sur la première
trouvaille place les deux replays sur l'événement attendu, et
`nx run debug-session-dashboard:lint`, `:architecture` et
`:typecheck-architecture` sont verts.

---

## C11 — Détails

- SHA-256 écrit à la main : ajouter les vecteurs de test standard (`"abc"`,
  message de 448 bits, 1 000 000 × `"a"`) ou le remplacer par une
  implémentation reconnue si la lib accepte une dépendance.
- `recordRun` : retirer le `replace(/Z$/, 'Z')` sans effet.
- README de `libs/playwright-sessions` : mettre à jour (option `store` retirée,
  modes, marqueurs, expurgation, lecture du rapport).
- Plan initial : noter en tête l'état réel de mise en œuvre et renvoyer vers ce
  plan.

---

## Vérification finale

```bash
npx vitest run --config libs/playwright-sessions/vitest.config.ts
npx vitest run --config libs/dev-tools/vitest.config.mts libs/dev-tools/src/eslint-rules/e2e-session-contract.spec.ts
npx vitest run --config libs/component/vitest.config.ts libs/component/src/lib/ai/debug-session-trace.spec.ts
npx vitest run --config apps/log-server/vitest.config.mts
(cd packages/log-mcp && npx vitest run)
npx nx run demo-ecommerce:architecture
npx nx run demo-ecommerce:lint-e2e
npx nx run debug-session-dashboard:architecture
CI=1 npm run e2e:demo-ecommerce
npm run e2e:debug-session -- --project=chromium e2e/e2e-comparison.spec.ts
```

Puis les quatre pannes simulées de la revue, rejouées sur le pilote réel :

| Panne | Comment la provoquer | Première divergence attendue |
| --- | --- | --- |
| Appel craft en échec | `cart.add` lève une erreur | `invocation:service:cart / state:cartLines / method:add` · `outcome: failed` |
| Server function en 500 | `page.route` sur la création de commande | `server-fn:<id de la commande>` · `status: 500` |
| Clic manquant | retirer le clic « Confirmer la commande » du test | `interaction:EcommerceCheckoutPage:button:confirm-order:click` absent |
| Requête doublée | appeler deux fois le chargement du catalogue | `server-fn:ecommerce.catalog` en trop |

---

## Reporté — C7, secrets dans les sessions versionnées

Pas gênant pour l'instant : les sessions du pilote ne contiennent que des
données fictives (comptes de démonstration, tokens générés à chaque run). À
reprendre avant d'utiliser le mécanisme sur une application aux données réelles.

Ce qui était prévu, pour mémoire :

- **Expurger à l'écriture dans l'historique**, pas à la capture : la capture et
  le replay local gardent leur contrat, seules les sessions qui partent dans
  git sont nettoyées (`redactSessionForHistory`, dans
  `libs/playwright-sessions/src/redact.ts`).
- Clés visées : `password`, `passwd`, `secret`, `token`, `authorization`,
  `cookie`, `set-cookie`, plus une option `redactKeys`. Parcourir aussi les
  chaînes qui contiennent du JSON, y compris encodé deux fois comme
  `response.body`. Correspondance de clé exacte, insensible à la casse.
- Expurger **avant** la normalisation, pour que l'empreinte ne dépende pas d'un
  token aléatoire.
- Vérifier qu'une référence expurgée rejoue encore dans le dashboard.
- Ajouter au test d'architecture (C6) un contrôle qui refuse toute session
  stockée contenant une de ces clés avec une valeur autre que `[REDACTED]`.

Une conséquence à garder en tête d'ici là : un token qui change à chaque run se
retrouve dans les corps de réponse. Si C1 compare un jour la **valeur** des corps
(il ne compare que leurs clés), chaque run deviendrait « nouveau ». Le plan C1
ne compare que les clés, donc ce n'est pas un problème aujourd'hui.
