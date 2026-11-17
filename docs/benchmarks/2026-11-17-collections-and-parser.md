# Grandes collections, ordonnancement et coût du frontend du compilateur

17 novembre 2026. Code des bibliothèques : `cd3d220e9`, après l'extension des
listes locales. Les [données et méthodes](2026-11-17-collections-and-parser-summary.json)
archivent cinq pistes supplémentaires du [manifeste](2026-11-17-performance-campaign.json).
La campagne complète reste inachevée. Aucun composant de rendu impératif n'est
réintroduit et aucune de ces stratégies n'est activée dans les bibliothèques.

Les résultats les plus utiles concernent le nombre d'éléments réellement montés
et le choix entre montage synchrone et progressif. La virtualisation réduit
fortement les coûts, avec un contrat différent pour les lignes hors fenêtre.
Le montage progressif rend les premières lignes disponibles plus tôt, mais
augmente le temps nécessaire pour terminer la collection. Une politique
progressive uniquement au premier montage évite ensuite certains délais de
mise à jour, tout en réintroduisant des tâches bloquantes sur les grosses opérations.

## Protocole et périmètre des mesures

Apple M3, Node 25.2.1, Chromium 153.0.8010.12, production minifiée, contextes
neufs et ordre entrelacé à graine fixe. Sept navigations par variante ; les
contrats précèdent les timings. Des navigations distinctes enregistrent les
événements Layout/Paint. Les bibliothèques et le plugin sont ceux du même
checkout ; leurs empreintes sont conservées avec les artefacts.

Chaque ligne contient un bouton **composant Craft**, trois cellules et un index.
Les templates des cinq définitions sont compilés en mode `lean`. La collection
initiale compte 10 000 objets, y compris dans le cas virtualisé. Les données
restent donc en mémoire quand leurs lignes quittent le DOM.

Les comparaisons sont séparées en cohortes : blocs de 50 lignes pour le CSS
hors écran ; vraie table pour son algorithme de largeur ; liste avec la même
projection pour le rendu complet, la fenêtre et l'ordonnancement. Les coûts
des cohortes ne sont pas additionnés. Les blocs impliquent notamment davantage
de contextes et de lecteurs que la liste plate.

« Première peinture possible » désigne deux callbacks d'animation après
l'observation des premières lignes. C'est une **possibilité de peinture**,
pas un timestamp de présentation, un LCP ou un INP. Les temps sont relatifs au
début du bootstrap, après le chargement des modules et la préparation des données.
Les mises à jour distinguent l'envoi du travail et l'obtention du DOM de contrôle
attendu ; le layout et la peinture suivants sont mesurés séparément.

La sonde de complétude compte les lignes via un MutationObserver. Son coût
reste inclus : environ 1,6 ms cumulée dans la liste complète et 10,4 ms dans
le montage progressif de la première cohorte. Le heap est le JS retenu après
GC explicite, avant les mises à jour ; il n'inclut pas toute la mémoire native
du navigateur. Chaque cohorte utilise un bundle commun à ses variantes : ses
tailles ne mesurent pas le coût d'une nouvelle bibliothèque de virtualisation.

## Virtualisation : gain important, contrat réduit

La fenêtre contient initialement 28 lignes, puis au plus 36 avec l'overscan,
plus une éventuelle ligne portant le focus. Des espaces de hauteur connue
conservent la géométrie de la collection. La hauteur des lignes est fixée à 32 px ;
ce prototype ne gère pas les hauteurs variables.

Même cohorte, médianes :

| Mesure                              | Liste complète |      Fenêtre |
| ----------------------------------- | -------------: | -----------: |
| Bootstrap JS                        |        86,8 ms |   **5,6 ms** |
| Premières lignes, peinture possible |       341,1 ms |  **38,5 ms** |
| Heap après montage                  |      27,83 Mio | **2,40 Mio** |
| Éléments natifs dans le montage     |         50 001 |      **142** |
| Layout initial, métrique CDP        |       135,2 ms |       3,1 ms |
| Modifier une ligne, DOM à jour      |         4,0 ms |       0,4 ms |
| Inverser la collection, DOM à jour  |        92,8 ms |       1,4 ms |

La colonne « fenêtre » n'a pas réalisé le même travail total : les autres lignes
ne sont pas montées. Ce gain est celui d'une autre politique d'affichage,
pas une accélération transparente du renderer pour 10 000 composants présents.

