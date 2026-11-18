# Diagnostic du coût de montage — 5 novembre 2026

**L'usage courant de cette app paraît acceptable ; le coût est concentré dans
les créations/destructions massives.** Les clics natifs sur 1 000 lignes donnent
surtout des durées rapportées de 16 à 40 ms jusqu'à la peinture, sans index affiché.
Le montage reste une tâche longue sur le M3, et les gros lots deviennent sensibles
avec CPU ralenti. Ce diagnostic isole des pistes qui conservent l'outillage,
plutôt que de prendre un framework concurrent comme seuil absolu de qualité.

## Périmètre et preuves

- Runtime **`e135eeec9f29c8daf6031d32bec780f9c8d99d6e`**, inchangé dans le worktree.
- Apple M3, Node v22.23.0, Chromium 153.0.8010.12.
- Copies temporaires des bibliothèques et de l'app ; aucune sonde dans le runtime
  du worktree. Chaque variante conserve une empreinte des sources et une copie
  des fichiers modifiés dans `tmp/mount-diagnosis*/prototypes/`.
- **314 navigations chronométrées** dans quatre campagnes : 96 pour le tri initial,
  140 pour la confirmation à cinq navigations, 48 pour les préfixes, 30 pour le
  contrôle inline/scopes. Variantes mélangées avec graine fixe 535.
- Trois ou cinq navigations par cellule ; quatre interactions mesurées par action
  et navigation après deux de préchauffage. Filtrage et rétablissement séparés.
- Contrôles d'ordre, texte, position et identité DOM après chaque action. Les
  signatures des rapports d'effets, le descripteur replay de la racine et le nettoyage
  final ont aussi été comparés : **192 comparaisons compatibles réussies**.
- Les temps des variantes instrumentées de compteurs ne servent pas au classement.
  Les tableaux de durée utilisent des variantes distinctes sans ces compteurs.
- Les mesures vont jusqu'à la notification DOM, sans attendre sa peinture. La
  sonde de clics natifs plus bas utilise une autre mesure et le runtime non modifié.
- Les campagnes sont séquentielles, sans autre benchmark de cette étude en parallèle.
  JIT, collecte et charge extérieure produisent des variations : les médianes
  et gains ne sont pas des seuils garantis, ni des pourcentages additifs.

## 1. Ce qui est créé pour une liste simple

Mesures au montage, sans positions affichées :

| Ressource/appel                     | 1 000 lignes | 5 000 lignes |
| ----------------------------------- | -----------: | -----------: |
| Injecteurs créés                    |        5 017 |       25 017 |
| Enregistrements de providers        |       36 142 |      180 142 |
| Appels de création d’identité       |        5 003 |       25 003 |
| Encodages de segment d’identité     |       34 009 |      170 009 |
| Exécutions du moteur de générateurs |        7 009 |       35 009 |
| Observateurs réactifs créés         |        4 004 |       20 004 |
| Enregistrements de cible replay     |        1 001 |        5 001 |

Par ligne, ce scénario crée **un injecteur de composant et quatre scopes d'effet** :
le rendu de l'entrée `forNode`, le rendu du composant, l'attribut `data-row` et le
texte. Cela représente cinq injecteurs et 36 enregistrements de providers par
ligne, en plus du coût fixe de l'app. Quatre signaux par ligne portent l'index,
les deux entrées du composant et ses propriétés d'hôte. Avec les index affichés,
deux effets de binding supplémentaires par ligne sont créés : attribut et texte.

Les 133 327 opérations de `get`/`getOptional` comptées à 1 000 lignes incluent les
remontées dans les injecteurs parents ; ce ne sont pas autant de lectures
explicitement écrites dans le template. Les tags et services d'observabilité
participent aussi à ces résolutions.

### Hypothèse des erreurs : écartée comme cause principale

Le compteur direct de création d'erreurs d'absence et la sonde globale `Error`
observent **une seule erreur `ForSchedulerServiceToken` au montage**, quelle que
soit la taille de liste, puis aucune supplémentaire pendant ces actions.
La sonde intercepte l'appel et la construction d'`Error`, avec un contrôle positif
explicite dans les deux formes. Ces deux erreurs de contrôle ne font pas partie
du travail applicatif. L'ancienne répétition de milliers d'erreurs sur les traces
n'est pas reproduite ici. Le miss du scheduler pourrait être évité, mais son coût
constant n'explique pas la pente par ligne.

## 2. Piste prioritaire : les scopes des effets simples

