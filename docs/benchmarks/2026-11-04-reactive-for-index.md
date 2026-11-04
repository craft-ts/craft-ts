# Index réactif de `forNode` : implémentation et mesures

Le callback de rendu reçoit désormais `index: InputValue<number>` ; sa lecture
est `yield* index()`. `track(item, index)` conserve un index numérique. Tous les
consommateurs du dépôt ont été migrés, sans surcharge numérique, union legacy
ou conversion implicite du lecteur.

Une inversion conserve les nœuds et les instances enfants. Elle ne réexécute
aucun template de ligne qui ne lit pas sa position. Les bindings d'index
s'actualisent ; les bindings qui ne lisent que l'item restent au repos.

## Implémentation et garanties

Chaque entrée possède un signal et un lecteur stable pendant la vie de sa clé.
La réconciliation publie les nouvelles positions dans un batch, déplace le DOM,
puis laisse les effets consommateurs se mettre à jour. La comparaison des
positions utilise un champ interne, sans abonner la collection aux index.
Le lecteur est créé dans une fonction indépendante de la réconciliation pour
ne pas retenir les anciennes maps et leurs entrées supprimées.

Les remplacements d'item ou de template continuent à déclencher le rendu ;
la stratégie du lecteur d'item est conservée. Une tâche annulée reste marquée
comme non rendue et est replanifiée à la livraison suivante. L'ancien effet de
template est retiré avant qu'une publication d'index puisse le réveiller en
plus de sa tâche différée. Les bindings descendants restent actifs pendant
l'attente. Les tâches lisent l'item et le lecteur courants lors de leur exécution.

La règle `craft-ts/no-raw-for-index`, activée à `error` dans `recommended` et
`effect`, rejette les coercitions du lecteur et de son générateur. Elle suit
les imports Craft, leurs alias, les callbacks nommés et les alias locaux
immuables, avec résolution des scopes. Elle préserve les lectures déléguées,
les bindings directs, les entrées réactives et les comparaisons d'identité.
Les limites de résolution locale et l'absence d'autofix sont documentées dans
[le guide ESLint](../../apps/docs/guide/routing/eslint-rules.md).

## Deux problèmes d'effets révélés par les mesures

Le batch de 5 000 index révélait une récursion dans le pont de `craftEffect` :
un abonnement relayait chaque invalidation à un second par un signal. Les deux
utilisent aujourd'hui le même moteur réactif. Le corps est désormais confié à
un seul effet hôte, avec les mêmes options d'injecteur et de nettoyage. Un test
avec 5 000 effets indépendants échouait par dépassement de pile avant correction.

Les filtrages répétés révélaient aussi une rétention déjà présente avec le
renderer numérique : un effet détruit gardait son rapport actif et son
injecteur de tags jusqu'à la destruction du parent. La destruction désinscrit
maintenant le rapport, libère le scope et retire les callbacks du parent.
Tous ces nettoyages ont lieu même si le nettoyage d'une exécution échoue.
Les nouveaux tests couvrent la désinscription immédiate, le scope et ces erreurs.

Avant cette correction, après cinq puis vingt cycles supplémentaires à
5 000 lignes avec index, le renderer numérique en développement retenait
**85 053 puis 185 053 nœuds**, et **1 146 puis 2 662 Mio** de tas JS. La première
version réactive retenait les mêmes nombres de nœuds, pour **232 puis 421 Mio**.
Rapport de diagnostic conservé :
`tmp/reactive-for-index/before-effect-cleanup.json`. Ces chiffres ne sont pas
utilisés dans la comparaison finale de temps ci-dessous.

## Protocole de la campagne finale

- 4 novembre 2026 ; Apple M3, Node v22.23.0, Chromium 153.0.8010.12.
- Sources locales figées, y compris les modifications non commitées.
- Référence : copie du renderer numérique sauvegardée avant la migration,
  et non `HEAD`. Les autres fichiers du runtime, notamment les corrections
  d'effets ci-dessus, sont communs aux deux variantes. La comparaison isole
  donc la stratégie d'index, avec un nettoyage effectif dans les deux cas.
