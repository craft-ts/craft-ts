# CraftTS : examens complémentaires de performance

Suite du [premier smoke](2026-11-04-performance-smoke.md), le 4 novembre 2026.

Les examens isolent une cause importante du surcoût des diagnostics : les
recherches de traces absentes passent par des exceptions. Ils confirment le coût
des recalculs liés aux index de liste. Ils montrent aussi que le HMR CSS et
TypeScript demande un protocole de remplacement des définitions, au-delà de la
simple activation du HMR Vite.

## Protocole et périmètre

- Apple M3, Node v22.23.0, Chromium 153.0.8010.12.
- Copie figée des sources locales, y compris les modifications non commitées.
  Empreinte des bibliothèques :
  `9968ad9e6fa7f511728e60b7e9ee2defac726e98ed3be4a3bcde7e00287e1611`.
- Serveur Vite en développement ; le mode du runtime est choisi indépendamment
  du bundling. Les temps ne sont donc pas directement interchangeables avec
  les temps du bundle minifié du premier smoke.
- Sauf indication contraire : 5 navigations par variante, contexte navigateur
  neuf ; 10 inversions après 2 interactions de préchauffage. Les résultats
  présentés sont des médianes. Variantes exécutées successivement, sans ordre
  aléatoire : charge de la machine et préchauffage peuvent influencer les écarts.
- Les modifications du runtime et du plugin sont exclusivement expérimentales,
  dans les copies temporaires lors de cette première campagne. Le correctif
  appliqué ensuite est décrit dans la section 1 bis.
- Les contrôles mémoire supplémentaires utilisent une autre copie de la même
  empreinte. Les snapshots sont supprimés à la fin ; les rapports restent.

## 1. Diagnostics : les traces absentes provoquent des exceptions

Pour 1 000 composants, sans wrapper de trace déclaré :

| Moment              | Appels à `executeTemplateTrace` cumulés | Recherches de traces terminées par exception |
| ------------------- | --------------------------------------: | -------------------------------------------: |
| Après le démarrage  |                                   3 002 |                                        3 002 |
| Après une inversion |                                   5 002 |                                        5 002 |

`ɵinjectTemplateTraces` intercepte ces exceptions et retourne `[]`. Le résultat
fonctionnel est correct, mais le chemin normal « aucune trace configurée » paie
la construction d'erreurs et de leurs piles.

Le profil CPU de 14 inversions (12 mesurées et 2 de préchauffage) place
`missingProviderError` en premier poste propre : environ **554 ms échantillonnées**,
sur un profil d'environ 1 351 ms incluant les attentes entre frames. Les temps
de profilage sont des estimations ; les piles inclusives se chevauchent.

| Variante, 1 000 composants                              | Bootstrap | Inversion |
| ------------------------------------------------------- | --------: | --------: |
| Runtime développement, original                         |  143,0 ms |   73,1 ms |
| Même code, runtime production                           |   63,4 ms |   31,3 ms |
| Cache des recherches de wrappers, par injecteur         |   87,9 ms |   31,5 ms |
| Cache du mode runtime seulement                         |  140,9 ms |   75,4 ms |
| Wrapper racine présent, qui appelle simplement `next()` |   65,1 ms |   33,5 ms |

Le wrapper racine est un contrôle positif : **3 002 appels au démarrage**, puis
**5 002** après inversion. Le gain ne vient donc pas de la désactivation des
traces. Éviter l'échec de résolution suffit à supprimer l'essentiel du surcoût
dans ce scénario. Le cache du mode seul n'apporte pas de gain convaincant.

**Action recommandée en premier :** résoudre l'absence de wrappers sans lever
d'exception, en conservant l'ordre des wrappers, leur héritage et les overrides.
Un cache est une piste, mais son invalidation doit être définie. La fourniture
d'un wrapper vide sert ici de sonde, pas de correctif général proposé aux apps.

## 1 bis. Correctif appliqué : résolution optionnelle des traces

Le 4 novembre 2026, `ɵinjectTemplateTraces` utilise désormais une résolution
optionnelle interne du service. Le resolver conserve les overrides avant la
recherche du token et fournit un symbole d'absence à `injector.get`. Seule
l'absence du service devient `[]` ; les erreurs des providers, de leurs
dépendances, des wrappers et du rendu restent des erreurs. Les valeurs fournies
`null` et `undefined` restent distinctes de l'absence dans le resolver.

