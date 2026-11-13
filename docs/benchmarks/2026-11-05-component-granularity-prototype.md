# Prototype : réactivité au niveau du composant

**Le test confirme un gain au montage sur cette liste : environ 20 à 34 %.**
Le runtime existant permet déjà l'expérience : lire les entrées dans le template
et produire des valeurs ordinaires concentre les dépendances dans l'effet de
rendu du composant. Aucun nouveau moteur ni paramètre public n'est nécessaire
pour ce cas synchrone.

La contrepartie est mesurée : dans un composant avec 128 champs indépendants,
modifier un champ relit 128 valeurs et réexécute le template, contre une seule
lecture et aucune réexécution du template avec les bindings fins.

## Question et portée du prototype

Comparer le montage et les mises à jour de deux styles de composant :

- Le template retourne des fonctions/générateurs pour les valeurs dynamiques :
  chaque binding a son effet.
- Le template lit lui-même les valeurs et retourne du texte et des attributs
  ordinaires : l'effet `component-render` suit ces lectures et réconcilie les
  nouvelles descriptions de nœuds.

Le fichier `row-by-component.prototype.ts` définit **RowByComponentPrototype**
avec `craftComponent`, les mêmes inputs, le même nom de composant et le même DOM
visible que la référence. Il est substitué uniquement dans les snapshots du
runner. Ce n'est pas une nouvelle API générique `renderStrategy` ni un mode
certifié pour toutes les fonctionnalités de CraftTS.

Ce prototype répond à une question de stratégie d'exécution. L'interface visuelle
reste identique ; les validations sont pilotées par le navigateur du benchmark.
Le code est explicitement expérimental, sans persistance ni changement du runtime
normal du worktree.

## Ce qui change concrètement

Exemple simplifié de la référence :

```ts
(inputs) =>
  div(
    {
      'data-row': function* () {
        return (yield* inputs.row()).id;
      },
    },
    function* () {
      return (yield* inputs.row()).label;
    },
  );
```

Prototype au niveau du composant :

```ts
(inputs) => {
  const row = craftUse(inputs.row());
  return div({ 'data-row': row.id }, row.label);
};
```

Quand l'entrée change, le template du prototype est réexécuté et ses descriptions
statiques sont réconciliées. Les nœuds DOM conservés sont patchés, pas remplacés
systématiquement. Les callbacks de lecture par binding et leurs effets n'existent
plus pour ces valeurs.

Le prototype partage aussi la lecture de `row` entre l'ID et le libellé, et celle
de `position` entre l'attribut et le texte de position. Le gain mesure donc ce
style de template complet : **moins d'effets, moins de lecteurs exécutés et des
descriptions régénérées lors des changements**. Il n'isole pas uniquement le coût
de création d'un observateur à nombre de lectures et d'allocations constant.

## Protocole et variantes

- Runtime CraftTS **`e135eeec9f29c8daf6031d32bec780f9c8d99d6e`**, sans modification des sources Core/Component
  du worktree. Les scopes allégés sont appliqués seulement dans des copies
  temporaires, comme dans le diagnostic précédent.
- Apple M3, Node **v22.23.0**,
  Chromium **153.0.8010.12**, Vite 8.3.1, production minifiée.
- Liste : 1 000/5 000 lignes, avec/sans positions affichées, CPU normal.
- Quatre variantes : bindings fins, fins avec scopes allégés, template par
  composant, puis composant avec scopes allégés.
- Cinq navigations par cellule et quatre interactions mesurées par famille,
  après deux de préchauffage. Les directions du filtre sont séparées. Nouveau
  contexte navigateur à chaque navigation ; variantes mélangées avec graine 535.
- **80 navigations et 1 280 interactions mesurées**. Ordre, contenu, positions et
  identité DOM vérifiés après chaque action ; destruction finale vérifiée.
- Compteurs : douze navigations distinctes, hors classement des durées.
- Composant à champs indépendants : douze navigations chronométrées et quatre
  sondes de compteurs distinctes, avec 32 puis 128 champs, ordre alterné.
- Le contrôle initial sur dix lignes a aussi réussi huit navigations.
- Aucun autre framework n'est relancé. Les builds sont préparés avant la mesure.

Les tableaux utilisent la médiane des cinq montages et regroupent les vingt
interactions par action, ou dix par direction du filtre. La durée va jusqu'à la
notification DOM, avant peinture ; ce n'est pas un score INP. Le tas JS est relevé
après les interactions et une collecte forcée, pas au pic de mémoire.

## Montage : effet de la stratégie seule

| Lignes | Index affiché | Bindings fins | Template par composant | Gain de montage |
| -----: | ------------- | ------------: | ---------------------: | --------------: |
|  1 000 | non           |      54,80 ms |               43,80 ms |         20,07 % |
|  1 000 | oui           |      70,80 ms |               46,90 ms |         33,76 % |
|  5 000 | non           |     227,70 ms |              157,00 ms |         31,05 % |
|  5 000 | oui           |     303,40 ms |              199,10 ms |         34,38 % |