- Dans le snapshot numérique seulement, le nombre capturé est emballé dans
  un générateur pour exécuter la même app. Aucune compatibilité n'est exposée
  dans l'API applicative.
- Serveur Vite de développement et bundle de production réellement construit.
  1 000 et 5 000 composants enfants, avec et sans position affichée.
- Profils synchrones : trois navigations, six interactions mesurées par action
  après deux de préchauffage ; médianes ci-dessous. Contextes navigateur neufs.
- Profils planifiés : une navigation et deux interactions par action après
  deux de préchauffage, avec CPU normal ou ralenti ×4. Ces petits échantillons
  servent de contrôle et d'observation, sans portée statistique.
- Compteurs présents pendant les mesures dans les deux variantes. Chaque
  opération vérifie les données, les positions, l'identité DOM et les erreurs
  navigateur. Une inversion réactive exige zéro template et zéro binding d'item.
- Variantes et campagnes successives, sans ordre aléatoire. Charge de la machine,
  préchauffage et collecte influencent les temps. Aucun seuil n'est imposé.

Les positions sont affichées dans un texte et dans `data-position`.
`indexBindings` compte uniquement l'attribut, soit une évaluation par ligne
déplacée ; le texte est un second binding. Tous les index finaux sont corrects.
Le contrôle négatif bloquant leur publication produit **10 positions fausses
sur 10 lignes**, malgré un ordre DOM correct.

## Rendu synchrone

Temps en millisecondes, **numérique → réactif**. Bootstrap : travail synchrone
du montage. Interactions : dispatch DOM et travail synchrone de mise à jour.
Filtrer retire la moitié des lignes ; rétablir remonte les entrées supprimées.

| Runtime       | Lignes | Index affiché | Bootstrap       | Modifier un item | Inverser       | Filtrer        | Rétablir        |
| ------------- | ------ | ------------- | --------------- | ---------------- | -------------- | -------------- | --------------- |
| Développement | 1 000  | non           | 61,70 → 66,60   | 0,50 → 0,50      | 34,85 → 1,60   | 22,10 → 10,30  | 35,70 → 20,80   |
| Développement | 1 000  | oui           | 80,20 → 86,10   | 0,50 → 0,50      | 52,00 → 6,65   | 34,60 → 12,70  | 57,60 → 35,40   |
| Développement | 5 000  | non           | 242,00 → 242,90 | 0,90 → 0,90      | 182,00 → 7,10  | 129,20 → 33,00 | 191,90 → 95,80  |
| Développement | 5 000  | oui           | 330,30 → 306,50 | 1,00 → 1,00      | 282,70 → 32,50 | 177,10 → 55,80 | 266,50 → 150,00 |
| Production    | 1 000  | non           | 57,20 → 56,70   | 0,50 → 0,40      | 34,50 → 1,80   | 21,50 → 10,90  | 35,30 → 21,40   |
| Production    | 1 000  | oui           | 74,30 → 73,50   | 0,50 → 0,40      | 51,90 → 6,65   | 33,30 → 11,00  | 53,90 → 30,60   |
| Production    | 5 000  | non           | 247,30 → 228,10 | 0,90 → 0,90      | 168,20 → 7,05  | 119,20 → 30,50 | 185,70 → 92,30  |
| Production    | 5 000  | oui           | 349,20 → 311,80 | 1,00 → 0,90      | 255,40 → 33,15 | 185,00 → 58,30 | 309,00 → 146,80 |

La réconciliation et les déplacements DOM restent nécessaires. Le filtrage et
le rétablissement comprennent les destructions et créations de composants ;
ils ne bénéficient donc pas du même raccourci qu'une permutation pure.
Les écarts de démarrage ne constituent pas une garantie d'amélioration : un
signal d'index est désormais alloué même si la ligne ne consomme pas sa position.

