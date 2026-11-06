# Prototype : gestionnaire commun de bindings

6 novembre 2026. Commit figé : `e135eeec9f29c8daf6031d32bec780f9c8d99d6e`. Worktree `codex/benchmark-e135eeec9`. Prototype jetable ; `libs/core`, `libs/component` et le paquet installé `alien-signals` restent inchangés dans le checkout. Les transformations runtime sont appliquées à des copies temporaires.

## Question et verdict

Peut-on remplacer les handles d’effets individuels par des enregistrements de bindings, exécutés par un gestionnaire commun, sans relire les champs indépendants ?

**Oui pour le fonctionnement. Pas de nouveau saut de performances démontré.** Un changement de champ conserve une seule lecture, même avec 1 024 champs, et aucun nouveau rendu du template. Le gestionnaire ne scanne pas le registre : le graphe réactif indique les enregistrements invalidés. La baisse du heap est plus nette que celle du temps de montage. La file commune ne fait pas mieux que les enregistrements légers seuls dans la série principale.

À 5 000 lignes sans index, la confirmation donne 79,9 → 77,1 ms avec le gestionnaire, contre 74,0 ms avec les enregistrements seuls. Avec index : 94,5 → 93,4 ms, contre 92,9 ms. Les différences restent modestes et les distributions se recouvrent ; elles ne constituent pas une promesse de gain universel. Le heap passe de 39,55 à 37,43 Mio sans index (−5,4 %) et de 45,93 à 42,38 Mio avec index (−7,7 %).

## Variantes et mécanisme

Toutes les variantes partent du même plan fin préparé, y compris le regroupement de l’attribut et du texte de position. DOM, inputs, comparaison des valeurs, injection, scopes, traces et adresses de replay sont conservés sur les formes prises en charge.

- `fine-grouped` : référence optimisée existante, un effet natif enveloppé par les helpers Craft pour chaque binding.
- `fine-records` : un enregistrement par binding, destruction partagée par prototype, suivi par le même graphe Alien et ordonnancement natif. Aucun regroupement des exécutions.
- `fine-manager` : mêmes enregistrements, exécutés par un dispatcher commun. Les invalidations consécutives partagent un groupe dans la file ; un effet ordinaire intercalé crée une séparation. Il reste un consommateur réactif par binding.
- `fine-watch` : contrôle plus simple, via le `craftWatch` existant, sans modifier Alien. Il évite la gestion générique des callbacks `onCleanup`, absents du contrat de ces bindings internes. Les retours accidentels des callbacks sont ignorés, comme avec l’effet Craft ordinaire.

Le prototype de records/gestionnaire ajoute des points d’extension dans une copie du module `alien-signals` **3.2.1**, puis réutilise ses fonctions de suivi, de vérification des dépendances et d’exécution. Il ne crée pas un second moteur de signaux. Ce patch dépend d’internes privés : il ne doit pas être livré tel quel. Une intégration demanderait une API adaptée du moteur ou une décision explicite de maintenance.

L’allègement retire notamment des handles et des allocations de nettoyage génériques. Dans la référence, le wrapper `effect` crée une liste de cleanups et une fermeture de nettoyage à chaque exécution, même quand le binding n’en enregistre aucun. Le contrôle `fine-watch` permet d’observer cette partie sans la confondre avec le regroupement de la file.

## Confirmation : effets indépendants contre gestionnaire

Médianes de cinq navigations indépendantes par case, production minifiée, ordre mélangé. Même cohorte pour les trois variantes.