Contrats vérifiés : bouton Craft qui modifie la donnée, index global correct
après défilement, hauteur totale stable, nœud et focus conservés sur une ligne
épinglée hors fenêtre, retour dans la fenêtre et destruction. Le cache de
projection conserve seulement la fenêtre courante et la ligne épinglée.

Les limites sont observées : le dernier bouton hors fenêtre manque à l'arbre
AX, `window.find('Row 999')` ne le trouve pas et seulement 28 lignes existent
dans le DOM sous média print. Après avoir épinglé le focus sur la ligne 0 et
défilé vers la ligne 500, Tab passe au prochain bouton **monté**, celui de la
ligne 492, au lieu de la ligne 1. Un éventuel composant public devrait définir
sa navigation, sa recherche et son impression. **Aucune API publique n'est ajoutée.**

## `content-visibility` : moins de layout, autant de composants

Deux variantes utilisent les mêmes blocs de 50 lignes. Le candidat ajoute
`content-visibility: auto` et `contain-intrinsic-size: auto 1600px`. Tous les
composants et nœuds restent créés. Ce mécanisme permet au navigateur de différer
le rendu des sous-arbres hors écran ; son estimation de taille doit correspondre
au contenu. [Documentation MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility).

| Mesure                              | Blocs ordinaires | Blocs hors écran différés |
| ----------------------------------- | ---------------: | ------------------------: |
| Bootstrap JS                        |         418,1 ms |                  387,6 ms |
| Premières lignes, peinture possible |         623,4 ms |                  408,9 ms |
| Layout initial, métrique CDP        |         108,3 ms |                **3,5 ms** |
| Recalcul de style initial, CDP      |          35,1 ms |                **1,5 ms** |
| Heap après montage                  |        35,84 Mio |                 35,84 Mio |
| Éléments natifs                     |           50 201 |                    50 201 |

La trace séparée confirme le changement de coût navigateur : Layout médian
98,0 → 3,3 ms, Paint 2,44 → 1,53 ms. Le JS de mise à jour reste coûteux dans
ces blocs ; une modification déclenche encore des reconstructions de lecteurs
et des patches. Les lignes qui changent de bloc lors d'une inversion perdent
leur nœud dans **les deux** variantes, conformément à leur découpage en listes.

Le contrôle d'accessibilité empêche d'en faire un réglage automatique : le
bouton de la ligne 999 n'apparaît pas dans la requête ni dans l'arbre AX complet
avant activation du bloc. L'observation est reproduite avec et sans l'argument
Chromium `--force-renderer-accessibility=complete`. Le bouton apparaît
immédiatement après qu'on lui donne le focus. Ce résultat CDP ne constitue pas
une certification de tous les lecteurs d'écran ; il interdit ici de revendiquer
une équivalence d'accessibilité déjà démontrée.

Tab entre les lignes 49 et 50 fonctionne, `window.find` trouve la ligne 999,
le focus hors écran fonctionne et les dimensions restent stables. Une règle
print désactive le saut de rendu et les 1 000 lignes du contrôle restent au DOM ;
aucun PDF imprimé n'est validé. **Piste mesurée et restreinte, sans activation produit.**

## Table de largeur connue

Les deux tables ont une largeur de 1 024 px et des colonnes déclarées. Le candidat
utilise `table-layout: fixed`, ce qui rend le calcul horizontal indépendant du
contenu des autres lignes, avec une politique explicite de débordement.
[Documentation MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/table-layout).

| Mesure                              | Automatique |         Fixe |
| ----------------------------------- | ----------: | -----------: |
| Bootstrap JS                        |     74,7 ms |      73,5 ms |
| Premières lignes, peinture possible |    423,8 ms |     402,3 ms |
| Layout initial, métrique CDP        |    217,4 ms | **192,1 ms** |
| Heap après montage                  |   26,35 Mio |    26,35 Mio |

La trace séparée donne Layout 187,7 → 169,2 ms, tandis que Paint reste proche
de 15,2 ms. Le gain est plus modeste que celui des blocs hors écran et concerne
le navigateur, pas une réduction des instances Craft.

Le contrôle avec une cellule de 300 caractères montre le changement de contrat :
la largeur défilable passe de 1 072 à 4 238 px avec le layout automatique et
reste à 1 072 px avec le layout fixe, qui tronque le texte. Le choix dépend donc
de la politique de colonnes de l'application. **Aucune réécriture automatique
des tables n'est retenue.**