### Travail effectué lors d'une inversion de 5 000 lignes

| Runtime       | Index affiché | Templates de ligne | Templates enfants | Bindings item | Bindings index (attribut) |
| ------------- | ------------- | ------------------ | ----------------- | ------------- | ------------------------- |
| Développement | non           | 5000 → 0           | 5000 → 0          | 10000 → 0     | 0 → 0                     |
| Développement | oui           | 5000 → 0           | 5000 → 0          | 10000 → 0     | 10000 → 5000              |
| Production    | non           | 5000 → 0           | 5000 → 0          | 10000 → 0     | 0 → 0                     |
| Production    | oui           | 5000 → 0           | 5000 → 0          | 10000 → 0     | 10000 → 5000              |

Le renderer numérique réévalue certains bindings d'item deux fois pendant ses
patchs successifs. Ces compteurs décrivent cette app ; la migration conserve
sa stratégie de mise à jour d'item et ne promet pas de réduire tous les patchs.

## Rendu planifié et CPU ralenti

Temps en millisecondes, **numérique → réactif**. Le montage est la fin observée
après chargement et création de toutes les lignes. Les actions planifiées
incluent les frames et les lectures DOM de vérification jusqu'au dernier état
correct. Ces durées ne sont pas directement comparables au seul dispatch du
tableau synchrone ; elles ne mesurent ni l'INP ni un appareil mobile réel.

| Runtime       | Lignes | Index | CPU | Montage observé   | Modifier un item | Inverser         | Filtrer          | Rétablir          |
| ------------- | ------ | ----- | --- | ----------------- | ---------------- | ---------------- | ---------------- | ----------------- |
| Développement | 1000   | non   | ×1  | 573,80 → 506,90   | 34,20 → 33,35    | 3,05 → 2,05      | 9,10 → 6,20      | 249,20 → 116,80   |
| Développement | 1000   | non   | ×4  | 1298,00 → 1481,40 | 33,95 → 33,15    | 12,60 → 9,05     | 28,90 → 26,60    | 968,00 → 468,90   |
| Développement | 1000   | oui   | ×1  | 624,20 → 624,50   | 34,55 → 33,75    | 375,20 → 8,20    | 183,30 → 14,10   | 367,40 → 149,30   |
| Développement | 1000   | oui   | ×4  | 1989,90 → 1915,80 | 34,25 → 34,55    | 1135,10 → 34,00  | 516,80 → 57,50   | 1155,30 → 814,00  |
| Développement | 5000   | non   | ×1  | 1460,20 → 1474,90 | 33,80 → 34,00    | 11,75 → 10,95    | 41,80 → 33,50    | 1155,20 → 496,90  |
| Développement | 5000   | non   | ×4  | 4607,20 → 4418,40 | 37,45 → 33,55    | 39,20 → 35,75    | 184,90 → 128,20  | 4864,30 → 1952,40 |
| Développement | 5000   | oui   | ×1  | 1848,60 → 1897,20 | 37,15 → 35,90    | 1534,85 → 39,80  | 835,80 → 82,00   | 1452,60 → 703,00  |
| Développement | 5000   | oui   | ×4  | 7909,70 → 6197,60 | 44,20 → 41,85    | 8155,00 → 154,95 | 3561,90 → 233,10 | 8989,00 → 3233,60 |
| Production    | 1000   | non   | ×1  | 323,30 → 305,30   | 33,70 → 33,45    | 2,80 → 2,50      | 8,00 → 8,10      | 266,70 → 150,10   |
| Production    | 1000   | non   | ×4  | 1402,10 → 1013,80 | 33,75 → 34,50    | 13,05 → 9,10     | 30,50 → 22,30    | 815,00 → 357,60   |
| Production    | 1000   | oui   | ×1  | 424,40 → 456,80   | 26,05 → 34,00    | 266,85 → 9,70    | 136,30 → 14,20   | 265,80 → 182,30   |
| Production    | 1000   | oui   | ×4  | 1615,70 → 1396,60 | 33,85 → 34,95    | 1233,85 → 32,45  | 766,30 → 48,10   | 1152,10 → 541,40  |
| Production    | 5000   | non   | ×1  | 1258,10 → 1308,00 | 33,40 → 33,55    | 11,90 → 10,60    | 41,70 → 52,70    | 938,00 → 526,70   |
| Production    | 5000   | non   | ×4  | 4741,40 → 4152,90 | 38,65 → 31,95    | 43,45 → 36,55    | 235,00 → 131,90  | 5494,90 → 1932,50 |
| Production    | 5000   | oui   | ×1  | 1694,50 → 1775,40 | 34,90 → 34,70    | 1502,70 → 37,25  | 868,90 → 64,90   | 1637,30 → 650,70  |
| Production    | 5000   | oui   | ×4  | 6324,70 → 6124,90 | 37,10 → 37,95    | 6227,45 → 157,75 | 2732,00 → 234,20 | 6846,40 → 3376,70 |

