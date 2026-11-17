# Ablations du compilateur et corrections des lecteurs

17 novembre 2026. Référence contrôlée : `70a51b49e`. Le compilateur reste
optionnel ; les interrupteurs d'ablation restent dans le laboratoire.
Les [données archivées](2026-11-17-compiler-ablations-summary.json) contiennent
192 navigations finales, 128 navigations d'un écran antérieur, les contrats,
sources des méthodes, patches, échantillons et empreintes des bundles.

Les nouvelles mesures confirment l'intérêt des entrées de liste légères et
des lectures directes de services. La couverture des événements et des trous
est déterminante sur la page. Le clonage ne gagne pas partout : `create`
reste le défaut et `clone` une option explicite.

## Corrections intégrées avant les mesures finales

Les contrôles d'ablation ont révélé des erreurs que la page initiale ne
rencontrait pas. Elles sont corrigées dans le runtime utilisé par les sept
variantes finales :

- Un composant compilé léger qui recevait un input imposant le rendu compilé
  avec propriétaire exécutait ses lecteurs abaissés hors de leur portée.
  Un `InputShell` transmis par un parent générique et un callback `Output`
  reproduisent le problème. Le repli conserve maintenant sa portée,
  l'injecteur propriétaire, les abonnements et les mêmes nœuds après mise à jour.
- Le raccourci de service pouvait appeler deux fois un lecteur settled ou
  générateur, sonder des symboles sur un receiver inconnu, ou confondre un
  chemin de service imbriqué avec sa racine. Une WeakMap reconnaît désormais
  uniquement les références racines créées par Core. Le membre brut est lu
  puis invoqué une seule fois ; les chemins inconnus gardent le chemin ordinaire.
- La réévaluation d'un lecteur abaissé pouvait perdre le contexte d'un
  `inject(Injector)` explicite. Le renderer exécute maintenant tout le lecteur
  dans l'injecteur approprié, en sauvegardant puis restaurant la portée.

Les références de portée fonction et les wrappers de résolution ne sont pas
mis en cache par ce raccourci. Les tests rouges archivés reproduisent sept
échecs avant correction ; les nouveaux contrats passent ensuite. Ce cache
des **références** ne termine pas la piste distincte du marquage versionné
des **objets de service** mutables.

## Page réaliste : sept variantes

Huit navigations fraîches par variante, trois boucles, échelle 2,
4 788 éléments. Les 47 instantanés d'interactions sont identiques.
Médianes en ms et Mio :

| Variante                             | Montage | Thème | Remontage | Tas montage |
| ------------------------------------ | ------: | ----: | --------: | ----------: |
| Compilateur complet                  |   35,50 |  1,55 |     18,70 |        7,71 |
| Plans contenant un événement refusés |   43,55 |  2,08 |     20,35 |       10,08 |
| Plans contenant un trou refusés      |   56,50 |  2,65 |     27,35 |       13,31 |
| Sans abaissement des génératrices    |   40,10 |  3,12 |     20,30 |        7,92 |
| Sans raccourci de service            |   37,70 |  3,05 |     19,00 |        7,75 |
| Sans entrées de liste légères        |   34,05 |  1,45 |     18,70 |        7,84 |
| Fabriques par clonage                |   33,70 |  1,40 |     18,60 |        7,72 |

Refuser événements ou trous retire des composants entiers de la couverture
compilée et change leurs propriétaires. Cela ne mesure pas le coût isolé
d'un listener ou du dispatch d'un trou. Supprimer l'abaissement retire aussi
le raccourci de service : ces différences ne s'additionnent pas.
Les entrées légères n'apportent pas de gain de montage établi sur cette page.

## Entrées de liste : index paresseux conservés des deux côtés

Huit navigations par variante et cas, cinq boucles ; 5 000 lignes,
ou 128 champs pour le contrôle. L'ablation garde la spécialisation du
compilateur et les index paresseux. Elle remplace uniquement la disposition
des entrées légères par les entrées ordinaires, leurs contextes et commentaires.

| Cas                 | Montage sans entrées légères | Montage complet | Tas sans / avec |
| ------------------- | ---------------------------: | --------------: | --------------: |
| Lignes              |                        23,25 |           16,45 |   7,438 / 4,941 |
| Avec index          |                        32,70 |           23,75 |  11,229 / 8,729 |
| Quatre niveaux      |                        38,30 |           32,90 | 19,112 / 16,636 |
| Champs indépendants |                         3,15 |            3,35 |   1,878 / 1,878 |

Pour les lignes simples, inversion 5,63 → 3,08 ms et restauration
5,70 → 4,25 ms. Une petite modification reste comparable, avec des cas
légèrement plus lents en léger : ligne indexée 1,0 → 1,2 ms. Le contrôle
navigateur à 100 lignes compte 202 commentaires de liste contre 2 en léger,
hors chronomètre. Le tas JS ne mesure pas la mémoire native de ces commentaires.

Le clonage donne 17,30 ms pour les lignes simples, 22,35 pour les indexées,
32,10 pour les quatre niveaux et 3,40 pour les champs. Face à `create`,
le signe du résultat change selon le cas. Sur ce banc, le JS passe de
215 086 à 221 916 octets, gzip de 59 382 à 60 824 : aucun changement du défaut.

## Lectures de service : contrôle ciblé

Même composant Craft pour chaque ligne. Un état de service global est lu
dans les 5 000 lignes. Dans cette fixture uniquement, l'action nommée
`update-tenth` dans le runner modifie cet état partagé et touche donc
**toutes les lignes**. Ce n'est pas une modification de 10 % des objets.

