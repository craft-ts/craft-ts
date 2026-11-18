# Six pistes supplémentaires sur le meilleur prototype CraftTS

5 novembre 2026. Commit : `e135eeec9f29c8daf6031d32bec780f9c8d99d6e`. Tous les patches sont appliqués à des snapshots temporaires. Aucun autre framework n’a été remesuré.

La nouvelle combinaison gagne encore **4,3–6,5 % au montage des listes de 5 000 lignes**, avec un gain plus net à l’inversion. Les progrès sont maintenant plus petits et comportent un compromis sur les mises à jour ponctuelles. Les résultats ne justifient pas une intégration automatique de toutes les pistes.

## Protocole et référence

La référence `next-all` est la combinaison complète de la campagne précédente : composant/DOM préparés, cellules internes privées, effets directs et identités par préfixes. La présente campagne remesure cette référence à côté des nouveaux prototypes ; ses valeurs remplacent celles de la campagne historique pour calculer les gains.

Même moteur Chromium et même machine, builds de production minifiés, nouveaux contextes, ordre mélangé avec graine fixe. Le tri initial utilise 3 navigations par variante et par case ; la confirmation en utilise 5. 164 navigations de timing, plus 27 navigations finales de compteurs. Les compteurs ne servent jamais à comparer des durées. Les actions ont deux passages de chauffe puis quatre passages mesurés par navigation.

Le montage mesure `begin()` → observation des mutations DOM, avant peinture. Le chargement des modules et la création du modèle initial sont en dehors de cette fenêtre. Ce n’est ni un temps INP ni le temps complet de chargement. Le heap JS est relevé après la séquence d’actions et un GC forcé ; il ne quantifie pas à lui seul la mémoire native du DOM.

## Profil préalable

Trois profils CPU du prototype précédent, à 5 000 lignes sans index, montrent du travail dans `childCraftRenderIdentity`, les empreintes de replay, `insertBefore`, `get`, `createNativeCraftInjector`, `runCraftGenerator` et les résolutions de providers. Les imports finissent avant le démarrage du profil. Ces profils utilisent un build lisible et un ralentissement CPU ×4 pour attribuer des noms ; ils ne sont pas utilisés comme temps comparatifs ni comme pourcentages exacts du montage minifié.

Profils et agrégation : `tmp/mount-more/profile/*.cpuprofile`, `profile/summary.json`. Runner : [profile-current.prototype.mjs](../../apps/framework-benchmark/profile-current.prototype.mjs).

## Résultat confirmé

`more-best` combine lectures internes directes, résolveur partagé des providers de valeur, cache borné des segments et entrées de liste sans marqueurs lorsque le plan garantit une racine unique.

| Lignes | Index | Référence précédente | Nouvelle combinaison | Gain | Heap référence → nouveau |
|---:|:---:|---:|---:|---:|---:|
| 1000 | non | 23,9 ms | 23,6 ms | 1,3 % | 8,9 → 8,8 Mio |
| 1000 | oui | 26,5 ms | 25,4 ms | 4,2 % | 9,5 → 9,2 Mio |
| 5000 | non | 71,6 ms | 68,5 ms | 4,3 % | 35,2 → 34,4 Mio |
| 5000 | oui | 84,3 ms | 78,8 ms | 6,5 % | 37,8 → 36,0 Mio |

À 1 000 lignes les distributions se recouvrent : les petites différences ne permettent pas de promettre un gain général. À 5 000 lignes, les cinq montages sans index vont de 70,3 à 75,5 ms pour la référence et de 66,9 à 68,9 ms pour la nouvelle combinaison. Avec index : 83,9–84,8 ms contre 78,0–79,5 ms. Cela valide un petit gain sur cette fixture et cette machine, sans établir une généralisation à toutes les applications.

## Pistes testées individuellement

| Piste seule | Campagne | 5 000 sans index | Référence | 5 000 avec index | Référence |
|---|---|---:|---:|---:|---:|
| Lectures internes directes | screen | 70,8 ms | 72,3 ms | 82,3 ms | 84,9 ms |
| Collections d’injecteur différées | screen | 72,2 ms | 72,3 ms | 86,6 ms | 84,9 ms |
| Résolveur de valeurs partagé | screen | 70,7 ms | 72,3 ms | 84,2 ms | 84,9 ms |
| Cache borné de segments | screen | 70,8 ms | 72,3 ms | 84,6 ms | 84,9 ms |
| Insertion initiale par fragment DOM | screen | 71,0 ms | 72,3 ms | 84,8 ms | 84,9 ms |
| Entrées sans marqueurs | confirm | 68,8 ms | 71,6 ms | 82,6 ms | 84,3 ms |

### Lectures directes des inputs connus