Dans [craft-effect.ts](../../libs/core/src/lib/craft-effect.ts), un injecteur taggé
est créé pour chaque effet. Pour un corps de fonction simple, le corps est déjà
exécuté via son propriétaire ; l'injecteur supplémentaire fournit surtout les
tags du rapport et son propre nettoyage. Le prototype calcule ces tags directement
et conserve un vrai scope pour les factories génératrices qui résolvent des dépendances.

Les rapports ne sont pas supprimés : mêmes comptes, mêmes sources et mêmes tags
complets, y compris les tags de route associés. Le descripteur replay de la racine reste
identique, et les suites de replay existantes passent. À 1 000 lignes sans index, les injecteurs passent de **5 017 à 1 014**,
et les enregistrements de providers de **36 142 à 8 121**, avec toujours **4 003
rapports d'effets actifs**.

Campagne de confirmation, cinq navigations, 1 000 lignes sans index — ms et Mio :

| Variante                        | Montage | Filtrer | Rétablir | Tas JS après GC |
| ------------------------------- | ------: | ------: | -------: | --------------: |
| Référence                       |   57,60 |    7,80 |    24,90 |       23,12 Mio |
| Effets simples sans scope dédié |   48,00 |    5,50 |    17,50 |       14,45 Mio |

Même campagne, 5 000 lignes sans index :

| Variante                        | Montage | Filtrer | Rétablir | Tas JS après GC |
| ------------------------------- | ------: | ------: | -------: | --------------: |
| Référence                       |  236,80 |   38,85 |   100,75 |      105,00 Mio |
| Effets simples sans scope dédié |  185,10 |   20,90 |    77,55 |       62,16 Mio |

Même campagne, 5 000 lignes avec index :

| Variante                        | Montage | Filtrer | Rétablir | Tas JS après GC |
| ------------------------------- | ------: | ------: | -------: | --------------: |
| Référence                       |  359,20 |   61,75 |   152,50 |      146,36 Mio |
| Effets simples sans scope dédié |  272,10 |   44,50 |   120,60 |       81,41 Mio |

Le montage baisse d'environ **17 à 24 %** selon les quatre cellules de cette
campagne. Le tas JS mesuré après collecte baisse d'environ **38 à 44 %**. Ce sont
des points après la série, pas une preuve générale d'absence de fuite. Le filtrage
profite aussi de la réduction des callbacks de scopes à désinscrire.

Pour intégrer cette piste, extraire la fusion des tags dans un helper partagé
avec `ɵcreateHostTaggedInjector`, afin d'éviter deux implémentations qui dérivent.
Conserver les scopes des factories génératrices, la DI du propriétaire, les
rapports actifs et tous les comportements de destruction/erreur.

## 3. Une cause précise du filtrage lent : les callbacks de destruction

[DestroyRef.onDestroy](../../libs/core/src/lib/host/craft-compat.ts) stocke ses
callbacks dans un tableau. La fonction de désinscription fait `indexOf` puis
`splice`. Quand beaucoup de bindings partagent le même propriétaire, retirer
une grande fraction de ces callbacks peut coûter quadratiquement avec leur nombre.

Pour un filtrage de 5 000 à 2 500 lignes sans index :

| Variante instrumentée           | Désinscriptions | Positions inspectées, déduites des index trouvés | Positions déplacées par splice |
| ------------------------------- | --------------: | -----------------------------------------------: | -----------------------------: |
| Référence avec composants       |          12 500 |                                        6 295 000 |                      3 131 250 |
| Lignes inline                   |           7 500 |                                       56 302 500 |                     28 121 250 |
| Effets simples sans scope dédié |           2 500 |                                            5 000 |                              0 |

Ces positions sont des comptes algorithmiques, pas des instructions CPU : V8 peut
optimiser les opérations natives. Le ralentissement est néanmoins reproduit et
isolé par une deuxième structure de données. Le prototype utilise un ensemble
ordonné et un index par callback avec une file pour les doublons. Il conserve
l'ordre, les doublons, le retrait FIFO existant pour un même callback et la
vidange de tous les nettoyages malgré une erreur.

Campagne à cinq navigations, lignes inline, 5 000 lignes sans index :

| Variante                    | Montage | Filtrer | Rétablir | Tas JS après GC |
| --------------------------- | ------: | ------: | -------: | --------------: |
| Lignes inline               |  133,60 |   81,50 |    60,25 |       61,73 Mio |
| Inline + nettoyages indexés |  140,90 |   24,20 |    64,50 |       64,63 Mio |

