# Quatre stratégies supplémentaires de montage — prototypes isolés

Date : 5 novembre 2026. Commit mesuré : `e135eeec9f29c8daf6031d32bec780f9c8d99d6e`. Aucun autre framework remesuré.

La combinaison complète gagne **21–30 % de montage supplémentaires** par rapport à la meilleure combinaison précédente (`floor-best`). Les signaux internes et les effets directs ont un intérêt indépendant. Le composant préparé apporte le gain le plus important, mais reste une spécialisation explicite de cette ligne de benchmark. Le cache d’identités a un bénéfice faible ou variable et consomme plus de mémoire.

## Résultat confirmé de la combinaison complète

Médianes de cinq navigations indépendantes par case. Les deux colonnes de temps viennent de la même campagne finale `prepared`. Les temps couvrent `begin()` → observation des mutations DOM, avant peinture ; ce ne sont ni une mesure INP ni le temps complet de chargement de la page.

| Lignes | Index affichés | Meilleur prototype précédent | Quatre stratégies | Gain additionnel | Heap précédent → nouveau |
|---:|:---:|---:|---:|---:|---:|
| 1000 | non | 29,9 ms | 23,7 ms | 20,7 % | 10,4 → 8,9 Mio |
| 1000 | oui | 33,6 ms | 25,8 ms | 23,2 % | 11,0 → 9,5 Mio |
| 5000 | non | 102,5 ms | 71,4 ms | 30,3 % | 42,4 → 35,2 Mio |
| 5000 | oui | 118,1 ms | 83,8 ms | 29,0 % | 45,0 → 37,8 Mio |

Le heap est mesuré après la séquence d’actions et un GC forcé, pas au pic de montage. Minima, maxima, latences des actions, empreintes de sources et tailles de DOM sont conservés dans le JSON associé.

## Effet de chaque stratégie

Chaque variante ajoute une seule stratégie à `floor-best`. Les trois premières proviennent du tri initial à trois navigations par case ; la dernière de la confirmation finale à cinq navigations. Comparer chaque valeur à sa référence de campagne.

| Stratégie seule | Campagne | 5 000 sans index | Référence | 5 000 avec index | Référence |
|---|---|---:|---:|---:|---:|
| Signaux privés du renderer | screen | 91,7 ms | 102,8 ms | 111,2 ms | 120,1 ms |
| Effets internes directs | screen | 96,6 ms | 102,8 ms | 111,3 ms | 120,1 ms |
| Préfixes et empreintes d’identité | screen | 102,0 ms | 102,8 ms | 117,2 ms | 120,1 ms |
| Composant préparé | prepared | 82,5 ms | 102,5 ms | 98,6 ms | 118,1 ms |

### Signaux privés

Les cellules utilisées uniquement par le renderer gardent la même réactivité Alien, le boxing, `Object.is`, les lectures non suivies pendant une écriture et le batching. Elles évitent les propriétés de marqueur, l’enveloppe de lecture supplémentaire et `asReadonly`. Les signaux publics et leurs options d’égalité restent inchangés. Aucun signal privé ne doit être exposé comme signal public.

À 1 000 lignes sans index : **4 004 signaux publics → 3 publics + 4 001 cellules privées** ; les appels de branding passent de 4 009 à 8. Le nombre de cellules et d’effets ne baisse pas pour cette stratégie seule.

### Effets directs

L’implémentation commune de `craftEffect` est extraite dans une entrée interne retournant directement `EffectRef`. L’API publique continue d’envelopper ce résultat dans son générateur nommé. Le renderer appelle directement cette entrée et conserve rapports, tags, nettoyage, scope des factories génératrices et ownership. À 1 000 lignes : **3 009 → 2 006 exécutions de générateur**, pour les mêmes 1 003 effets actifs. Les 1 003 générateurs supprimés servaient à récupérer les références des effets, pas à calculer les données affichées.

### Identités et empreintes

