# Écritures non groupées : rapport d'inventaire

Date : 2026-10-07. Branche `fix/batched-linked-writes` (issue de `7a005c346`, au-dessus de `feat/storm-ui`).
Explication du défaut et règle : [`ecritures-groupees.md`](./ecritures-groupees.md).

Portée : `libs/core` et `libs/component`, fouillés à la main ; `libs/docs-ui`, `libs/effect`, `libs/i18n*`,
`libs/style`, `apps/docs-herbier` passés au détecteur seulement (voir « Ce qui n'a pas été vérifié »).

**Méthode.** Un détecteur (script jetable) liste les grappes de deux `.set(`/`.update(` à moins de 8 puis
25 lignes l'une de l'autre, hors specs : une soixantaine de grappes dans `core`/`component`. Chacune a été lue. Pour
chaque candidat retenu, un **témoin** (effet qui note ce qu'il voit à chaque exécution) a été écrit **et
lancé sur le code non corrigé** avant le correctif. Un dernier contrôle a été fait par mesure dynamique
(compte d'exécutions de template par composant, voir `ecritures-groupees.md` §6).

Classement : **bug réel** (un lecteur observe un état mêlé), **bug mineur** (idem, mais seulement par l'API
publique, aucun lecteur interne), **surcoût** (travail redondant sans état faux), **faux positif**
(justifié).

## 1. Corrigés : un commit par cas

| # | Cas | Fichier : lignes (HEAD) | Lecteur concerné | Classement | Test (échoue avant) | Commit |
|---|-----|-------------------------|------------------|------------|---------------------|--------|
| 1 | Outlet du routeur : publication d'une page | `libs/core/src/lib/craft-router-outlet.ts:614` (commit), `:330` (page réutilisée), `:545` (data sinks), `:872` (exception sinks), `:464` (étape « blank »), `:688` (composant d'erreur et sa cible), `:300` (désactivation), `:433` et `:669` (composant et état « loaded », route simple et route à garde) ; suppression de l'écriture précoce de `displayedProps` | `CraftRouterOutlet` lit cible + props + injecteur dans un seul template ; les autres par l'API publique | **bug réel** (commit, réutilisation) ; **bug mineur** (autres) | `craft-router-outlet-batch.spec.ts` (2), `craft-router-outlet.spec.ts` (+6), `craft-router-outlet-page-swap.spec.ts` (composant réel) | `208fe2db0` |
| 2 | Champ de formulaire : valeur, `dirty`, `touched`, ancêtres | `libs/core/src/lib/form/craft-field.ts:420-507` (`set`, `propagateDirty/Touched`, `markTouched/Untouched/Dirty/Pristine`, `resetCascade`, `reset`) ; `form/insert-form-internals.ts:349,354` (`SubmissionController`) | tout lecteur de `value()` + `dirty()`/`touched()` d'un champ ou de son parent | **bug réel** (champs) ; **bug mineur** (contrôleur de soumission) | `form/craft-field-batch.spec.ts` (6), `form/submission-controller-batch.spec.ts` (2) | `0036706d9` |
| 3 | `queryParams` : état et exceptions de parse | `libs/core/src/lib/query-params.ts:510` | lecteur de `state()` et de `exceptions()` | **bug réel** | `query-params-batch.spec.ts` | `2559c6d09` |
| 4 | `resourceById` : remplacement des enregistrements | `libs/core/src/lib/resource-by-id.ts:304` (`reset`), `:312` (`resetResource`), `:322` (`set`, donc `update`) | lecteur de `state()` | **bug réel** (clés à moitié remplacées) | `resource-by-id-batch.spec.ts` (3) | `1a8d24eee` |
| 5 | Historique de machine : entrée et curseur | `libs/core/src/lib/craft-machine-history.ts:361` (`append`) | `canGoForward()` / `canGoBack()` | **bug réel** | `craft-machine-history.spec.ts` (+1) | `842515181` |
| – | Sémantique de `craftBatch` (pas un correctif) | `libs/core/src/lib/host/craft-batch.spec.ts` | — | tests de la sémantique | 6 tests | `4609ff700` |

Ce que chaque témoin a vu **avant** le correctif :

1. Outlet, page A → page B : `['PageA:2:i0', 'PageA:2:i1', 'PageA:2:i1', 'PageB:2:i1']` (A avec les props de B, puis avec
   l'injecteur de B, deux fois). Dans le vrai rendu, `PageA` est **dessinée 3 fois** avec le paramètre de B
   (`['PageA:2','PageA:2','PageA:2', …]`) avant que B n'apparaisse. Page réutilisée : `['1/2', '2/2']` (props 1, match 2).
   Les six autres sites du cas : chacun voyait deux observations (`true|false`, `guard/undefined`, `null/first`, …).
2. Champ : `set` vu comme `a@b.c|false|false` (nouvelle valeur, champ pristine, parent pristine) puis `a@b.c|true|false` ;
   `reset` vu en **6 états successifs**, la valeur déjà remise alors que le formulaire restait `dirty` et `touched` ;
   enfant touché sous un parent qui ne l'est pas. Contrôleur : `true|false` (soumission en cours sans tentative).
3. `queryParams`, `?page=2` → `?page=oops` : `['2|1', '1|1']` (page 2 à côté de l'exception de la nouvelle URL).
4. `resourceById`, {1,2} → {2,3} : clés vues `1,2`, `2`, `2,3` ; `reset()` : `1,2`, `1,2`, puis vide.
5. Historique, après une transition : `['false|true', 'true|false']` (`canGoForward()` vrai un instant, sans suite).

### Décisions de portée prises dans le cas 1

- L'écriture précoce `displayedProps.set(collectMatchProps(match))` de `finishActivation` est **supprimée** : le commit
  publie les mêmes props avec la page, et seul `CraftRouterOutlet` les lit. Elle donnait à la page quittée les props de la suivante.
- Aucun lot n'englobe `showComponent` (`:589-657`) : son commit appelle `syncTemplateFlush()` **après** avoir publié,
  et ce flush doit voir l'état publié. Un lot extérieur ferait passer le flush avant la publication quand
  `startViewTransition` rappelle son callback tout de suite.

## 2. Faux positifs, justifiés

| Fichier : ligne | Pourquoi ce n'est pas le défaut |
|-----------------|---------------------------------|
| `libs/core/src/lib/craft-resource.ts:58,78,110,142,170,245,265` | Déjà tous dans un `craftBatch` (valeur + statut + erreur). C'est l'origine de `craftBatch` (`5c95e956d1`). |
| `libs/core/src/lib/async-process.ts:1732`, `mutation.ts:2028` | Nonce du déclencheur et paramètres déjà regroupés. |
| `libs/core/src/lib/query.ts:2190-2195` | Même paire, protégée par l'**ordre** (paramètres, puis déclencheur en dernier) : aucun lecteur ne voit le déclencheur avant ses paramètres. Équivalent à un lot. |
| `libs/component/src/lib/render/interpreter.ts:1393,2437,2519,2616,2890,2958,3809` (`descriptor.set(node)`) | `for`, `if`, `match`, `defer`, `pending`, `catch`, champ d'erreur : **un seul signal** (le descripteur) par patch. `for` ne garde l'item et l'index que dans des champs ordinaires et crée un effet neuf par entrée à redessiner (`:2781`). |
| `interpreter.ts:921` (`inputs.set`), `:3839,3843` (`sourcesVersion.update`) | Un signal chacun. |
| `interpreter.ts:4887` | C'est le correctif d'origine (entrées + propriétés d'hôte dans un lot). |
| `libs/core/src/lib/craft-router-outlet.ts:453` (`state 'stay'`), `:822-823` (`pendingComponent`/`pendingTarget`) | Un signal à la fois ; `pendingComponent` vaut toujours `null`. Aucun lecteur interne. |
| `libs/core/src/lib/craft-router-tokens.ts:161-171` | `match.set` puis `history.replace` : deux systèmes différents, une étape voulue. |
| `libs/core/src/lib/preserved-resource.ts:28-30` | Signal Craft et miroir Angular : deux systèmes réactifs ; la recopie passe par un effet (voir § 3). |
| `libs/core/src/lib/local-storage-persister.ts:278,333` | Une seule écriture de signal (`queriesMap.update`), le reste est du `Map.set`. |
| `libs/core/src/lib/form/craft-field.ts:552,556` (`schemaErrorRevision`) | Un signal par enregistrement ; `bumpRevision` est volontairement différé en microtâche. |
| Grappes de `Map.set` : `interpreter.ts:826,844,851,1684,1694,2044,2057,2167,2720,3564,3607,3926,3953,3976,5606`, `string-dom.ts`, `hydration.ts`, `ssr-coordinator.ts`, `craft-primitive-registry.ts:99-102`, `craft-service.ts:3440-3450,4067-4074`, `craft-injector.ts:380-392`, `style-scope.ts`, `craft-load-retry.ts`, `lambda-adapter.ts` (`Headers.set`), `libs/style/src/lib/styles.ts` | Ce ne sont pas des signaux : aucun effet ne s'exécute. |
| `libs/core/src/lib/craft-state-machine-runtime.ts:266,276` | Un seul signal (`currentStep`) par appel. |

## 3. Laissé tel quel, avec la raison

| Fichier : ligne | Pourquoi on ne regroupe pas |
|-----------------|-----------------------------|
| `libs/core/src/lib/craft-machine-history.ts:401` (`goTo`) | La restauration s'exécute sous le drapeau de rejeu et **compte sur des effets qui tournent dedans**. Regrouper `goTo` fait échouer « reloads a resource the snapshot could not capture » : `['a','b','b','a']` au lieu de `['a','b','a']` (vérifié par expérience). Résidu connu : pendant une restauration, l'étape change avant le curseur (`canGoBack()` brièvement en retard). |
| `libs/core/src/lib/craft-router-outlet.ts:697` (`state.set('error')`) | Doit rester **après** `showComponent` (voir cas 1). L'état d'erreur et la cible d'erreur sont donc deux étapes ; lecteurs : API publique seulement. |
| `libs/core/src/lib/source$.ts:204-205,221-222` | `emit` puis `sourceAsSignal.set` : c'est un **ordre** événement → signal, pas un groupe de signaux. À examiner à part (voir § 4). |

## 4. À surveiller, non traité

- **Chaînes d'effets** (un effet écrit ce qu'un autre lit) : `craft-effect.ts:131-170` (deux effets par `craftEffect`),
  `preserved-resource.ts:32-37` (recopie par effet), `after-recomputation.ts:367-377` (dérivation par effet). Un lot n'y
  change rien : chaque saut est une étape. Effet visible : `resourceById.set` change les clés d'un coup, mais la valeur d'une
  clé conservée arrive un effet plus tard (noté dans `resource-by-id-batch.spec.ts`). Remède probable : dériver par `computed`.
- **`source$.emit`** : un abonné qui lirait la vue signal de la source dans son callback verrait peut-être l'ancienne valeur
  (l'événement part avant l'écriture du signal). **Non vérifié.**
- **Navigation de `docs-herbier`** (`apps/docs-herbier/src/navigation.ts:161-162`) : la page est écrite, puis l'événement DOM
  `doc-navigated` ferme tiroir/recherche/menus : deux étapes. Mesuré après correctif : `DocDialog`, `DocSeasonPicker`,
  `DocModeToggle`, `DocIconButton` s'exécutent 2 fois ; `DocOutline` et `DocFooter` aussi (le plan de page est enregistré par `DocPage`).
  Surcoût résiduel faible (79 exécutions au total), **non traité**.
- **Chaque dessin du parent redessine chaque enfant une fois**, même sans changement logique : les entrées passées en
  `function* () { … }` sont des fonctions neuves à chaque dessin. Hors périmètre (c'est la conception des entrées), mais c'est
  la raison pour laquelle le compte après correctif reste « un par composant touché » et non zéro.

## 5. Ce qui n'a pas été vérifié

- **Navigateur réel** : aucune mesure refaite. Les chiffres en navigateur (280 à 500 ms → 12 à 53 ms) sont ceux de l'auteur du
  correctif d'origine ; les miens sont en jsdom (12 511 → 79 exécutions, 520 → 148 ms médians).
- **Au-delà de `core` et `component`** : seulement le détecteur sur `docs-ui`, `effect`, `i18n`, `i18n-effect`, `style`,
  `docs-herbier` (rien d'autre que des `Map.set`). Pas lu à la main. Les autres apps (`apps/demo*`) et libs (`attest`,
  `cli`, `deploy*`, `dev-tools`, `graph-mcp`, `review-attestation`, `test-type`) n'ont pas été passées.
- **Le détecteur** ne voit que `.set(` et `.update(` : pas une écriture faite autrement, ni deux écritures séparées par plus
  de 25 lignes ou réparties dans deux fonctions qui s'appellent.
- **Specs de bout en bout** (`e2e`) : non lancées. **ESLint** sur les fichiers modifiés de `core` et `component` : 0 erreur ; les
  29 avertissements restants (`any`, variables inutilisées, assertions non nulles) sont dans des lignes que je n'ai pas touchées.
  Le graphe nx n'est pas en cache : la règle `enforce-module-boundaries` a été **sautée** par ESLint.
- **Cas 1, vue transitions** : le parcours avec `startViewTransition` actif a les tests existants (« has already swapped the
  displayed DOM when the view-transition callback returns » passe) mais pas de témoin dédié à l'ordre commit/flush.