Le callback explicitement préparé transporte un accès direct aux lecteurs d’item et d’index via une WeakMap. Le composant préparé utilise cet accès quand il existe ; les lecteurs inconnus continuent à passer par `craftUse`. La source de liste reste suivie par son effet et l’index garde sa cellule réactive. À 1 000 lignes sans index, les générateurs exécutés au montage passent de **2 006 à 1 006**. Avec index, les 1 000 lectures supplémentaires utilisent également le chemin direct. Les compteurs exigent N lectures directes sans index et 2N avec index, sinon la campagne échoue.

Ce raccourci est réservé aux inputs locaux du plan de données fixe. Il ne remplace pas le protocole public des primitives et ne certifie pas les possibilités d’instrumentation par lecture de tous les lecteurs utilisateur.

### Collections différées de l’injecteur

L’injecteur natif garde ses règles de résolution, ses provider records et son ownership. Seuls son cache des valeurs par défaut et sa collection d’enfants sont alloués au premier besoin. Le gain mémoire est visible : 35,2 → 34,4 Mio à 5 000 lignes sans index dans le tri initial. Le montage est pratiquement inchangé sans index et un peu plus lent avec index. Cette piste est intéressante pour la mémoire, pas démontrée comme gain de vitesse.

### Résolution partagée des providers de valeur

Les providers `useValue` partagent une méthode de lecture, au lieu de créer une fermeture chacun. La méthode lit encore la valeur du provider courant. Les providers de factory gardent leur résolution, leur cache et leurs erreurs. Les compositions multi/collection conservent le receiver du record : détacher une méthode partagée aurait sinon perdu `this`. Les tests vérifient valeur `undefined`, `null`, modifications de `useValue`, ordre des collections, cache des factories et nettoyage.

À 5 000 lignes sans index, le tri initial donne 72,3 → 70,7 ms et 35,2 → 34,6 Mio. Le nombre d’injecteurs et de records n’est pas réduit.

### Cache borné des segments d’identité

Deux caches de 512 entrées réutilisent respectivement l’encodage URI et la représentation JSON des segments. Ils sont vidés lorsqu’ils atteignent leur borne ; ils ne conservent pas un nombre non borné de clés utilisateur. Les encodages URI qui échouent ne sont jamais mis en cache. Les empreintes sérialisées et le rejet immédiat des segments URI invalides restent contrôlés par les contrats précédents. Gain faible seul, presque nul avec index dans cette série.

### Insertion initiale dans un fragment DOM

Une liste explicitement compatible est construite dans un DocumentFragment puis insérée en une opération. L’adaptateur redevient normal après le montage. Le composant préparé reçoit toujours son parent logique dans ElementRef, ce qui est vérifié sur le véritable chemin utilisé. Les adresses de replay deviennent résolubles une fois le fragment inséré. Le SSR, l’hydratation et le scheduling activé gardent le chemin normal.

Le coût total ne baisse pas de façon convaincante : 72,3 → 71,0 ms sans index et 84,9 → 84,8 ms avec index au tri initial. Le navigateur regroupe déjà une partie de son travail avant peinture. Cette variante n’est pas retenue dans `more-best`. Son opt-in ne couvre pas les composants arbitraires dont les hooks observent leur connexion au document pendant la construction.

### Entrées de liste sans marqueurs

Le plan à racine unique permet à une entrée de liste d’emprunter le nœud DOM de sa ligne au lieu d’ajouter deux commentaires. Pour le scheduler natif synchrone et le callback pur explicitement marqué, les entrées sont rendues avant le placement final ; leur map est publiée avant le scheduling pour conserver les contrôles de version. Le scheduler et les traces de callback restent exécutés. En cas de sortie vide, multiple ou incompatible, la plage est promue vers le fragment normal. Le scheduling activé et un scheduler injecté restent sur les plages habituelles.

Les compteurs exigent exactement N entrées sur le chemin spécialisé. À 5 000 lignes, **10 004 → 4 commentaires DOM**. Les éléments et textes, les adresses logiques, les injecteurs et les effets sont conservés. À 1 000 lignes : toujours 1 014 injecteurs, 8 121 provider records et 1 003 effets actifs. Le gain est surtout visible lorsque beaucoup de lignes doivent être déplacées.

## Actions et compromis

Médianes click → DOM de la confirmation à 5 000 lignes :

| Index | Action | Référence | Nouvelle combinaison |
|:---:|---|---:|---:|
| non | Une ligne | 1,0 ms | 1,3 ms |
| non | 10 % des lignes | 3,9 ms | 4,0 ms |
| non | Inversion | 10,4 ms | 6,0 ms |
| non | Filtrage | 9,6 ms | 8,5 ms |
| non | Restauration | 34,8 ms | 31,5 ms |
| oui | Une ligne | 1,0 ms | 1,2 ms |
| oui | 10 % des lignes | 4,2 ms | 4,4 ms |
| oui | Inversion | 26,3 ms | 19,3 ms |
| oui | Filtrage | 17,7 ms | 14,6 ms |
| oui | Restauration | 49,6 ms | 41,1 ms |