Le filtrage passe de **81,50 à 24,20 ms**, soit environ ×3,4. Le montage et la
mémoire paient un peu plus cher les structures d'indexation. Pour la variante
avec composants, l'intérêt isolé est bien plus faible : les callbacks sont
répartis dans davantage de propriétaires. Cette piste vise donc surtout les
propriétaires ayant beaucoup de bindings/callbacks.

### La piste des scopes peut déjà résoudre cette amplification

Une campagne distincte combine les lignes inline et l'évitement des scopes
inutilisés des effets simples. Les rapports d'effets et le replay sont conservés.
À 5 000 lignes sans index :

| Variante                           | Montage | Filtrer | Rétablir | Tas JS après GC |
| ---------------------------------- | ------: | ------: | -------: | --------------: |
| Lignes inline                      |  133,00 |   95,45 |    59,10 |       61,75 Mio |
| Inline + scopes simples            |  101,20 |   16,45 |    47,80 |       29,96 Mio |
| Inline + scopes simples + préfixes |  100,50 |   15,20 |    44,20 |       31,38 Mio |

Le filtrage baisse ici de **95,45 à 16,45 ms** sans changer la collection de
callbacks : les scopes à désinscrire ont été évités. Ces valeurs viennent d'une
autre campagne et ne s'ajoutent pas aux gains du tableau précédent. Il faut donc
mesurer le besoin d'une refonte des callbacks **après** la piste prioritaire,
plutôt que cumuler automatiquement toutes les modifications.

Le contrôle inline change l'encapsulation des lignes : il ne propose pas de
retirer les composants qui portent des services, directives ou responsabilités
propres. Dans la référence actuelle, rendre inline accélère le montage mais
peut exposer le coût quadratique du nettoyage ; ce choix ne suffit pas à lui seul.

## 4. Identités : réencoder moins de préfixes

[childCraftRenderIdentity](../../libs/core/src/lib/craft-render-identity.ts)
reconstruit et réencode tout le chemin à chaque descendant. Les 5 003 créations
d'identité à 1 000 lignes déclenchent 34 009 encodages de segments ; les ancêtres
sont encodés plusieurs fois.

Le prototype incrémental réemploie la clé du parent créé par le runtime, encode
immédiatement les nouveaux segments et garde le calcul complet pour les parents
fournis structurellement par l'appelant. L'index des identités connues est faible
(`WeakSet`) et n'est pas un cache global fort de toutes les chaînes rencontrées.
Les chemins ordonnés, l'encodage des slashs/Unicode, la sérialisation, les parents
externes et les erreurs URI restent couverts par les tests. L'optimisation
s'appuie sur le contrat `readonly` des identités produites par le runtime.

Campagne complémentaire, trois navigations, 5 000 lignes sans index :

| Variante                        | Montage | Filtrer | Rétablir | Tas JS après GC |
| ------------------------------- | ------: | ------: | -------: | --------------: |
| Référence                       |  241,80 |   38,85 |    97,50 |      105,02 Mio |
| Effets simples sans scope dédié |  174,10 |   24,05 |    77,95 |       62,16 Mio |
| Réemploi du préfixe d’identité  |  229,50 |   37,30 |    91,45 |      107,46 Mio |
| Scopes simples + préfixes       |  168,90 |   23,25 |    75,60 |       64,50 Mio |

Avec 5 000 lignes et index affiché :

| Variante                        | Montage | Filtrer | Rétablir | Tas JS après GC |
| ------------------------------- | ------: | ------: | -------: | --------------: |
| Référence                       |  319,00 |   64,30 |   155,30 |      146,35 Mio |
| Effets simples sans scope dédié |  255,40 |   42,80 |   119,15 |       81,41 Mio |
| Réemploi du préfixe d’identité  |  299,40 |   61,40 |   152,45 |      150,21 Mio |
| Scopes simples + préfixes       |  234,20 |   43,75 |   112,05 |       85,27 Mio |

Le gain isolé du préfixe est modeste et variable, environ 5 à 6 % sur les deux
cas à 5 000 lignes de cette campagne ; il n'est pas convaincant sur tous les
petits cas. La combinaison améliore davantage le temps, avec quelques Mio de
plus que la seule piste des scopes. La priorité reste donc les scopes.

Une autre sonde rendait la clé paresseuse. Elle économisait du CPU mais ajoutait
également du tas et **décalait les erreurs sur les chaînes URI malformées** : la
création ne levait plus l'erreur, seul le premier accès à la clé le faisait.
Le test négatif l'a montré. Cette variante n'est pas retenue comme correctif
compatible. Le réemploi immédiat des préfixes évite ce changement de contrat.

