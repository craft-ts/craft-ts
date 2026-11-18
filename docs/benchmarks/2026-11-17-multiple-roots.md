# Plans à plusieurs racines : résultats et limite d'observation du DOM

17 novembre 2026. Référence : `70a51b49e`. Le prototype reste dans le
laboratoire ; aucune prise en charge des racines multiples n'est ajoutée au
runtime de production. Les [données](2026-11-17-multiple-roots-summary.json)
archivent 200 navigations, sept cohortes, les contrats, méthodes, patches,
empreintes des bundles et différences appariées.

Compiler des plages fixes de plusieurs racines donne un gain important sur
une liste qui en utilise : **68,05 → 22,25 ms** et **32,94 → 8,78 Mio** pour
5 000 lignes en léger. Mais le prototype ajoute du travail aux cas ordinaires
et conserve une limite d'observation du DOM déjà présente dans le compilateur
actuel. Il n'est donc pas intégré.

## Portée du prototype

Un plan décrit les slots de ses racines, des éléments ou du texte. Les tableaux
statiques imbriqués sont aplatis ; `null` et `false` sont ignorés comme dans
l'interpréteur. Les plages vides, structures dynamiques à la racine, spreads
et éléments natifs non pris en charge gardent le rendu générique.

Le renderer applique le scope à chaque racine élément, conserve les chemins
de replay du mode standard, déplace toute la plage et retire chaque racine
au nettoyage. Une erreur sur un retrait n'empêche pas les suivants. Le cache
de l'entrée légère ne stocke une racine unique que pour les vues qui en ont
une. Le clonage prépare puis retrouve chaque racine indépendamment ; les
adapters sans `cloneNode` conservent la création directe.

Les tests couvrent aussi les racines texte seules, le texte aux deux bornes
d'une plage, les rebinds en place, les propriétaires/injecteurs, les scopes,
événements et trous dans les éléments racines, et les ressources détruites.
Les compromis préexistants du mode `lean` restent distincts de ces contrats.

## Fixture ciblée : 5 000 lignes à trois racines

Même template et mêmes opérations pour toutes les variantes. Chaque ligne
retourne un `div` contenant son libellé, un texte séparateur et un `span`
contenant son index. Aucun composant impératif ni nouveau modèle applicatif.

Huit navigations par variante, cinq boucles ; médianes en ms et Mio :

| Mode léger                             | Montage | Inversion | Restauration | Modifier une ligne | Tas après parcours |
| -------------------------------------- | ------: | --------: | -----------: | -----------------: | -----------------: |
| Compilateur actuel, ligne non compilée |   68,05 |     23,55 |        27,65 |               0,90 |             32,944 |
| Plans multiples, `lists: false`        |   30,40 |     16,83 |        12,75 |               1,00 |             12,199 |
| Plans multiples et listes spécialisées |   22,25 |     14,60 |        11,15 |               1,40 |              8,781 |

Le contrôle `lists: false` sépare la couverture des templates de la
spécialisation des listes. Le gain complet n'est pas attribué au seul
regroupement DOM. Les huit différences de montage appariées sont favorables
pour chaque candidat : médianes −37,30 ms sans listes spécialisées et
−45,80 ms avec elles. Le coût d'une petite modification augmente avec le
rebind complet des entrées légères ; modifier 500 lignes passe en revanche
de 2,90 à 2,50 ms avec la spécialisation.

Dans le contrat navigateur à 100 lignes, on compte respectivement 402,
202 et 2 commentaires, dont 202, 202 et 2 commentaires de liste. Le tas JS
ne mesure pas la mémoire native de ces nœuds. Le candidat complet ajoute
1 164 octets JS et 229 gzip sur cette fixture.

Une autre cohorte conserve les propriétaires du mode standard : montage
68,05 → 56,40 ms ; tas 32,940 → 29,119 Mio ; modifier une ligne
0,95 → 1,00 ms. Les huit paires de montage sont favorables, avec une
différence médiane de −11,30 ms. Ces valeurs ne s'additionnent pas à celles
du mode léger et ne mesurent pas son changement de propriétaires.

Le contrôle clonage, encore dans une cohorte séparée, donne création
22,85 ms contre clonage 22,45 ms. Seules cinq paires sur huit sont plus
rapides ; le tas augmente légèrement. Le clonage ajoute ici 6 879 octets JS
et 1 465 gzip. Aucun changement du défaut `create` n'en est déduit.

## Cas ordinaires : surcoût sans nouvelle couverture

Les sources ordinaires du microbanc et les treize modules de la page
n'ajoutent **aucune définition compilée** avec ce prototype. La fixture
ciblée ci-dessus, transformée de la même façon pour les variantes, constitue
la couverture supplémentaire mesurée.