La comparaison après allègement des injecteurs garde également un gain pour le
mode composant : **48,00 → 37,90 ms** à 1 000 lignes sans index,
**56,40 → 43,10 ms** avec index, **167,90 → 135,70 ms** à 5 000 sans index,
et **246,50 → 164,10 ms** avec index. Il subsiste donc un coût des nombreux
bindings, de leurs lecteurs et de leur suivi, même avec les mêmes nombres
d'injecteurs dans ces deux variantes allégées.

En combinant les deux changements, le gain de montage face à la référence de
cette campagne est d'environ **31 à 46 %**. Les pourcentages des deux changements
ne s'additionnent pas, et ces résultats restent ceux de ce scénario.

## Résultats complets

### 1 000 lignes sans index

| Stratégie                     | Montage | Un item | 10 % des items | Inversion | Filtrer | Rétablir | Tas JS après GC |
| ----------------------------- | ------: | ------: | -------------: | --------: | ------: | -------: | --------------: |
| Bindings fins                 |   54,80 |    0,50 |           6,75 |      4,70 |    7,75 |    24,15 |       23,12 Mio |
| Bindings fins, scopes allégés |   48,00 |    0,50 |           4,65 |      4,60 |    5,50 |    17,30 |       14,45 Mio |
| Template par composant        |   43,80 |    0,50 |           3,80 |      4,70 |    5,50 |    16,80 |       16,03 Mio |
| Composant, scopes allégés     |   37,90 |    0,50 |           4,45 |      4,55 |    4,15 |    17,65 |       11,81 Mio |

### 1 000 lignes avec index

| Stratégie                     | Montage | Un item | 10 % des items | Inversion | Filtrer | Rétablir | Tas JS après GC |
| ----------------------------- | ------: | ------: | -------------: | --------: | ------: | -------: | --------------: |
| Bindings fins                 |   70,80 |    0,50 |           6,65 |      9,80 |   13,10 |    31,70 |       31,18 Mio |
| Bindings fins, scopes allégés |   56,40 |    0,50 |           5,40 |      8,85 |    9,25 |    28,10 |       18,31 Mio |
| Template par composant        |   46,90 |    0,45 |           3,10 |     11,05 |   11,70 |    21,20 |       17,36 Mio |
| Composant, scopes allégés     |   43,10 |    0,50 |           3,55 |      9,95 |    8,90 |    19,60 |       13,07 Mio |

### 5 000 lignes sans index

| Stratégie                     | Montage | Un item | 10 % des items | Inversion | Filtrer | Rétablir | Tas JS après GC |
| ----------------------------- | ------: | ------: | -------------: | --------: | ------: | -------: | --------------: |
| Bindings fins                 |  227,70 |    1,10 |          15,55 |     14,50 |   36,25 |    90,05 |      105,00 Mio |
| Bindings fins, scopes allégés |  167,90 |    1,10 |          11,50 |     14,50 |   18,85 |    74,95 |       62,16 Mio |
| Template par composant        |  157,00 |    1,00 |          10,30 |     15,45 |   41,45 |    71,40 |       70,40 Mio |
| Composant, scopes allégés     |  135,70 |    1,10 |           8,40 |     16,20 |   17,65 |    60,90 |       49,08 Mio |

### 5 000 lignes avec index

| Stratégie                     | Montage | Un item | 10 % des items | Inversion | Filtrer | Rétablir | Tas JS après GC |
| ----------------------------- | ------: | ------: | -------------: | --------: | ------: | -------: | --------------: |
| Bindings fins                 |  303,40 |    1,10 |          19,00 |     39,60 |   59,20 |   144,80 |      146,35 Mio |
| Bindings fins, scopes allégés |  246,50 |    1,10 |          12,45 |     36,30 |   41,30 |   112,70 |       81,41 Mio |
| Template par composant        |  199,10 |    1,10 |          10,25 |     43,15 |   45,75 |    97,95 |       77,26 Mio |
| Composant, scopes allégés     |  164,10 |    1,05 |           9,50 |     42,10 |   37,90 |    90,05 |       55,83 Mio |

La variante composant améliore plusieurs mises à jour sur cette liste. Les
bindings d'ID et de libellé de la référence dépendent tous deux de l'objet `row`
remplacé : ils réagissent donc déjà ensemble à ce type de changement. Le partage
de lecture et la suppression d'effets peuvent l'emporter sur la reconstruction
des descriptions.

Les permutations avec index montrent la contrepartie : **9,80 → 11,05 ms** à
1 000 lignes et **39,60 → 43,15 ms** à 5 000 pour la stratégie seule. Changer une
position relance tout le template de la ligne, y compris les lectures d'ID et de
libellé. À 5 000 lignes sans index, le filtre seul passe aussi de 36,25 à 41,45 ms
avec le prototype non allégé ; les variantes allégées réduisent ce coût.
La stratégie composant n'est donc pas gagnante sur chaque action.