Le chemin obligatoire et les mécanismes de scopes, de valeurs par défaut, de
collections et de suivi des services sont conservés. Le marqueur d'absence
n'est pas enregistré comme service résolu. Le helper et le symbole portent le
préfixe interne `ɵ`, comme les autres utilitaires de service du runtime ; ils
sont réservés à cet usage interne. L'API applicative de configuration des traces
reste inchangée. Aucun cache de traces n'est ajouté.

### Mesures avant/après

Même environnement que la première campagne : Apple M3, Node v22.23.0,
Chromium 153.0.8010.12. Chaque campagne copie les sources locales non commitées
avant de lancer ses variantes. Cinq navigations par temps de bootstrap,
dix inversions après deux inversions de préchauffage ; médianes ci-dessous.
Les compteurs sont mesurés dans des variantes distinctes des chronométrages.

| Variante, 1 000 composants                             | Bootstrap | Inversion |
| ------------------------------------------------------ | --------: | --------: |
| Avant, développement sans traces                       |  191,6 ms |   84,6 ms |
| Après, développement sans traces                       |   72,1 ms |   39,4 ms |
| Avant, wrapper racine qui appelle `next()`             |   64,3 ms |   36,1 ms |
| Après, wrapper racine qui appelle `next()`             |   67,2 ms |   28,1 ms |
| Avant, runtime production sans traces                  |   63,1 ms |   32,4 ms |
| Après, runtime production sans traces, première mesure |   77,8 ms |   36,0 ms |

Dans ces runs, le correctif réduit le bootstrap de **62 %** et l'inversion de
**53 %** en développement sans wrappers. Les temps rejoignent l'ordre de
grandeur du contrôle avec wrapper vide. Les variantes et campagnes sont
successives, sans ordre aléatoire ; la charge et le préchauffage influencent
les temps. Les valeurs ne sont pas des seuils de performance.

Le premier écart en production a motivé un contrôle dédié, sans autre suite
lancée en parallèle : neuf navigations par variante, sur une même copie figée,
en remplaçant uniquement `craft-service.ts` et `template-trace.ts` par leurs
versions sauvegardées avant le correctif. Ordre : après, avant, après répété.

| Contrôle dédié, runtime production sans traces | Bootstrap | Inversion |
| ---------------------------------------------- | --------: | --------: |
| Après                                          |   82,4 ms |   41,2 ms |
| Avant                                          |   82,2 ms |   37,7 ms |
| Après, répétition                              |   84,2 ms |   37,0 ms |

Ce contrôle ne montre pas de régression stable : bootstrap dans une plage de
2 ms, inversion répétée revenue au niveau initial. Il confirme aussi la forte
variation de charge entre campagnes ; ces observations ne constituent pas une
preuve statistique d'équivalence. Le chemin des wrappers reste court-circuité
en production. Rapport : `tmp/template-trace-production-check/report.json`.

### Compteur des erreurs réellement créées

La nouvelle sonde compte les constructions dans `missingProviderError` pour
`TemplateTracesServiceToken`, indépendamment de tout `catch` côté traces.
Le test de régression intercepte aussi le constructeur `Error` sur le vrai
chemin de résolution : il échouait avant le correctif, malgré un rendu réussi.
Un second test échouait parce que le `catch` masquait l'override `notReached`.

Avant correction : **3 002 erreurs créées au démarrage**, puis **27 002** après
12 inversions (deux de préchauffage et dix mesurées). Après correction :

| Moment                                                | Appels de trace cumulés | Erreurs d'absence créées | Wrappers exécutés dans le contrôle positif |
| ----------------------------------------------------- | ----------------------: | -----------------------: | -----------------------------------------: |
| Démarrage                                             |                   3 002 |                        0 |                                      3 002 |
| Une inversion                                         |                   5 002 |                        0 |                                      5 002 |
| Après restauration de l'ordre et 12 autres inversions |                  31 002 |                        0 |                                     31 002 |

Le contrôle sans wrapper exécute zéro wrapper. En production, les deux variantes
comptent **27 002 appels**, **zéro erreur d'absence** et **zéro wrapper exécuté**.
Le runner vérifie ces garanties par assertions, ainsi que l'ordre des données,
l'identité des nœuds et l'absence d'erreurs navigateur. Le profil après correction
ne fait plus apparaître `missingProviderError` dans les postes propres dominants.

