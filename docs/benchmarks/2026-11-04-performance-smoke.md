# CraftTS : démarrage et mises à jour — 4 novembre 2026

Les mises à jour ciblées sont rapides dans ce smoke. Des coûts sensibles existent
pour le démarrage avec beaucoup de composants, les grandes transformations de
listes et le rechargement pendant le développement. Ces résultats ne permettent
pas de qualifier toutes les applications CraftTS de lentes ou de rapides.

Les [examens complémentaires](2026-11-04-performance-examination.md) isolent
ensuite le coût des exceptions sur les traces absentes et précisent les
contraintes du HMR et des dépendances aux index. Consulter leur ordre d'action
révisé avant de mettre en œuvre les pistes proposées ci-dessous.

## Protocole

- App utilisant les exports publics de CraftTS : un service, des états, une
  dérivation, une liste à clés stables et un composant enfant par ligne.
- Apple M3, macOS arm64, Node v22.23.0, Chromium 153.0.8010.12 ; serveurs locaux.
- 5 navigations par scénario, nouveau contexte navigateur à chaque fois.
  20 interactions par action après 3 interactions de préchauffage.
- Sources locales, incluant les modifications non commitées, copiées avant le
  lancement pour éviter les rechargements dus aux modifications concurrentes.
  SHA-256 des bibliothèques copiées :
  `199e714636081f11dabafbeb1bfdb49d728db00e850d8d76cd9da92f0d5898bc`.
- Vérifications réussies : valeurs finales, nombre de lignes, absence d'erreurs
  JavaScript, conservation des éléments DOM lors des modifications/inversions.

## Démarrage

« Prêt » = navigation → deux frames après bootstrap. « Bootstrap » = exécution
synchrone de `bootstrapCraft`, imports déjà évalués. Valeurs médianes en ms.
Seule la première navigation de développement a un cache de transformations Vite
vide ; les suivantes réutilisent le serveur. Le cache navigateur est toujours vide.

| Mode                                          | Lignes |  Prêt | Bootstrap |
| --------------------------------------------- | -----: | ----: | --------: |
| Développement                                 |      0 | 201,4 |       5,8 |
| Développement                                 |    100 | 193,2 |      23,1 |
| Développement                                 |  1 000 | 282,4 |     131,4 |
| Développement                                 |  5 000 | 722,4 |     564,8 |
| Production                                    |      0 |  38,5 |       6,7 |
| Production                                    |    100 |  37,7 |      15,6 |
| Production                                    |  1 000 |  78,4 |      56,7 |
| Production                                    |  5 000 | 266,0 |     229,7 |
| Production, CPU ×4                            |  1 000 | 298,7 |     221,1 |
| Production, sans composants enfants           |  1 000 |  60,8 |      38,7 |
| Production, sans composants enfants           |  5 000 | 174,0 |     137,8 |
| Même bundle production, runtime développement |  1 000 | 154,3 |     132,1 |

Le processus Vite ouvre son port en **434 ms**, sans préchauffage HTTP. La
première navigation sans lignes prend **695 ms**, cache de transformations vide.
Le lancement du processus et la navigation sont deux mesures distinctes. Le
build de production de ce smoke prend **324 ms**.

Le navigateur demande **250 ressources** en développement contre **2** en
production. Les corps décodés en développement représentent environ 7 à 8 Mo,
sources maps inline comprises : ce n'est pas un poids réseau compressé.
Le bundle production contient **179 334 octets de JS (52 679 en gzip)** et
**28 379 octets de CSS (6 234 en gzip)**. Le gzip est calculé hors ligne.

Au démarrage de production, la tâche longue maximale observée atteint **64 ms**
avec 1 000 composants et **250 ms** avec 5 000. Le temps total raisonnable sur
ce M3 peut donc tout de même inclure un blocage perceptible sur un CPU plus lent.

## Interactions

Temps entre le clic DOM et la notification de mutation du DOM, en ms. Ils
comprennent le traitement synchrone et les microtâches avant l'observation,
mais excluent le délai avant l'affichage. Ce ne sont pas des mesures INP.
Le contrôle des résultats a lieu après le chronométrage.

| Action                     | Dev, 1 000 | Prod, 1 000 | Prod, 1 000 p95 | Dev, 5 000 | Prod, 5 000 | Prod, 5 000 p95 |
| -------------------------- | ---------: | ----------: | --------------: | ---------: | ----------: | --------------: |
| Compteur indépendant       |        0,3 |         0,5 |             0,8 |        0,5 |         0,6 |             0,9 |
| Modifier une ligne         |        1,3 |         1,2 |             1,6 |        1,8 |         1,8 |             2,1 |
| Modifier 10 %              |        8,0 |         5,0 |             6,1 |       37,1 |        14,4 |            20,0 |
| Inverser toute la liste    |       73,1 |        30,7 |            42,8 |      396,2 |       146,5 |           211,8 |
| Filtrer/rétablir la moitié |       78,5 |        24,5 |            34,0 |      388,3 |       169,9 |           308,6 |