## 5. Pistes peu convaincantes dans ces mesures

- **Retirer les rapports d'effets** procure au mieux quelques pourcents et
  modifie l'observabilité. Leur suppression n'est pas nécessaire pour obtenir
  le gain des scopes ; ils sont conservés par le prototype prioritaire.
- **Retirer l'enregistrement du replay** gagne seulement quelques pourcents
  dans cette sonde et retire une capacité. Ce n'est pas la piste privilégiée.
- **Partager les objets providers internes** n'a pas donné de gain de temps
  stable ; certains cas ralentissent. Pas de raison de prioriser ce changement.
- **Rendre l'ID de ligne statique** évite un binding et aide le montage de ce
  scénario, où l'ID est invariant pour une clé. C'est un choix d'écriture de
  l'app, pas une permission de figer des attributs dont la valeur peut changer.
- Les compteurs montrent aussi des signaux d'entrées/index inutilisés dans
  certains cas. Leur allocation à la première lecture est une piste non mesurée
  ici ; elle devrait préserver les premières lectures tardives, les entrées qui
  changent et le rendu planifié. Aucun gain ne lui est attribué dans ce rapport.

## 6. Est-ce acceptable en pratique ?

Une sonde distincte teste le **runtime inchangé**, avec 64 clics natifs Playwright
répartis sur huit scénarios. Chaque clic est vérifié `isTrusted`. Event Timing
observe la latence incluant la peinture ; les événements sont regroupés par
`interactionId` puis associés par `processingStart`, et non par date d'arrivée
du callback d'observation, qui peut être différée. L'observation utilise un seuil
de 16 ms et des durées arrondies par le navigateur : une entrée absente n'est pas
une mesure à zéro. Les vérifications DOM commencent après une possibilité de
peinture, pour éviter de les inclure dans la latence observée.

Résultats exploratoires : une navigation et huit clics par scénario. Les temps
de montage sont ceux de cette sonde et peuvent différer des médianes précédentes.

| Lignes | Positions | CPU |   Montage | Plus longue tâche du montage | Maximum d'interaction rapporté | Rétablissement de la moitié |
| ------ | --------- | --- | --------: | ---------------------------: | -----------------------------: | --------------------------: |
| 100    | non       | ×1  |  24,80 ms |               aucune ≥ 50 ms |                          40 ms |                       16 ms |
| 1000   | non       | ×1  |  72,90 ms |                     78,00 ms |                          40 ms |                       32 ms |
| 5000   | non       | ×1  | 271,00 ms |                    287,00 ms |                         120 ms |                      120 ms |
| 100    | non       | ×4  |  59,80 ms |                     67,00 ms |                          40 ms |                       16 ms |
| 1000   | non       | ×4  | 230,90 ms |                    249,00 ms |                         112 ms |                      112 ms |
| 5000   | non       | ×4  | 871,50 ms |                    936,00 ms |                         464 ms |                      464 ms |
| 1000   | oui       | ×1  |  77,90 ms |                     83,00 ms |                          48 ms |                       40 ms |
| 1000   | oui       | ×4  | 292,80 ms |                    317,00 ms |                         160 ms |                      160 ms |

Pour ce scénario courant à 1 000 lignes sur le M3, les interactions observées
restent confortables, alors que le montage peut déjà bloquer une frame ou plus.
Sur le CPU ralenti, le montage de 1 000 lignes dépasse 200 ms, et le gros
rétablissement à 5 000 lignes atteint plusieurs centaines de millisecondes.
Cela justifie de traiter les créations massives et les pics de travail, pas
de conclure que toute interaction CraftTS est lente.