### Garanties et preuves

Les tests des traces couvrent l'absence sans création d'erreur, la composition,
l'imbrication et l'héritage application/composant, le contexte d'injection de
chaque wrapper, les changements d'overrides après une première absence, les
erreurs réelles de provider et de wrapper, le remplacement/blocage des enfants,
les erreurs du rendu et le court-circuit complet en production.

Les tests du resolver couvrent le marqueur d'absence distinct de `null` et
`undefined`, le maintien de la résolution obligatoire, les instances par scope,
les valeurs globales par défaut, les services de scope `function`, les collections
héritées, les trois sortes d'overrides et les erreurs de dépendances absentes ou
de construction de provider, y compris via un injecteur enfant.

Validation finale :

- Suite Core : **165 fichiers**, **1 633 tests réussis**, un échec attendu et
  trois cas `todo` préexistants.
- Suite Component : **58 fichiers**, **552 tests réussis**.
- Contrôles TypeScript de Core et Component : réussis.
- Examen `diagnostics` et smoke complet : réussis.
- Format des fichiers ciblés et `git diff --check` : réussis.
- Lint des traces et des nouveaux tests : réussi. Le module `craft-service.ts`
  garde **95 erreurs et 161 avertissements préexistants** ; une comparaison
  des diagnostics avec `HEAD` confirme les mêmes règles, sévérités et messages,
  sans nouveau diagnostic. Preuve : `tmp/template-trace-lint-comparison.json`.

Commandes de tests : `node tools/run-lib-vitest.mjs libs/core/vitest.config.ts`
et `node tools/run-lib-vitest.mjs libs/component/vitest.config.ts`. Les contrôles
de types utilisent `tsc -p libs/core/tsconfig.spec.json --noEmit` et l'équivalent
pour Component. Journaux : `tmp/template-trace-core-tests.log` et
`tmp/template-trace-component-tests.log`.

Rapports bruts de cette campagne :

- Avant : `tmp/template-trace-before-examination/report.json`, empreinte
  `2a222a97d7c3bf9b496543d32bff86c752cc7b2e568bfe615084a54e4f343a70`.
- Après : `tmp/template-trace-after-examination/report.json`, empreinte
  `34d0f1abf5ba9608b74120ececc1eacf6019a96a3f9753644343cb2cfde3d174`.
- Profils CPU : `diagnostics-reverse.cpuprofile` dans chacun de ces dossiers.
- Smoke fonctionnel après correction : `tmp/performance-smoke.json`, empreinte
  `f43116f8a650ec403d44ca5e80576c30961b40f66f0b15f4263a3073441c34ea`.
  Cinq navigations par scénario, vingt interactions après trois de préchauffage ;
  tous les contrôles de données, d’identité DOM et de rechargement passent.
  Le bundle production monte 1 000 composants en 75,9 ms (bootstrap médian).

Les empreintes incluent les fichiers de tests des bibliothèques. Les snapshots
sont supprimés en fin de campagne ; aucune sonde n'est installée dans le runtime.
Le runner réutilisable et ses assertions sont conservés dans `examine.mjs`.
Le nouveau profil ne justifie pas l'ajout d'un cache avec sa politique
d'invalidation : la résolution optionnelle traite la cause ciblée.

## 2. Listes : gain important, condition de correction indispensable

Mode runtime production, serveur de développement, 5 000 composants :

| Variante                                  | Inversion | Composants recalculés |
| ----------------------------------------- | --------: | --------------------: |
| Original                                  |  145,3 ms |                 5 000 |
| Ignorer le changement d'index, expérience |    6,7 ms |                     0 |

L'identité et l'ordre des éléments DOM sont vérifiés dans les deux cas. Une
modification de la première ligne après inversion reste correcte pour le
template du smoke, qui ne dépend que de l'objet.

Cependant, un contrôle avec 10 lignes affichant leur position donne :

- Original : **0 position incorrecte** après inversion.
- Variante ignorant l'index : **10 positions incorrectes**.