Les changements rapides avant le premier rendu et pendant une mise à jour en
attente sont couverts par le scheduler virtuel : dernier index utilisé, tâches
obsolètes annulées, absence de double rendu et destruction sans tâche résiduelle.

## Coût mémoire et nettoyage

Tas JS après collecte forcée CDP, juste après montage ; médianes des trois
navigations synchrones. La dernière colonne est la différence de tas total
rapportée au nombre de lignes, **pas une attribution d'allocation au seul signal**.
Le tas inclut code, caches, composants et métadonnées.

| Runtime       | Lignes | Index affiché | Numérique (Mio) | Réactif (Mio) | Écart total / ligne (octets) |
| ------------- | ------ | ------------- | --------------- | ------------- | ---------------------------- |
| Développement | 1000   | non           | 32,98           | 33,27         | 302,72                       |
| Développement | 1000   | oui           | 41,04           | 41,41         | 388,52                       |
| Développement | 5000   | non           | 112,34          | 113,84        | 313,65                       |
| Développement | 5000   | oui           | 152,21          | 154,03        | 382,63                       |
| Production    | 1000   | non           | 22,21           | 22,50         | 304,90                       |
| Production    | 1000   | oui           | 30,28           | 30,65         | 387,12                       |
| Production    | 5000   | non           | 101,57          | 103,01        | 301,12                       |
| Production    | 5000   | oui           | 141,36          | 143,28        | 402,29                       |

Avec index affiché, à 5 000 lignes, cinq puis vingt cycles supplémentaires de
filtrage/rétablissement (25 cumulés), avec collecte forcée après chaque série :

| Renderer  | Runtime       | Cycles cumulés | Nœuds DOM | Écouteurs JS | Tas JS (Mio) |
| --------- | ------------- | -------------- | --------- | ------------ | ------------ |
| Numérique | Développement | 5              | 40053     | 24           | 160,75       |
| Numérique | Développement | 25             | 40053     | 24           | 162,28       |
| Réactif   | Développement | 5              | 40053     | 24           | 158,12       |
| Réactif   | Développement | 25             | 40053     | 24           | 163,43       |
| Numérique | Production    | 5              | 40051     | 19           | 149,94       |
| Numérique | Production    | 25             | 40051     | 19           | 151,47       |
| Réactif   | Production    | 5              | 40051     | 19           | 147,30       |
| Réactif   | Production    | 25             | 40051     | 19           | 152,60       |

Les nœuds et écouteurs restent constants après le préchauffage. Un contrôle
séparé de la version réactive mesure également **30 276 fonctions génératrices**
avant, après cinq cycles et après 25 cycles, avec **40 053 nœuds et 24 écouteurs**
constants. Il inclut les lecteurs d'index et les autres générateurs de l'app.
Rapport : `tmp/reactive-index-cleanup-check.json`.