## Compteurs au montage

À 1 000 lignes sans index :

| Variante                  | Injecteurs | Providers | Effets actifs | Watches | Exécutions du moteur de générateurs |
| ------------------------- | ---------: | --------: | ------------: | ------: | ----------------------------------: |
| Bindings fins             |      5 017 |    36 142 |         4 003 |   4 004 |                               7 009 |
| Fins, scopes allégés      |      1 014 |     8 121 |         4 003 |   4 004 |                               7 009 |
| Composant                 |      3 017 |    22 142 |         2 003 |   2 004 |                               4 009 |
| Composant, scopes allégés |      1 014 |     8 121 |         2 003 |   2 004 |                               4 009 |

Avec index, le nombre d'effets fins passe à **6 003**, celui du prototype reste
à **2 003**. Il reste un effet d'entrée `forNode` et un effet de composant par
ligne, ainsi que les structures fixes de l'app. Ce prototype ne remplace pas
les 1 000 composants par un seul observateur global.

## Compromis sur des champs indépendants

Un second prototype possède 32 puis 128 signaux scalaires indépendants, rendus
par un seul composant. On modifie un seul champ, au début ou à la fin. Les lectures
et réexécutions sont comptées dans des navigations séparées des mesures de temps.

| Champs | Stratégie     | Effets actifs | Lectures par changement d'un champ | Réexécutions du template | Montage médian | Mise à jour médiane |
| -----: | ------------- | ------------: | ---------------------------------: | -----------------------: | -------------: | ------------------: |
|     32 | Bindings fins |            33 |                                  1 |                        0 |        3,70 ms |             0,20 ms |
|     32 | Composant     |             1 |                                 32 |                        1 |        3,00 ms |             0,55 ms |
|    128 | Bindings fins |           129 |                                  1 |                        0 |        6,00 ms |             0,20 ms |
|    128 | Composant     |             1 |                                128 |                        1 |        4,20 ms |             0,80 ms |

Le comptage vérifie exactement les indices relus, et pas seulement leur somme.
Les éléments **et** leurs nœuds texte sont conservés après les mises à jour.
Les durées sous la milliseconde sont sensibles à la résolution du chronomètre et
au bruit ; les nombres de lectures constituent ici la preuve la plus nette du
travail supplémentaire. Cette différence reste petite pour ces champs triviaux.

## Diagnostics et reproductibilité

Cette expérience a un impact plus large que l'optimisation des injecteurs seuls :

- Les effets de texte et d'attributs ont réellement été regroupés. Le nombre et
  les sources des rapports d'effets changent intentionnellement.
- Les traces de rendu du composant évoluent : le template est réexécuté là où
  seuls des bindings auraient été réévalués. On ne promet pas des traces identiques.
- Le descripteur replay de la racine est comparé entre les variantes de liste.
- Dans le prototype de champs indépendants, **1 120 résolutions de cibles DOM**
  capturées dans l'autre stratégie réussissent, réparties sur quatorze comparaisons.
  Les descripteurs des champs sont identiques entre les stratégies.
- Après destruction, aucun champ/ligne ni rapport d'effet actif ne reste dans
  les validations. Les signaux globaux du petit prototype vivent avec la page.

Ces contrôles portent sur les adresses DOM et les comportements synchrones de
ces deux fixtures. Ils ne certifient **pas** la compatibilité d'archives complètes,
ni les mécanismes async/pending, les exceptions, les providers de composants,
les services à effets de bord ou SSR/hydratation avec ce style de template.
Aucun basculement par défaut n'est proposé sur cette seule expérience.

## Reproduire et revoir

Une commande depuis le dépôt :

```sh
npm --prefix apps/framework-benchmark run bench:component-prototype
```

Le script exécute successivement les compteurs, le contrôle des champs indépendants
et la campagne de liste, puis produit un résumé. `COMPONENT_PROTOTYPE_RUNS` et
`COMPONENT_PROTOTYPE_ITERATIONS` ajustent les mesures ; `COMPONENT_PROTOTYPE_OUTPUT`
choisit le dossier de sortie. Éviter toute autre campagne de perf en parallèle.

- [Composant de ligne expérimental](../../apps/framework-benchmark/src/craft/row-by-component.prototype.ts).
- [Composant à champs indépendants](../../apps/framework-benchmark/src/craft/fanout-by-component.prototype.ts).
- [Commande du prototype](../../apps/framework-benchmark/component-granularity.prototype.mjs).
- [Statistiques et provenance](2026-11-05-component-granularity-summary.json).
- Données brutes : `tmp/component-granularity/timing/timing.json`,
  `counts/counts.json`, `fanout/results.json` et `summary.json`.

Les scripts et fixtures sont marqués `prototype`. **116 navigations au total**
ont passé les contrôles, en incluant le contrôle initial sur dix lignes. Les
sources normales de `libs/core` et `libs/component` sont inchangées. Aucun commit
ni push. Les prototypes restent isolés pour revue, sans adoption en production.