| Variante                    | Montage | Mise à jour partagée | Tas après parcours |
| --------------------------- | ------: | -------------------: | -----------------: |
| Lectures directes corrigées |   24,00 |                 4,40 |              7,245 |
| Sans raccourci de service   |   32,20 |                 8,05 |              7,288 |
| Sans abaissement            |   35,70 |                 9,20 |              8,047 |

Le raccourci corrigé réduit ici le montage de 25 % et la mise à jour de 45 %
face à son ablation, dans la même cohorte. Les médianes de l'écran antérieur
à la correction ne servent pas à mesurer son accélération : elles proviennent
d'une autre cohorte. Sur ce banc, le raccourci ajoute 573 octets JS et
161 octets gzip face à son ablation.

La WeakMap demande aussi un enregistrement par déclaration de service,
même sans compilateur. Contrôle Core seul, huit navigations par variante,
500 déclarations d'échauffement puis 2 000 nouvelles déclarations conservées,
sans exécuter leurs factories : 6,05 → 6,15 ms ; tas retenu supplémentaire
2 822 680 → 2 847 904 octets. Bundle : +42 octets JS, +25 gzip.
Ce banc mesure le coût des déclarations, pas celui de la résolution ni un
bootstrap applicatif réaliste.

## Audit des anciens résultats

Les résultats bruts `lean-3`, `final-rows`, `page-lean-2` et `final-page-2`
ont été récupérés. Le runtime gelé `nolist` correspond exactement à son
empreinte enregistrée ; retirer son unique `return false` dans `leanItems`
reconstitue l'empreinte du runtime léger d'origine. Son option compilateur
`lists` était toujours vraie : son nom ne signifie pas « sans pass de listes ».

Sur 324 fichiers runtime gelés, 321 sont identiques au commit `7d2c8f75b`.
Les deux autres fichiers hors interpréteur ont la même structure AST JavaScript
émise ; l'interpréteur contient aussi de vrais écarts d'implémentation.
Les patches et comparaisons sont archivés. Le fichier TypeScript exact de
l'ancien compilateur n'a pas été retrouvé : sa reconstruction complète
n'est pas revendiquée. `page-lean-2` manque de métadonnées d'équivalence et
d'options ; ses chiffres restent un écran historique.

L'ancienne attribution « instance légère seule : 42,4 → 23,8 ms » regroupait
plusieurs mécanismes, notamment l'abaissement. Le rapport historique est
corrigé ; les ablations contrôlées ci-dessus remplacent cette attribution.

## Validation et reproduction

Compiler : **88 tests** ; Component : **609** ; Core : **1 699 réussites
ordinaires plus un échec attendu**, trois TODO préexistants. Contrôles
TypeScript réussis. Aucun nouvel échec de lint dans les fichiers runtime
modifiés ; zéro erreur dans les nouveaux tests. Le contrôle NX des frontières
est ignoré faute de graphe en cache ; aucune dépendance de projet n'est ajoutée.

Apple M3, Node 25.2.1, Chromium 153.0.8010.12. Production minifiée, contextes
frais, ordre mélangé déterministe ; blocs adjacents pour les bancs de lignes
et de services. Aucun test ou build concurrent pendant ces cohortes finales.
Les durées de build restent sensibles au cache et à l'ordre. Montage et
actions mesurent le travail synchrone JS/DOM, pas LCP ou INP.

```sh
node apps/compiler-benchmark/experiments/compiler-ablations.mjs
node apps/compiler-benchmark/experiments/validate-ablations.mjs
PAGE_RUNS=8 CAMPAIGN_OUTPUT=compiler-ablations-page \
  PAGE_COMPILER_OPTIONS='{"ablation-lower":{"lower":false},"ablation-services":{"directServices":false},"ablation-clone":{"dom":"clone"}}' \
  node apps/compiler-benchmark/experiments/run-page.mjs ablation-full ablation-events ablation-holes ablation-lower ablation-services ablation-list-entries ablation-clone
COMPILER_RUNS=8 COMPILER_ROWS=5000 COMPILER_ITERATIONS=5 CAMPAIGN_BLOCKED=true \
  CAMPAIGN_COMMENT_COUNTS=true CAMPAIGN_OUTPUT=compiler-ablations-list \
  CAMPAIGN_COMPILER_OPTIONS='{"ablation-clone":{"dom":"clone"}}' \
  node apps/compiler-benchmark/experiments/run-micro.mjs ablation-full ablation-list-entries ablation-clone
COMPILER_RUNS=8 COMPILER_CASES=rows COMPILER_ROWS=5000 COMPILER_ITERATIONS=5 \
  CAMPAIGN_BLOCKED=true CAMPAIGN_SERVICE_FIXTURE=true CAMPAIGN_OUTPUT=compiler-ablations-services \
  CAMPAIGN_COMPILER_OPTIONS='{"ablation-services":{"directServices":false},"ablation-lower":{"lower":false}}' \
  node apps/compiler-benchmark/experiments/run-micro.mjs ablation-full ablation-services ablation-lower
node apps/compiler-benchmark/experiments/run-service-definitions.mjs
node apps/compiler-benchmark/experiments/audit-legacy-compiler.mjs
node apps/compiler-benchmark/experiments/archive-compiler-ablations.mjs
```

L'audit historique utilise le checkout voisin `craft-ts-compiler`, configurable
avec `LEGACY_COMPILER_ROOT`. Les candidats déjà matérialisés sont réutilisés ;
une reconstruction demande un répertoire de laboratoire neuf. La campagne
globale demeure incomplète ; son
[inventaire](2026-11-17-performance-campaign.json) conserve les pistes restantes.