L’inversion sans index passe de 10,45 à 6,05 ms, avec index de 26,35 à 19,30 ms. En revanche, une mise à jour d’une ligne passe d’environ 1,0 à 1,25–1,3 ms. Le coût absolu reste petit, mais cette régression est mesurée : elle empêche de présenter la variante comme systématiquement meilleure. Les appels supplémentaires pour retrouver les bornes à travers le composant emprunté sont une hypothèse à instrumenter pour une éventuelle suite, pas une cause démontrée ici.

## Vérifications

- 44 exécutions de fixtures de contrats dans les campagnes de timing : DI, providers, branches, inputs tardifs, callback non pur, scopes, tags d’effets, nettoyage et cibles de replay comparées entre variantes. Les passages de smoke et de compteurs sont archivés séparément.
- Après chaque action : valeurs, index affichés, ordre, nombre de lignes et identité des nœuds conservables. À la destruction : aucune ligne ni effet actif. Hash complet des tags d’effets identique à la référence après la séquence d’actions.
- Contrats spécifiques sur les chemins préparés : liste vidée puis restaurée, adresses replay conservées au remontage, sortie devenue multiple/vide, providers locaux gardant le composant générique, scheduling activé gardant ses plages, ElementRef pointant sur le véritable parent. Le repli des lecteurs non reconnus garde le protocole de génération.
- **571 tests Component et 68 tests Core ciblés passent pour les deux combinaisons.** Pour `more-best`, les 566 tests existants passent dans le premier run et les 5 nouveaux contrats passent après correction des noms de scopes réutilisés par la fixture. Les logs distincts sont conservés. Pour `more-all`, les 571 passent en un run. Aucun changement runtime n’a été nécessaire pour cette correction de fixture.
- TypeScript : mêmes diagnostics qu’au checkout avant patches, 13 côté Core et 1 côté Component ; aucun nouveau diagnostic. Les diagnostics préexistants ne sont pas présentés comme résolus.
- Les tests de cibles et de tags ne certifient pas le rejeu de toutes les archives existantes. L’ordre du rendu anticipé et du placement DOM doit être examiné avec les hooks d’observation avant une intégration générale. Les optimisations précédentes et le plan de ligne restent expérimentaux.

## Ce qu’on peut en tirer

Les petits coûts fixes sont encore réductibles, mais les six pistes ne produisent pas un nouveau saut comparable aux optimisations précédentes. Le résolveur partagé de valeurs et les collections différées sont des candidats séparables du plan de rendu, surtout pour réduire les allocations. Les lectures directes, l’insertion par fragment et les plages empruntées nécessitent un contrat de plan explicite. Les plages empruntées sont surtout intéressantes pour déplacer de grandes listes et demandent encore de comprendre la régression sur une mise à jour ponctuelle.

La combinaison conserve un injecteur complet et un effet par ligne. Un gain nettement plus grand demanderait de mesurer une autre organisation des scopes ou une fusion plus poussée du plan de liste et de ligne, avec les mêmes exigences d’identités et d’observabilité. Ces directions ne sont pas validées par cette campagne.

## Reproduire

```sh
npm --prefix apps/framework-benchmark run bench:mount-more-prototypes
node apps/framework-benchmark/verify-mount-more.mjs
VERIFY_VARIANT=more-all node apps/framework-benchmark/verify-mount-more.mjs
```

`MOUNT_MORE_OUTPUT`, `MOUNT_MORE_SCREEN_RUNS` et `MOUNT_MORE_RUNS` règlent le dossier et les répétitions. `MOUNT_MORE_SUMMARIZE_ONLY=true` reconstruit l’agrégation. Les sources modifiées exactes et leurs empreintes sont archivées par variante dans les dossiers `prototypes` des résultats bruts.

- [Runner](../../apps/framework-benchmark/mount-more.prototype.mjs), [patches isolés](../../apps/framework-benchmark/mount-more-prototypes.mjs), [vérificateur](../../apps/framework-benchmark/verify-mount-more.mjs).
- [Construction par fragment](../../apps/framework-benchmark/prototype-runtime/staged-for.ts.txt), [contrats Component](../../apps/framework-benchmark/prototype-runtime/more-component.contracts.spec.ts.txt), [contrats Core](../../apps/framework-benchmark/prototype-runtime/more-owner.contracts.spec.ts.txt).
- [Statistiques et provenance](2026-11-05-mount-more-summary.json). Bruts : `tmp/mount-more/{screen,confirm,counts,smoke,range-smoke}`. Types et tests : `tmp/mount-more/typecheck-comparison-*.json`, `*tests-*.log`, `component-contracts-more-best.log`.

Le checkout de `libs/core` et `libs/component` est inchangé. Aucun commit ni push effectué.
