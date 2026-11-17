# Index de listes lean : différer le nœud réactif

17 novembre 2026. Référence `e9a3b27f2`, implémentation retenue `2985fd21d`.
Branche `codex/lazy-list-indexes`. Le prototype de rendu impératif reste retiré.

Le changement retenu réduit les allocations des **listes spécialisées du mode
lean** dont l'index n'est pas lu. Sur 5 000 lignes, le heap JS après parcours/GC
passe de 5,27 à 4,94 Mio (−6,2 %). Le montage change peu. Le bénéfice sur la
page réaliste est très faible ; aucune amélioration générale du montage n'est
revendiquée. Les mises à jour présentent des gains et des régressions selon le cas.

[Données, distributions et essais intermédiaires](2026-11-17-lazy-list-indexes-summary.json).

## Implémentation

Le lecteur d'index conserve sa forme, son identité et sa durée de vie. Seul son
stockage privé peut être paresseux : `ɵcraftLazyPrivateCell` garde la dernière
valeur scalaire tant qu'aucune lecture n'a lieu. Elle ne crée le nœud Alien et
la boîte de valeur qu'à la première lecture.

`set()` avant cette lecture remplace la valeur courante sans publier de signal
encore inobservable. `update()` lit la cellule sans abonnement, comme pour la
cellule ordinaire. Dès la matérialisation, `set` reprend la méthode commune des
cellules ordinaires. L'égalité `Object.is`, les abonnements, le batching et les
valeurs `NaN`/zéros signés sont conservés.

Cette cellule est interne au renderer. L'application reçoit toujours le même
lecteur yieldable ; il n'a ni nouveaux champs d'état ni proxy supplémentaire.
Sa fermeture ne retient que la cellule, sans retenir l'entrée, ses nœuds DOM
ou les Maps d'une ancienne réconciliation.

L'intégration est limitée au chemin de liste déjà prouvé et activé par
`craftCompiler({ lean: true })`. Les autres listes utilisent la cellule
ordinaire. Les gardes existantes pour SSR, hydratation et diagnostics restent
applicables. Aucun nouvel argument de configuration n'est ajouté.

## Ce qui est réellement évité

Compteurs diagnostiques séparés des timings, à écriture applicative identique :

| Cas au montage                       | Lecteurs avant/après | Nœuds réactifs avant | Nœuds réactifs après | Lectures d'index |
| ------------------------------------ | -------------------: | -------------------: | -------------------: | ---------------: |
| 1 000 lignes lean sans index affiché |        1 000 / 1 000 |                1 000 |                    0 |                0 |
| 1 000 lignes lean avec index affiché |        1 000 / 1 000 |                1 000 |                1 000 |            2 000 |
| Page réaliste, échelle 2             |            743 / 743 |                  743 |                  468 |                0 |

La version finale évite donc **275 nœuds sur la page**, et non les 743 potentiels
identifiés dans la recherche initiale. Certaines listes ne sont pas spécialisées.
Leur index conserve le comportement d'allocation ordinaire. Les fonctions de
cellule et les lecteurs existent toujours : le compteur mesure les nœuds du
moteur réactif, pas toutes les allocations du renderer.

## Confirmation sur les listes

Apple M3, Node 25.2.1, Chromium 153.0.8010.12. Production minifiée, variantes
intercalées dans un ordre mélangé reproductible, sept navigations fraîches par
case/variante, deux boucles d'échauffement puis cinq boucles mesurées.
**56 navigations** : deux cas, quatre variantes, 5 000 lignes.

Les mêmes sources applicatives sont compilées avec les mêmes options. La
référence utilise les bibliothèques figées par `git archive e9a3b27f2` ; le
candidat utilise `2985fd21d`. Les traces de contrôle vérifient DOM normalisé,
identité des lignes conservées, positions et destruction avant les timings.

Temps médians en millisecondes, 5 000 lignes :

| Action     | Lean sans index avant | Après | Lean avec index avant | Après |
| ---------- | --------------------: | ----: | --------------------: | ----: |
| Montage    |                 13,90 | 13,70 |                 18,50 | 18,80 |
| Une ligne  |                  0,90 |  0,80 |                  1,00 |  1,00 |
| Un dixième |                  1,30 |  1,30 |                  1,70 |  1,70 |
| Inverser   |                  3,05 |  2,75 |                  8,90 |  8,75 |
| Filtrer    |                  1,20 |  1,00 |                  5,30 |  3,50 |
| Restaurer  |                  3,50 |  3,70 |                  7,50 |  7,20 |

Le montage lean sans index passe de 13,9 à 13,7 ms. L’inversion passe de
3,05 à 2,75 ms (−9,8 %), mais la restauration passe de 3,5 à 3,7 ms
(+0,2 ms). Avec index affiché, le montage passe de 18,5 à 18,8 ms ; le
heap augmente légèrement, de 8,657 à 8,716 Mio (+0,7 %), car la cellule
conserve un emplacement supplémentaire pour sa valeur avant matérialisation.

Le rendu runtime de contrôle conserve un heap comparable : 25,666 → 25,681 Mio
sans index et 33,421 → 33,412 Mio avec index. Son montage reste comparable
(43,2 → 43,5 ms et 57,2 → 57,2 ms). Sa restauration sans index varie davantage
(14,8 → 11,6 ms) malgré l’allocation ordinaire conservée : cet écart n’est pas
attribué à la suppression de nœuds réactifs.