| Lignes | Index | Variante | Montage médian | Min–max | Heap JS après GC |
|---:|:---:|---|---:|---:|---:|
| 1000 | non | Plan fin actuel | 28,5 ms | 27,2–30,7 ms | 9,7 Mio |
| 1000 | non | Enregistrements légers | 27,3 ms | 26,0–28,3 ms | 9,3 Mio |
| 1000 | non | Gestionnaire commun ordonné | 25,9 ms | 24,5–28,0 ms | 9,3 Mio |
| 1000 | oui | Plan fin actuel | 28,8 ms | 28,2–31,9 ms | 11,1 Mio |
| 1000 | oui | Enregistrements légers | 29,1 ms | 28,3–33,2 ms | 10,5 Mio |
| 1000 | oui | Gestionnaire commun ordonné | 29,6 ms | 28,1–29,9 ms | 10,5 Mio |
| 5000 | non | Plan fin actuel | 79,9 ms | 75,3–84,8 ms | 39,6 Mio |
| 5000 | non | Enregistrements légers | 74,0 ms | 73,3–76,6 ms | 37,4 Mio |
| 5000 | non | Gestionnaire commun ordonné | 77,1 ms | 74,7–81,0 ms | 37,4 Mio |
| 5000 | oui | Plan fin actuel | 94,5 ms | 92,6–97,1 ms | 45,9 Mio |
| 5000 | oui | Enregistrements légers | 92,9 ms | 90,5–94,0 ms | 42,4 Mio |
| 5000 | oui | Gestionnaire commun ordonné | 93,4 ms | 90,7–94,0 ms | 42,4 Mio |

## Contrôle : un watch plus simple suffit-il ?

Deuxième cohorte indépendante, cinq navigations par case. Comparer les variantes à l’intérieur de cette table, sans mélanger les références entre cohortes.

| Lignes | Index | Variante | Montage médian | Min–max | Heap JS après GC |
|---:|:---:|---|---:|---:|---:|
| 5000 | non | Plan fin actuel | 84,5 ms | 74,8–93,2 ms | 39,6 Mio |
| 5000 | non | Watch natif simplifié | 78,9 ms | 78,1–79,9 ms | 38,5 Mio |
| 5000 | non | Enregistrements légers | 77,8 ms | 72,1–116,6 ms | 37,4 Mio |
| 5000 | non | Gestionnaire commun ordonné | 79,7 ms | 74,4–94,7 ms | 37,4 Mio |
| 5000 | oui | Plan fin actuel | 94,4 ms | 93,6–99,3 ms | 45,9 Mio |
| 5000 | oui | Watch natif simplifié | 95,2 ms | 93,3–98,6 ms | 44,4 Mio |
| 5000 | oui | Enregistrements légers | 94,8 ms | 91,7–149,3 ms | 42,4 Mio |
| 5000 | oui | Gestionnaire commun ordonné | 96,1 ms | 92,6–116,0 ms | 42,4 Mio |

Le watch simplifié récupère environ 1,0 Mio sans index et 1,5 Mio avec index ; records et gestionnaire en économisent environ 2,1 et 3,5 Mio. Les résultats de montage ne démontrent pas de bénéfice supplémentaire du dispatcher commun. Certaines navigations comportent des valeurs hautes, visibles dans les min–max. Il n’est pas justifié de recommander un fork du moteur pour ces seuls temps.

## Ordre d’exécution : contrôle négatif et correction

Un premier regroupement de toute la vague a modifié l’ordre observable :

```text
Référence : binding A → effet ordinaire → binding B
Regroupement naïf : binding A → binding B → effet ordinaire
Version ordonnée : binding A → effet ordinaire → binding B
```

Le regroupement naïf est conservé uniquement comme contrôle négatif dans les scénarios exécutables ; il n’est pas utilisé dans les mesures finales. La version mesurée respecte les séparations entre groupes et récupère sa file après une exception. Elle ne promet pas une unique entrée d’ordonnancement pour toute l’application : préserver l’ordre impose parfois plusieurs groupes, exécutés par le même dispatcher.

## Vérifications