| Contrôle léger                | Montage référence / prototype | Tas référence / prototype |
| ----------------------------- | ----------------------------: | ------------------------: |
| 5 000 lignes simples          |                 15,55 / 15,85 |             4,942 / 4,950 |
| 5 000 lignes indexées         |                 20,50 / 21,45 |             8,730 / 8,742 |
| 5 000 lignes à quatre niveaux |                 30,45 / 31,25 |           16,635 / 16,648 |
| 128 champs indépendants       |                   3,20 / 3,20 |             1,878 / 1,879 |

Sur les indexées, les huit différences de montage sont défavorables ou nulles,
avec une médiane de +0,85 ms. Le prototype doit donc encore éviter son coût
sur les plans existants. Le bundle léger ordinaire ajoute 579 octets JS,
156 gzip.

Page réaliste, échelle 2, huit navigations et trois boucles : les 47
instantanés d'interactions sont identiques, mais montage 34,75 → 36,95 ms,
remontage 19,50 → 20,80 ms ; tas après parcours 8,82 → 8,84 Mio. Aucun
gain de page n'est établi. Le bundle ajoute 583 octets JS, 140 gzip.

Le contrôle standard ordinaire donne 40,90 / 41,70 ms pour les lignes et
55,85 / 57,65 ms pour les indexées. Les différences appariées de montage
sont plus partagées : +0,40 et −0,05 ms. Sans plugin, les différences
appariées sont +0,30 et +1,35 ms, sans gain établi ; le tas reste proche de
la référence. Le bundle sans plugin ajoute 579 octets JS, 139 gzip.
Les échantillons restent disponibles pour apprécier la dispersion.

## Contre-exemple : observer le DOM connecté au premier montage

Un premier élément porte un marqueur. Le binding d'un second élément compte
ce marqueur dans `document`. L'interpréteur voit le premier élément déjà
connecté ; le plan évalue ses bindings avant d'insérer l'arbre préparé.

| Programme                | Renderer                               | Valeur observée |
| ------------------------ | -------------------------------------- | --------------: |
| Une racine, deux enfants | Générique                              |               1 |
| Une racine, deux enfants | Compilateur actuel, standard et `lean` |               0 |
| Plusieurs racines        | Compilateur actuel : repli générique   |               1 |
| Plusieurs racines        | Prototype, standard et `lean`          |               0 |

Cette divergence est reproduite indépendamment contre la référence et le
prototype. Elle ne vient donc pas seulement des nouvelles bornes de plage.
Le [README du compilateur](../../libs/compiler/README.md) documente maintenant
cette limite existante : les callbacks dépendant de l'état connecté du DOM
au montage doivent conserver le renderer générique.

Les contrats de caractérisation passent parce qu'ils vérifient ces valeurs
différentes, pas parce que les renderers sont équivalents. Une extension
générale demanderait un séquençage compatible ou une preuve d'éligibilité
adaptée. Avec le surcoût des cas ordinaires et la petite mise à jour plus
lente, cela justifie de garder ce prototype hors du produit.

## Vérification et reproduction

Suite expérimentale Compiler : **117 tests** ; Component : **609** ; contrôles
TypeScript réussis. Parmi les nouveaux contrats, certains caractérisent
explicitement la non-équivalence ci-dessus. Les autres contrôlent DOM,
identités, scopes, replay, propriétaires, indépendance des mises à jour,
clonage et destruction. Le test historique imposant le repli pour deux
racines est remplacé dans cette copie expérimentale par un repli sur plage
vide ; les nouveaux contrats vérifient positivement les plages fixes.

Le premier écran de tests contient aussi des fixtures corrigées avant timing :
comparaison d'ordre d'attributs, `ifNode` sans nom, sélecteur trop large, et
deux vérifications d'injection déplacées dans des génératrices après un échec
de callback ordinaire en réévaluation. Aucun correctif d'injection de production
n'est revendiqué ici. Les résultats initiaux et révisés sont conservés.

Apple M3, Node 25.2.1, Chromium 153.0.8010.12. Production minifiée, contextes
frais, huit navigations par variante/cas, ordre déterministe et blocs
adjacents équilibrés pour les microbancs. Aucun test ou build concurrent
pendant ces cohortes. Les durées de build dépendent de l'ordre et du cache.
Montage et actions mesurent le travail synchrone JS/DOM ; le tas après GC
exclut la mémoire native du DOM. Ce ne sont pas des mesures LCP ou INP.

```sh
node apps/compiler-benchmark/experiments/multiple-roots.mjs
node apps/compiler-benchmark/experiments/validate-multiple-roots.mjs
node apps/compiler-benchmark/experiments/run-multiple-roots.mjs
```

Le dernier script exécute les sept cohortes séquentiellement et conserve
chaque runner avec sa sortie. Le compilateur reste optionnel. La campagne
globale est toujours [en cours](2026-11-17-performance-campaign.json).