Une tâche supérieure à 50 ms est classée longue par le navigateur ; elle bloque
le thread principal pendant son exécution. [Référence : tâches longues](https://web.dev/articles/optimize-long-tasks).
Le repère « bon INP ≤ 200 ms » concerne une métrique d'expérience réelle et sa
répartition sur les visites. Ce test à huit clics ne donne **pas un score INP de
production** et le CPU ×4 ne simule pas un téléphone réel.
[Référence : seuils des Web Vitals](https://web.dev/articles/defining-core-web-vitals-thresholds),
[Event Timing, spécification en cours](https://www.w3.org/TR/event-timing/).

Le rendu planifié déjà disponible peut répartir certains gros montages ; il ne
supprime pas leur travail total. Pagination ou virtualisation restent à choisir
selon le besoin produit pour les listes très grandes. La première optimisation
interne à étudier est le scope superflu des effets simples.

## 7. Vérification des prototypes et limites

- **1 643 tests Core uniques réussis**, dont sept nouveaux contrats de diagnostic,
  plus l'échec attendu et les trois `todo` déjà présents. **564 tests Component
  réussis**, dont le renderer et SSR/hydratation.
- La première copie de test manquait du `vitest.config.ts` racine et des sources
  Stream nécessaires à deux contrôles structurels. Après ajout de ces fichiers,
  les deux fichiers de garde et les sept contrats ont été relancés : **22 tests
  réussis**, sans modifier les bibliothèques du worktree.
- Contrats supplémentaires : ordre et doublons de nettoyage, désinscription FIFO
  existante, erreurs et nettoyage complet, tags de route associés, rapports actifs,
  factories génératrices gardant leur scope, 240 combinaisons de chemins d'identité,
  sérialisation, parents structurels et erreurs URI levées immédiatement.
- Le typecheck Core présente **13 diagnostics dans la référence inchangée**.
  La copie avec prototypes a exactement les mêmes diagnostics, sans ajout ni
  retrait après normalisation des chemins/positions. Cela ne constitue pas un
  typecheck global vert du dépôt.
- La variante de clé paresseuse échoue volontairement au contrôle d'erreur URI ;
  elle est conservée comme preuve négative, pas comme patch recommandé.
- Les tags et le descripteur replay de la racine ont été comparés entre chaque variante compatible et sa
  référence à même app. La version inline est comparée à la référence inline.
  La suppression explicite de rapports ou de replay est signalée comme sonde.

Les variantes mesurées ne sont pas des correctifs intégrés. Les tests donnent
une base de confiance pour une prochaine implémentation et sa revue ; ils ne
couvrent pas toutes les applications ni tous les modes d'instrumentation.
Les calculs paresseux, le cumul de caches et le retrait d'outillage ne sont pas
recommandés automatiquement sur la seule base de ce microbenchmark.

## Reproduire et revoir les pistes

[Runner et protocole](../../apps/framework-benchmark/README.md).
Commandes principales depuis ce worktree, à exécuter successivement :

```sh
CRAFT_MOUNT_DIAG_MODE=counts CRAFT_MOUNT_DIAG_VARIANTS=counts,counts-inline,counts-plain CRAFT_MOUNT_DIAG_OUTPUT=tmp/mount-diagnosis-allocations node apps/framework-benchmark/diagnose.mjs
CRAFT_MOUNT_DIAG_VARIANTS=baseline,plain-effect-scope,prefix-hydration-key,scopes-and-prefix CRAFT_MOUNT_DIAG_RUNS=5 CRAFT_MOUNT_DIAG_OUTPUT=tmp/mount-diagnosis-recheck node apps/framework-benchmark/diagnose.mjs
node apps/framework-benchmark/interaction-check.mjs
```

- [Statistiques et provenance](2026-11-05-mount-diagnosis-summary.json).
- [Prototype des scopes d'effet](2026-11-05-mount-prototypes/plain-effect-scope.patch).
- [Prototype des préfixes d'identité](2026-11-05-mount-prototypes/prefix-hydration-key.patch).
- [Prototype des nettoyages indexés](2026-11-05-mount-prototypes/indexed-cleanups.patch).
- [Tests de contrats à copier dans la copie de vérification](2026-11-05-mount-prototypes/contracts.spec.ts.txt).
- Rapports bruts : `tmp/mount-diagnosis/timing.json`,
  `tmp/mount-diagnosis-refine/timing.json`, `tmp/mount-diagnosis-prefix/timing.json`,
  `tmp/mount-diagnosis-inline-scopes/timing.json`,
  `tmp/mount-diagnosis-allocations/counts.json`,
  `tmp/mount-diagnosis/native-interactions.json`.
- Comparaisons de contrats : `tmp/mount-diagnosis/contract-comparison.json`.
- Tests : `tmp/mount-diagnosis/prototype-core-tests.log`,
  `prototype-component-tests.log`, `prototype-guard-contracts.log`,
  `baseline-contracts.log`, `lazy-contract-negative-control.log`.
- TypeScript : `tmp/mount-diagnosis/typecheck-comparison.json`,
  `worktree-core-types.log`, `baseline-core-types.log`, `prototype-core-types.log`.
- Génération de ce document : `tmp/mount-diagnosis/summarize.py`.

Les patches sont des propositions issues de sondes isolées. Ils ne sont ni
appliqués au runtime du worktree, ni commités, ni poussés. La priorité proposée
est : **scopes des effets simples**, puis **profilage des identités**, puis
**structure de nettoyage si le coût persiste dans les propriétaires volumineux**.