Les clés d’hydratation sont construites à partir du préfixe parent déjà encodé. L’identité d’une entrée de liste est réutilisée lors du rendu de son callback. Des préfixes de hash JSON sont conservés faiblement pour produire exactement les mêmes empreintes de replay. Le rejet immédiat des segments URI invalides est conservé ; les parents fournis structurellement gardent un repli vers le calcul original.

À 1 000 lignes : les appels d’encodage de segment passent de **25 009 à 4 004** et les appels au constructeur enfant de 4 002 à 3 002. La chute des appels à `createCraftRenderIdentity` jusqu’à 1 ne signifie pas qu’il ne reste qu’une identité : le constructeur enfant construit directement ses objets.

Seule, cette stratégie ralentit les petites listes de cette série et gagne seulement 0,8–2,4 % sur les grandes. Dans la confirmation des deux premières optimisations, l’ajout des identités donne 88,0 → 88,5 ms sans index et 104,3 → 100,1 ms avec index à 5 000 lignes. Le heap monte de 42,4 → 43,7 Mio sans index, de 45,1 → 47,3 Mio avec index pour la variante identités seule. Ce n’est pas la priorité d’intégration.

### Composant préparé

La fabrique DOM préparée précédente conservait `ComponentRenderedNode`. Le nouveau chemin, activé par un marqueur sur la fonction exacte du composant, utilise un snapshot de props unique, lit directement les deux inputs puis applique le plan DOM. Il évite les proxies d’inputs, la cellule de host props vide, la préparation générique du template et le fragment intermédiaire de composant. Il conserve un injecteur complet par composant, l’enregistrement de la cible runtime, le scope CSS, les rapports d’effet et les traces de création/rendu/destruction.

À 1 000 lignes : **1 001 composants génériques → 1 générique + 1 000 préparés**. Avec les autres stratégies, on conserve 1 003 effets et 1 014 injecteurs, mais les cellules internes passent de 4 001 à 2 001. Les éléments, textes et commentaires DOM restent identiques à `floor-best`. Le gain ne vient donc pas d’une baisse de granularité ou d’un injecteur supprimé.

L’activation est réservée à cette forme de ligne, sans composition, providers locaux, transforms, host props ou directives supplémentaires. Les autres composants, le SSR et l’hydratation gardent le chemin générique. Ce prototype ne généralise pas les composants à slots, templates variables, événements/styles arbitraires, exceptions métier ou overrides de template. Un compilateur ou un plan déclaré pourrait produire une telle spécialisation et choisir le repli ; ce travail ne constitue pas un compilateur général.

## Mises à jour

Médianes click → DOM, campagne finale à 5 000 lignes. Toutes les données, positions et identités DOM conservables sont vérifiées après chaque action.

| Index | Action | Précédent | Combinaison complète |
|:---:|---|---:|---:|
| non | Une ligne | 1,0 ms | 1,0 ms |
| non | 10 % des lignes | 5,3 ms | 3,4 ms |
| non | Inversion | 9,9 ms | 10,0 ms |
| non | Filtrage | 10,4 ms | 9,2 ms |
| non | Restauration | 48,6 ms | 34,4 ms |
| oui | Une ligne | 1,0 ms | 1,0 ms |
| oui | 10 % des lignes | 5,7 ms | 4,0 ms |
| oui | Inversion | 31,4 ms | 24,2 ms |
| oui | Filtrage | 23,1 ms | 18,4 ms |
| oui | Restauration | 65,9 ms | 50,9 ms |

Les mises à jour d’une ligne restent autour de 1 ms. Sans index affiché, l’inversion reste autour de 10 ms : déplacer le DOM devient la limite de cette action. Avec index, le composant préparé réduit aussi le travail de mise à jour des positions.

## Validation et limites