Supprimer simplement la condition d'index serait donc un bug. Le résultat
justifie d'étudier une dépendance explicite à l'index, ou une séparation entre
l'item stable et son index réactif. Le gain potentiel est fort sur les lignes
qui ne consomment pas leur position. La pagination ou la virtualisation reste
utile lorsque plusieurs milliers de lignes seraient entièrement montées.

## 2 bis. Index réactif implémenté

La migration est terminée : le callback de rendu reçoit un lecteur d'index
stable, les bindings consomment `yield* index()` et les permutations n'exécutent
plus les templates indépendants de leur position. Le contrat numérique du
callback de rendu est supprimé ; `track(item, index)` reste numérique.

Le [compte rendu dédié](2026-11-04-reactive-for-index.md) donne les tests,
mesures développement/production, rendu planifié, CPU ×4 et mémoire. Il décrit
aussi les corrections de batching et de nettoyage des effets révélées pendant
la campagne. L'expérience historique ignorant l'index reste un contrôle négatif,
pas l'implémentation retenue.

## 3. Modules : prébundling utile, surveillance des sources à préserver

Le contrôle sans lignes isole le coût de chargement des modules :

| Variante                                        | Ressources | Première navigation | Navigations suivantes, médiane |
| ----------------------------------------------- | ---------: | ------------------: | -----------------------------: |
| Imports des sources du workspace                |        250 |            432,1 ms |                       161,6 ms |
| `optimizeDeps.include` sur core/component/style |         11 |            174,9 ms |                        95,0 ms |

Les caches Vite sont distincts et vides au lancement de chaque variante ; le
processus Node est déjà démarré et les fichiers peuvent être en cache système.
Les deux variantes passent les contrôles de fonctionnement et d'identité DOM.

Mais une modification d'un export sentinelle de `core` :

- est affichée en environ **155 ms** avec les imports sources ;
- n'est **pas affichée dans les 8 secondes** avec les entrées prébundlées.

**Action :** distinguer la consommation de packages installés du développement
des bibliothèques liées. Ne pas forcer globalement ce prébundling dans le
monorepo sans traiter l'invalidation des dépendances optimisées.

Le générateur de projets utilise des packages installés et ne reproduit pas les
alias clients vers les sources du smoke. Ses performances ne sont pas mesurées
ici ; les 250 requêtes ne doivent pas lui être attribuées automatiquement.

## 4. CSS : remplacer la feuille ne suffit pas

Une seule édition de la feuille, `display.block` → `display.flex`, à 1 000 lignes :

| Variante                              | Notification/affichage observé | Navigation |         Compteur | Style final      |
| ------------------------------------- | -----------------------------: | ---------: | ---------------: | ---------------- |
| Original                              |                       403,8 ms |          1 | réinitialisé à 0 | correct, flex    |
| Actualisation de la feuille seulement |                       141,4 ms |          0 |     conservé à 1 | incorrect, block |

Les deux durées ne représentent pas le même succès : la seconde est le délai
de notification HMR, avec un affichage encore incorrect. C'est une sonde négative,
pas une optimisation validée. Une seule édition a été mesurée dans chaque cas.

L'ancienne classe est `display-block-kcaew2` ; la nouvelle est
`display-flex-kr444s`. Le DOM conserve l'ancienne classe lors de l'actualisation
CSS seule. La réaffectation manuelle de la nouvelle classe rétablit bien `flex`,
confirmant le lien causal.

Autre obstacle : réévaluer le module de style dans la même page lève
`craftStyles: class 'performanceSmoke-root' is already declared`.

**Action :** prévoir un remplacement des déclarations de style par module et
une actualisation des bindings de classes. Préserver la détection des vrais
doublons. Conserver un rechargement de secours pour les cas non pris en charge.
Ma recommandation initiale de traiter le CSS comme un petit changement isolé
doit donc être revue : le travail touche aussi les registres et le renderer.

## 5. TypeScript : le remontage à chaud est possible, pas prêt en l'état

Le prototype accepte la mise à jour de la racine, détruit l'app précédente avec
`appRef.destroy()` et la remonte. Sans autre adaptation, la première édition
échoue : `Craft style scope name "PerformanceSmoke" is already used`.
Le document n'est pas rechargé, mais l'app a été démontée et ne se remonte pas.

Le registre des noms de scopes conserve l'ancienne définition. En autorisant
temporairement le remplacement **uniquement des deux noms du smoke**, les dix
éditions fonctionnent :