## Montage progressif : distinguer premier écran et travail terminé

La première cohorte compare la liste complète et `scheduleFor` avec un budget
de 4 ms. Le bootstrap passe de 86,8 à 16,8 ms, mais cela ne signifie pas que la
collection a fini de se monter :

| Mesure                               |    Synchrone |  Progressif |
| ------------------------------------ | -----------: | ----------: |
| Premières lignes, peinture possible  |     341,1 ms | **73,2 ms** |
| Toutes les lignes, peinture possible | **341,1 ms** |    671,8 ms |
| Layout total initial, CDP            |     135,2 ms |    160,7 ms |
| Paint, trace séparée                 |      7,39 ms |    41,11 ms |
| Heap après montage                   |    27,83 Mio |   27,88 Mio |
| Pic de retard du timer, médiane      |     318,8 ms |     34,3 ms |

La sonde ne relève aucune tâche de plus de 50 ms au montage progressif dans
ces sept navigations. Les étapes de rendu répétées augmentent toutefois le
travail total et le nombre de peintures. Le budget JS ne borne pas à lui seul
le coût du layout, de la peinture ou le retard d'une entrée utilisateur.

Les contrats interrompent le montage avec une modification de source, puis
avec une destruction. La collection finale ne contient que les 2 500 lignes
paires attendues, ou aucune ligne après destruction ; les tâches annulées ne
recréent pas de nœuds. Les boutons et les réordonnancements sont contrôlés après
la fin effective des mises à jour différées, pas seulement après leur envoi.

### Progressif seulement au premier montage

Un petit scheduler de **benchmark** enveloppe le `FrameForScheduler` existant.
Il attend la fin du premier groupe de tâches, puis délègue au scheduler synchrone.
La transition est vérifiée après la microtâche courante : annuler une ancienne
source et programmer sa remplaçante dans le même tour ne termine pas la phase
prématurément. Quatre tests couvrent cette transition, les annulations,
la destruction et les erreurs. Le fixture et la politique passent TypeScript.

Le premier écran exploratoire changeait également la façon de fournir le
scheduler. Une **nouvelle cohorte** ajoute donc un contrôle avec le même
`FrameForScheduler` fourni explicitement, mais conservé en mode frame.
On peut ainsi isoler la politique de phase. Sept navigations par variante :

| Mesure                                   | Synchrone | `scheduleFor` actuel | Frame fourni | Frame au montage initial |
| ---------------------------------------- | --------: | -------------------: | -----------: | -----------------------: |
| Premières lignes, peinture possible      |  298,4 ms |              71,6 ms |      49,6 ms |                  50,2 ms |
| Collection terminée, peinture possible   |  298,4 ms |             670,6 ms |     604,6 ms |                 605,0 ms |
| Modifier une ligne, DOM à jour           |    3,8 ms |              33,1 ms |      16,8 ms |               **3,8 ms** |
| Inverser 10 000 lignes, DOM à jour       |   87,7 ms |             666,8 ms |     568,0 ms |              **92,7 ms** |
| Ajouter ensuite 1 000 lignes, DOM à jour |   11,2 ms |              81,0 ms |      65,9 ms |              **10,9 ms** |

Le contrôle confirme l'intérêt de la transition pour la latence des mises à jour.
Il montre aussi sa limite : le gros réordonnancement redevient un travail JS
synchrone d'environ 92 ms. Lors de l'ajout tardif, la sonde relève des tâches
de 52–54 ms dans cinq des sept fenêtres d'observation du candidat, contre une
seule pour le Frame maintenu actif. Les temps « DOM à jour » n'incluent pas la
peinture finale de cet ajout.

Les premières possibilités de peinture du Frame fourni et du candidat sont
équivalentes ; leur différence avec `scheduleFor` actuel ne doit pas être
attribuée à la transition de phase. Le retard maximal du timer reste aussi
plus élevé pour ces deux politiques fournies (environ 72–73 ms) que pour le
scheduler actuel (34 ms) dans cette cohorte. **Prototype conservé pour une
politique applicative explicite, sans changer le comportement par défaut.**

## OXC : le parsing seul ne justifie pas le remplacement