Le bundle de cette entrée augmente de 115 octets gzip en lean (59 222 → 59 337)
et de 96 octets dans le contrôle runtime (55 324 → 55 420). Le support interne
du chemin optionnel reste présent dans ces bundles.

Le contrôle runtime conserve l'allocation ordinaire des index. Ses écarts de
timing ne doivent pas être présentés comme un gain des nœuds différés. Il montre
aussi que GC, JIT et ordonnancement influencent certains parcours. Les différences
de quelques dixièmes de milliseconde ne prouvent pas un gain général.

Les montages sont des bootstraps synchrones et les actions incluent une microtask,
pas le layout/paint ultérieur. Le heap est celui de JavaScript après le même
parcours et un GC explicite, pas la mémoire totale du navigateur.

## Page réaliste

Les deux variantes lean produisent le même DOM normalisé à travers **47
instantanés** d'interactions à l'échelle 2. Sept navigations par variante et cinq
boucles après échauffement donnent **14 navigations de timing** supplémentaires.

Médianes en ms, puis heap JS en Mio :

| Mesure                 | Avant | Après |
| ---------------------- | ----: | ----: |
| Montage                | 33,70 | 34,60 |
| Une tâche              |  0,60 |  0,60 |
| Filtrer                |  1,50 |  1,40 |
| Restaurer après filtre |  4,20 |  4,10 |
| Trier                  |  1,30 |  1,30 |
| Thème                  |  2,75 |  2,75 |
| Remonter               | 17,50 | 17,80 |
| Heap après montage     |  7,77 |  7,76 |
| Heap après parcours    |  8,88 |  8,87 |

Le nombre d’éléments reste 4 788 dans les deux variantes. Le montage passe
de 33,7 à 34,6 ms ; aucune baisse de montage n’est revendiquée. La mémoire
mesurée ne baisse que d’environ 0,01 Mio dans cette page.

Le montage n'est pas amélioré dans cette campagne. Le petit gain mémoire et les
écarts de mise à jour ne permettent pas d'annoncer une accélération globale de
la page. La somme des gains de campagnes différentes n'a pas de sens.

## Essais écartés ou resserrés

- Un objet de position supplémentaire par entrée (`1efe2690c`) évitait les
  cellules inutilisées, mais coûtait environ 0,31 Mio supplémentaires dans le
  contrôle lean de 5 000 lignes avec index. Cette représentation a été retirée.
- Porter l'état sur le lecteur lui-même (`b81a68a92`) réduisait ce surcoût, mais
  ajoutait des champs privés au lecteur et une indirection. Cette forme a
  également été retirée.
- La cellule interne différée (`4ed42724c`, puis `b4de8418c`) conserve le lecteur
  initial. La généralisation à toutes les listes ne démontrait pas un bénéfice
  temporel assez régulier pour être retenue ; l'activation est finalement limitée
  aux listes lean spécialisées.

Les données intermédiaires sont conservées séparément. Elles ne décrivent pas le
candidat final et leurs meilleurs chiffres ne lui sont pas attribués.

## Vérifications

Sur le candidat final : 1 699 tests Core réussis (un échec attendu et trois TODO
existants), 609 tests Component et 57 tests Compiler réussis. Le build TypeScript
de Component et Compiler passe. Le lint ne relève aucune erreur ; les 23
avertissements du renderer sont sur des lignes inchangées. La règle NX de
frontières de modules est ignorée faute de ProjectGraph en cache ; aucune
nouvelle dépendance inter-projet n'est introduite.

Les nouveaux cas vérifient une première lecture après plusieurs déplacements,
la valeur capturée au moment de l'appel d'un lecteur, un lecteur sauvegardé après
suppression/restauration de sa clé, puis le démarrage et la poursuite du suivi
réactif. Le contrôle compilé lit l'index seulement après plusieurs mouvements et
compare DOM/identité au renderer générique. Les tests communs de cellules
s'exécutent sur les deux fabriques, ordinaire et différée.

## Reproduire et poursuivre

Le harness standard des listes suffit :

```sh
mkdir -p tmp/lazy-index/reference
git archive e9a3b27f2 libs/core libs/component libs/style \
  tsconfig.base.json tsconfig.json package.json \
  | tar -x -C tmp/lazy-index/reference

COMPILER_VARIANTS='runtime-before=runtime@tmp/lazy-index/reference,runtime-after=runtime,lean-before=lean@tmp/lazy-index/reference,lean-after=lean' \
  COMPILER_CASES=rows,indexed COMPILER_ROWS=5000 COMPILER_RUNS=7 \
  COMPILER_ITERATIONS=5 npm run perf:compiler
```

Le runner de page utilisé est archivé sous forme de texte dans les données :
copie du harness existant avec `configFile: false` pour ne pas charger les
plugins Vue/Svelte/Solid inutiles à cette comparaison Craft, et ordre à graine
fixe. Les chemins des bibliothèques et empreintes sont archivés.

Une autre limite ressort : une liste peut conserver ses entrées génériques même
si son composant enfant est compilé, notamment quand cet enfant est importé d'un
autre module. `compileItems` ne connaît que ses propres définitions locales. C'est
une piste plus structurelle pour améliorer la couverture : analyser les exports
constants et leurs liaisons via le graphe du bundler, en préservant les imports
vivants, l'ordre d'initialisation, les cycles et les replis. Aucun gain de cette
future extension n'est annoncé ici.