| Variante                                                   | Temps médian d'édition | Navigations complètes | État         |
| ---------------------------------------------------------- | ---------------------: | --------------------: | ------------ |
| Rechargement original                                      |               318,4 ms |                 10/10 | réinitialisé |
| Remontage HMR avec dérogation expérimentale sur les scopes |               163,5 ms |                  0/10 | réinitialisé |

Chaque édition vérifie 1 000 lignes, un compteur incrémenté une seule fois par
clic et l'absence d'erreurs inattendues. Cette dérogation n'est pas un protocole
général sûr : elle masque volontairement un contrôle de doublon sur ces noms.

**Action :** définir un remplacement explicite des définitions appartenant au
module remplacé, avec nettoyage et reprise sur erreur. Un premier mode de
redémarrage à chaud peut réinitialiser l'état ; sa préservation demanderait un
contrat supplémentaire. Ne pas confondre absence de navigation et état conservé.

## 6. Contrôles de mémoire et de nettoyage

Comptages après collecte forcée du garbage collector :

| Contrôle                      | Nœuds DOM | Écouteurs JS | Tas JS utilisé |
| ----------------------------- | --------: | -----------: | -------------: |
| 2 remontages du même module   |     6 054 |           37 |       36,28 Mo |
| 10 remontages du même module  |     6 054 |           37 |       37,58 Mo |
| 30 remontages du même module  |     6 054 |           37 |       39,04 Mo |
| 60 remontages du même module  |     6 054 |           37 |       39,03 Mo |
| 100 remontages du même module |     6 054 |           37 |       39,16 Mo |

Les nœuds et écouteurs restent constants ; la croissance initiale du tas se
stabilise largement après préchauffage. Aucune accumulation continue de DOM ou
d'écouteurs n'est observée dans ce contrôle. Cela n'est pas une preuve générale
d'absence de fuite.

Avec le prototype qui réévalue la racine à chaque édition, le tas passe de
**36,43 à 38,35 Mo** entre les éditions 2 et 10, avec les mêmes 6 054 nœuds et
37 écouteurs. Un contrôle qui accepte seulement le petit module `version`, sans
recréer les composants, conserve l'état et fait passer le tas de **35,67 à
35,74 Mo**, avec 6 055 nœuds et 37 écouteurs constants.

La différence suggère un coût lié aux versions de modules et aux définitions
recréées, mais aucun chemin de rétention précis n'a été établi par snapshot de
tas. Il faut compléter cette vérification avant de généraliser le HMR de racine.

## Ordre d'action révisé

1. **Exceptions sur l'absence de traces éliminées.** Résolution optionnelle
   implémentée et mesurée ; garanties et résultats dans la section 1 bis.
2. **Séparer les dépendances à l'item et à l'index.** Gain potentiel fort, mais
   obligation de conserver le comportement des templates dépendants de l'index.
3. **Adapter le prébundling au contexte.** Packages consommés et sources de
   bibliothèque liées doivent avoir des stratégies de surveillance adaptées.
4. **Concevoir ensemble les contrats de remplacement HMR des registres.**
   Commencer par les styles/classes, puis les définitions de composants ;
   garder les contrôles de doublon et un rechargement de secours.
5. **Définir ensuite la préservation d'état.** Le remontage rapide seul ne la
   fournit pas. Valider sur une app réelle avec routeur, formulaires et capture.

## Reproduire et consulter les preuves

`npm run perf:examine` exécute tous les examens. Les variantes ne quittent pas
les snapshots temporaires ; les erreurs attendues des contrôles négatifs sont
capturées et vérifiées.

- Rapport principal : `tmp/performance-examination/report.json`.
- Profil CPU : `tmp/performance-examination/diagnostics-reverse.cpuprofile`.
- Contrôle mémoire prolongé : `tmp/performance-examination-memory/report.json`.
- Réunion des deux runs de même empreinte :
  `tmp/performance-examination/complete-report.json`.
- [Runner et options](../../apps/performance-smoke/README.md).

Le run principal et le contrôle mémoire ont terminé avec succès. Les essais
négatifs ont bien reproduit les erreurs attendues. Le contrôle TypeScript de
la smoke app et le format des fichiers ajoutés sont également vérifiés.