Le filtre alterne entre retirer la moitié et rétablir la liste : la médiane
mélange les deux directions. Les p95 reposent sur 20 observations et restent
descriptifs.

Le compteur ne recalcule aucun enfant ; une ligne modifiée en recalcule **un
seul** ; modifier 10 % de 1 000 lignes recalcule **100 enfants**. Les mises à
jour ciblées ne redessinent donc pas toute la liste dans ce scénario.

L'inversion recalcule **tous** les composants, tout en conservant les éléments
DOM. Le renderer considère notamment le changement d'index comme une raison de
recalculer l'entrée : les clés stables ne suppriment pas ce coût.

À CPU ×4, l'inversion de 1 000 lignes prend **114,3 ms** et le filtre **109,1 ms**.
Une modification ciblée reste à **1,3 ms**. Le CPU ×4 ne simule ni un téléphone
réel ni son réseau.

## Modifications du code

À 1 000 lignes, temps depuis l'écriture du fichier jusqu'à sa nouvelle valeur
rendue et deux frames après bootstrap :

| Modification                            |  Médiane | Maximum observé | Rechargements complets |
| --------------------------------------- | -------: | --------------: | ---------------------: |
| Module TypeScript importé par la racine | 300,7 ms |        396,8 ms |                    5/5 |
| Feuille `*.style.ts`                    | 373,8 ms |        407,2 ms |                    5/5 |

Les deux changements provoquent un nouveau document. Le plugin `craftStyle`
envoie explicitement `full-reload` après invalidation et réévalue les feuilles.
Le coût observé inclut un nouveau bootstrap ; cette app ne conserve pas son
état à travers ces changements.

## Causes isolées et limites de l'attribution

1. **Chargement en développement.** Même sans lignes, le temps médian est de
   201 ms contre 39 ms en production. Chargement, transformation et évaluation
   des modules contribuent au coût fixe. Ce run ne les chronomètre pas séparément.
2. **Mode du runtime.** Avec exactement le même bundle de production et 1 000
   composants, `runtime=development` fait passer le bootstrap de **56,7 à
   132,1 ms**, et l'inversion de **30,7 à 71,9 ms**. La différence ne vient donc
   pas uniquement de Vite ou de la minification. Les chemins de diagnostics sont
   une priorité de profilage ; aucune fonction précise n'a encore été isolée.
3. **Coût des composants enfants.** Sans ces composants, en gardant CraftTS et
   le même DOM utile à 5 000 lignes : bootstrap **229,7 → 137,8 ms**, inversion
   **146,5 → 95,3 ms**, filtre **169,9 → 61,4 ms**. Ce coût contribue au résultat
   mais n'explique pas tout le coût de liste.
4. **Réconciliation.** Le renderer recalcule une entrée si son objet, son index
   ou son template change. C'est cohérent avec les comptes observés. Le smoke
   ne profile pas encore chaque étape de la réconciliation.

## Priorités proposées

- Profiler le chemin de diagnostics en développement, puis les imports des
  points d'entrée publics. La comparaison sur un même bundle fournit une base
  pour vérifier une optimisation du runtime.
- Essayer une mise à jour CSS à chaud afin d'éviter le nouveau bootstrap, avec
  vérification de la feuille actualisée et de la conservation de l'état.
- Pour les grandes listes : pagination ou virtualisation, puis étude des
  recalculs liés uniquement à l'index lorsque le template n'en dépend pas.
- Compléter la mesure dans l'app cible avec ses routes, formulaires, backend
  et outils de capture. La démo principale configure notamment
  `withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 })` :
  ces délais de transition doivent être distingués du calcul. Ils ne
  s'additionnent pas systématiquement sur chaque navigation.

Aucun correctif du runtime n'est inclus dans cette analyse. La smoke app et le
runner constituent la base de mesure réutilisable.

## Reproduire et vérifier

`npm run perf:smoke` produit `tmp/performance-smoke.json` et les tableaux de
mesure. `npm run perf:serve` lance l'app sur le port 4299.
Voir [le protocole et les options](../../apps/performance-smoke/README.md) et
[le runner](../../apps/performance-smoke/smoke.test.mjs).

Validation réalisée : run navigateur complet, build production, contrôle
TypeScript de la smoke app et vérification du format des fichiers ajoutés.

Le run ne mesure pas Nx, le typecheck, l'installation, les starters publiés,
le SSR, le backend, les formulaires, le routeur ou la capture de session.
Il n'inclut aucune comparaison avec un autre framework ni recherche de fuite
mémoire. Il mesure les sources locales dans l'état identifié ci-dessus.