Une dérive de quelques Mio de tas subsiste entre les séries. Ces comptages ne
permettent pas de l'attribuer à des caches, au JIT ou à des métadonnées retenues,
et ne prouvent pas l'absence générale de fuite. Ils vérifient ici la libération
des entrées DOM et l'absence d'accumulation des fonctions génératrices.

## Vérifications

- Core : **165 fichiers, 1 636 tests réussis**, un échec attendu et trois `todo`
  préexistants. Component : **58 fichiers, 564 tests réussis**.
- Dernière vérification du renderer et du SSR/hydratation après isolation de la
  factory du lecteur : **93 tests réussis**.
- TypeScript : Core, Component, Dev Tools, démo, app de revue, snippets docs et
  smoke vérifiés ; les anciens calculs/annotations numériques sont rejetés.
- ESLint : **22 tests de règle** et **39 tests de génération** réussis ; règle
  exportée et activée en erreur dans les projets Plain et Effect.
- Audit ciblé des **59 fichiers source** mentionnant `forNode` : aucun diagnostic
  de la nouvelle règle. Les usages nommés, imbriqués, événements et contextes de
  templates ont été migrés ou vérifiés.
- Documentation exécutable et imports de régions : **7 tests réussis**.
- Smoke navigateur complet : réussi avec une navigation par scénario et deux
  interactions mesurées par action, en développement, production, index affichés,
  éléments simples et CPU ×4 ; contrôles de rechargement TypeScript/CSS conservés.
- Examen `lists` : contrôle positif réactif et contrôle négatif réussis.
- Campagne finale : **48 scénarios**, aucun échec de données, position, identité
  DOM, compteurs ou erreur navigateur.

Le typecheck global reste bloqué par **430 diagnostics préexistants** d'émission
de déclarations dans `ui` et `docs-ui`. Une reconstruction isolée avec le
contrat numérique et une comparaison du dernier run donnent exactement les
mêmes diagnostics, sans ajout ni retrait :
`tmp/reactive-index-typecheck-comparison.json`.

Le lint des fichiers migrés de l'app de revue conserve deux erreurs préexistantes
sur `sourceUrl()` et les mêmes avertissements. Le helper de scope dans
`craft-service.ts` conserve ses 179 avertissements, sans erreur ni différence de
messages avant/après. Les nouveaux fichiers de règle et les fichiers d'effet
ciblés sont sans erreur. Preuves :
`tmp/reactive-index-lint-comparison.json` et
`tmp/reactive-index-service-lint-comparison.json`.

## Reproduire et consulter les rapports

```sh
npm run perf:reactive-index
CRAFT_PERF_BASELINE_RENDERER=tmp/reactive-index-before/interpreter.ts npm run perf:reactive-index
CRAFT_PERF_EXAMS=lists npm run perf:examine
npm run perf:smoke
```

Le premier lancement mesure uniquement le renderer réactif. La référence
numérique sauvegardée appartient à ce workspace ; sur une autre copie, fournir
sa propre sauvegarde antérieure à la migration.

[Runner et options](../../apps/performance-smoke/README.md).
Rapports finaux : `tmp/reactive-for-index/numeric-baseline.json`,
`tmp/reactive-for-index/after.json` et leur réunion
`tmp/reactive-for-index/report.json`. Les deux campagnes ont les mêmes paramètres
et le même runtime commun ; le rapport réactif utilise la factory de lecteur
isolée. Les snapshots temporaires sont supprimés ; les empreintes et échantillons
restent dans les rapports.

- before : `d065daf3047803303989f8ba3eb7cfa63a760ceca341dec3030d41273ca378ca`.
- after : `42a8deca5dfa3081211475e16c05af427186f6da9297c7e73005c6c573030ae2`.