- Panneaux de 32, 128 et 1 024 champs : premier et dernier champs modifiés, exactement une lecture, zéro réexécution du template, conservation des éléments et nœuds texte. 36 navigations dédiées, dont des pages de compteurs distinctes des timings. 13 024 résolutions de cibles enregistrées entre variantes réussissent.
- 60 navigations de listes en confirmation et 40 pour le contrôle : valeurs, positions, mises à jour ponctuelles/par dixième, inversion, filtre/restauration, identité des nœuds retenus, scopes et replay vérifiés.
- Rapports et tags identiques entre variantes de même granularité. À 1 000 lignes avec index, 3 003 calculs restent déclarés ; records/gestionnaire possèdent 3 000 enregistrements de bindings. La baisse des appels au wrapper `craftWatch` de 3 004 à 4 **ne signifie pas** qu’il ne reste que quatre consommateurs du graphe.
- Après destruction : zéro ligne, zéro rapport actif, zéro binding géré, aucune file restante. Les adresses des éléments détruits cessent de résoudre.
- Scénarios du noyau : dépendances dynamiques, batch/déduplication, égalité des computed, diamant, destruction avant exécution, lecture non suivie, écritures pendant le dispatch, erreurs dans un binding ou un effet ordinaire, erreur initiale, destruction répétée et intercalation des effets.
- Pour chacune des variantes `fine-manager` et `fine-watch` : **578 tests Component et 69 tests Core sélectionnés passent**. Les diagnostics TypeScript sont identiques à la référence : 13 Core et 1 Component préexistants, aucun nouveau diagnostic.
- Les suites Component/Core réutilisées couvrent notamment DI parent/skipSelf, identité et ElementRef dans les bindings, destruction directe du propriétaire et nettoyage quand un callback échoue. Résultats détaillés dans les résumés de vérification.

Le prototype reste limité aux plans fins synchrones reconnus par les garde-fous existants. Composition, providers locaux, boundaries actives, SSR/hydratation et autres formes non prises en charge utilisent le renderer générique. Les vérifications ne certifient pas tous les anciens enregistrements de sessions ni toutes les extensions possibles du moteur.

Les temps de montage s’arrêtent à la notification de mutation DOM, avant peinture ; chargement des modules et préparation du modèle initial exclus. Le heap est le heap JS après actions et GC forcé, pas la consommation totale du navigateur. Aucun autre framework n’a été remesuré.

## Décision proposée

Conserver les bindings indépendants et leur suivi fin. Examiner d’abord la spécialisation des bindings internes sans `onCleanup`, qui économise de la mémoire avec une petite modification et sans patch d’Alien. Les records apportent davantage d’économie mémoire, mais leur intégration demande une primitive du moteur adaptée. Le regroupement dans un gestionnaire commun n’est pas prioritaire au vu de ces mesures : sa complexité d’ordonnancement n’apporte pas de gain supplémentaire établi.

## Reproduire et manipuler

Depuis la racine du worktree :

```sh
npm --prefix apps/framework-benchmark run bench:binding-manager-prototype
npm --prefix apps/framework-benchmark run prototype:binding-manager
```

La première commande exécute les scénarios, les compteurs, les deux cohortes de mesures et les vérifications dans des copies temporaires. `BINDING_MANAGER_OUTPUT` choisit le dossier de résultats. La seconde expose trois pages interactives et affiche les URLs ; Ctrl+C arrête les serveurs et supprime les copies temporaires. La décoration de la démo est ajoutée après compilation, uniquement aux builds de prévisualisation.

Sources du prototype : `apps/framework-benchmark/mount-binding-manager-prototypes.mjs`, `prototype-runtime/managed-bindings.kernel.mjs.txt`, `binding-manager.kernel-check.mjs`, `binding-manager.prototype.mjs` et `mount-fine-plan-prototypes.mjs`. Le code sert à décider d’une intégration, pas à remplacer le runtime de production.

Résumé durable : `docs/benchmarks/2026-11-06-binding-manager-summary.json`.

Données de cette campagne : `tmp/binding-manager-final/{counts,confirm,control}`, scénarios `kernel-contracts.json`, variantes modifiées archivées avec empreintes, logs de vérification et capture `preview.png`. La campagne initiale `tmp/binding-manager` contient les essais intermédiaires ; les résultats retenus ici sont exclusivement ceux de `tmp/binding-manager-final`.