Le banc utilise `parseSync` de `rolldown/utils` 1.2.5, déjà installé, et TypeScript
6.0.3. Treize modules réels de la page et du banc des lignes représentent
48 667 octets. Sept processus frais exécutent chacun cinq échauffements et
35 boucles avec ordre mélangé. Les AST OXC sont matérialisés en objets JavaScript
en lisant `program` ; mesurer seulement la partie native aurait ignoré ce coût.
L'API documente ce travail de désérialisation synchrone.
[Rolldown parseSync](https://rolldown.rs/reference/Function.parseSync),
[source de l'API](https://github.com/rolldown/rolldown/blob/main/packages/rolldown/src/utils/parse.ts).

| Travail sur tout le corpus                 |     Médiane |
| ------------------------------------------ | ----------: |
| Parsing TypeScript, AST avec parents       | **2,48 ms** |
| Parsing OXC, AST JavaScript matérialisé    |     3,82 ms |
| Compilateur actuel complet                 |    11,28 ms |
| Contrôle hypothétique avec parsing gratuit |     8,40 ms |

Le dernier contrôle prépare un **nouvel AST TypeScript** avant chaque intervalle
mesuré ; le binding des symboles, l'analyse, l'émission et les sourcemaps restent
chronométrés. Il ne réutilise pas un AST déjà lié. Ses sorties sont identiques,
mais le coût de construction a été retiré artificiellement : c'est un plafond
expérimental, pas un compilateur OXC implémenté.

Une instrumentation distincte situe les coûts du pipeline : parsing 2,60 ms,
création/binding du checker 2,78 ms, analyse 3,94 ms, sourcemaps 1,33 ms,
total 11,67 ms. Le temps instrumental n'est pas substitué au benchmark ordinaire.

Dix-sept contrôles vérifient le parsing, les positions UTF-16, les sorties et
les sourcemaps des variantes diagnostiques. Passer directement l'AST OXC à
l'analyse actuelle échoue comme prévu : ce n'est pas un `SourceFile` TypeScript,
et le checker lexical actuel ne peut pas le consommer. Une migration demanderait
une autre analyse ou un adaptateur, dont le coût n'est pas dissimulé ici.

Sur ce corpus et cette API, le parsing OXC avec AST JavaScript coûte davantage
que celui de TypeScript. **Frontend actuel conservé.** Cela ne conclut rien sur
un futur backend réalisant aussi son analyse en Rust, et ne prédit aucun gain
de montage navigateur : cette piste concerne le build.

## Reproduire et poursuivre

```sh
npm run compiler:build
node apps/compiler-benchmark/experiments/validate-collections.mjs
COLLECTION_RUNS=7 COLLECTION_TRACES=3 \
  node apps/compiler-benchmark/experiments/run-collections.mjs
COLLECTION_MODES=full,scheduled,scheduled-provided,scheduled-initial \
  COLLECTION_RUNS=7 COLLECTION_TRACES=3 COLLECTION_APPEND=true \
  COLLECTION_OUTPUT=collections-initial-confirmed \
  node apps/compiler-benchmark/experiments/run-collections.mjs
COLLECTION_MODES=visibility,windowed COLLECTION_RUNS=0 COLLECTION_TRACES=0 \
  COLLECTION_OUTPUT=collections-accessibility \
  node apps/compiler-benchmark/experiments/run-collections.mjs
COLLECTION_MODES=visibility COLLECTION_AX_FORCE=true \
  COLLECTION_RUNS=0 COLLECTION_TRACES=0 \
  COLLECTION_OUTPUT=collections-accessibility-forced \
  node apps/compiler-benchmark/experiments/run-collections.mjs
node apps/compiler-benchmark/experiments/run-parser.mjs
```

Les fixtures, CSS, runners effectifs des cohortes, distributions et événements
de trace utiles sont dans le JSON. Les sources des fixtures initiales y sont
figées : le script courant contient ensuite le contrôle Frame fourni et les
diagnostics clavier supplémentaires. Les essais restent dans le laboratoire.

Le manifeste compte désormais neuf nouvelles pistes mesurées et trois audits
historiques, avec d'autres pistes encore ouvertes. Les bindings, les rebinds,
le marquage versionné, les imports, la couverture des templates, les fabriques
DOM, le bundle et l'hydratation demandent encore du travail. Ces résultats
ne constituent pas l'achèvement de l'objectif complet.