- 200 navigations de timing retenues, plus 24 navigations de compteurs finales ; ordre mélangé avec graine fixe, nouveaux contextes Chromium, builds de production minifiés, même commit et même machine. Aucune comparaison de temps n’utilise les builds instrumentés.
- Une première garde du chemin préparé refusait le contexte de déclaration normal et utilisait le chemin générique. Ces lignes des premières campagnes sont explicitement exclues de l’agrégation. La campagne `prepared` remesure le chemin corrigé. Les compteurs finaux exigent exactement N composants préparés et un seul composant générique pour N lignes, sinon le runner échoue.
- Contrats navigateur sur DI, providers, `skipSelf`, scopes, ElementRef, branches vide/multiple/simple, inputs lus tardivement, callback non pur, nettoyage unique et destruction. Ils vérifient le repli générique, y compris sous les nouveaux patches.
- Contrats distincts sur la véritable ligne marquée : mêmes tags de tous les effets, mêmes scopes et descripteurs de replay entre variantes, résolution de cibles enregistrées dans une autre variante, inversion, filtrage/restauration, disparition des cibles après destruction.
- Les compteurs d’effets et les hashes de leurs tags restent identiques après la séquence complète ; aucun effet actif ni ligne DOM après destruction.
- **566 tests Component et 42 tests Core ciblés passent**, dont égalité/boxing/batching des signaux, effets publics/directs, factories génératrices, nettoyage et replay. Un test de référence compare les empreintes sur 2 000 chemins variés, avec Unicode, échappements JSON et UTF-16 malformé pour le replay ; les contrats d’hydratation testent séparément son rejet immédiat.
- Le contrôle TypeScript conserve exactement les diagnostics préexistants : 13 côté Core, 1 côté Component. Aucun diagnostic nouveau ; le dépôt n’est donc pas présenté comme entièrement vert sur les types.
- Les tests démontrent les adresses et contrats de ce périmètre ; ils ne certifient pas le rejeu de toutes les archives de session existantes. Les optimisations antérieures `floor-best` restent elles-mêmes expérimentales.

## Suite conseillée

Extraire d’abord les deux améliorations générales du runtime : cellules privées et création directe des effets. Préparer ensuite une API de plan explicitement compatible, avec génération éventuelle par un compilateur et repli automatique. Garder l’optimisation des identités à part tant que son coût mémoire et son bénéfice variable ne sont pas mieux maîtrisés. Le prototype complet valide le potentiel du chemin préparé, pas son intégration universelle.

## Reproduire et revoir

```sh
npm --prefix apps/framework-benchmark run bench:mount-next-prototypes
node apps/framework-benchmark/verify-mount-next.mjs
```

`MOUNT_NEXT_OUTPUT`, `MOUNT_NEXT_SCREEN_RUNS`, `MOUNT_NEXT_RUNS` ajustent la campagne. `MOUNT_NEXT_SUMMARIZE_ONLY=true` agrège des résultats existants. Le vérificateur reconstruit ses copies depuis le checkout et les patches archivés de `prepared`, puis compare les diagnostics TypeScript au checkout avant d’ajouter ses tests spécifiques.

- [Orchestration](../../apps/framework-benchmark/mount-next.prototype.mjs), [transformations](../../apps/framework-benchmark/mount-next-prototypes.mjs), [vérification](../../apps/framework-benchmark/verify-mount-next.mjs).
- [Composant préparé](../../apps/framework-benchmark/prototype-runtime/planned-component.ts.txt), [empreintes par préfixes](../../apps/framework-benchmark/prototype-runtime/prefix-fingerprint.ts.txt), [contrats navigateur](../../apps/framework-benchmark/prototype-runtime/planned-contracts.ts.txt).
- [Données agrégées](2026-11-05-mount-next-summary.json) ; données brutes et patches exacts : `tmp/mount-next/{screen,confirm,prepared,counts-final}` ; tests et comparaison des types : `tmp/mount-next/*tests.log`, `typecheck-comparison.json`, `verification-summary.json`.

Toutes les mutations du runtime sont appliquées à des copies temporaires. `libs/core` et `libs/component` du worktree sont inchangés. Aucun commit ni push effectué.
