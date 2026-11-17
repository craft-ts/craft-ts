# Bloc impératif avec composants Craft : investigation

17 novembre 2026. Base `3d258485d`, après le compilateur `lean` de la
[PR #22](https://github.com/craft-ts/craft-ts/pull/22).
Expérience séparée sur `codex/imperative-render-investigation` ; aucune modification
du renderer distribué. Le prototype est un banc de recherche, pas une API publique.

Verdict : cette voie réduit nettement le travail JS et le heap des cellules
simples. Sur un tableau de 10 000 lignes avec un bouton Craft complet par ligne,
le gain médian de montage JS est d’environ 17 %, mais seulement 4 % avec la mise
en page ; la restauration régresse de 23 %. Les distributions sont larges. Je
retiens l’idée comme capacité spécialisée et comme piste pour compiler des plans
de lignes ; la virtualisation reste prioritaire pour les très grandes listes
dont seule une petite partie est visible.

L'idée est viable : un bloc écrit en TypeScript peut construire directement ses
cellules avec un adaptateur DOM, garder les références utiles, puis ne modifier
que les valeurs changées. Des emplacements possédés par le renderer peuvent y
monter de vrais composants Craft pour les parties interactives. Le gain vient
des structures et effets évités, et d'un diff adapté au tableau ; le compilateur
produit déjà du JavaScript qui appelle le DOM natif.

## Ce qui existe déjà

- `CraftNodeDirectiveContext` fournit `element`, `renderer`, `injector` et des
  inputs réactifs ; `CraftNodeEffectFactory` crée un effet possédé par la directive.
- `CraftDomAdapter` contient création, insertion, attributs, textes et listeners.
  Son implémentation serveur construit un arbre sérialisable ; les listeners y
  sont inactifs. Aucun accès global à `window` ou `document` n'est nécessaire.
- `mountCraftComponent` constitue un point d'entrée pour un montage racine dans
  le navigateur. Il recrée un adaptateur depuis `host.ownerDocument` ; ce n'est
  pas le bon pont pour ces enfants : contexte de frontière, identité, SSR et
  destruction doivent suivre le bloc parent.

Le maillon testé est donc un **emplacement enfant possédé**, raccordé au
`mountNode` existant, plutôt qu'un deuxième moteur de composants.

## Expérience

Le [banc reproductible](../../apps/imperative-render-prototype/README.md) compare
trois builds production sur le même tableau :

1. `runtime` : `forNode` avec un composant de ligne interprété ;
2. `lean` : même code, compilateur léger activé ;
3. `manual` : directive unique, effet unique, Map indexée par clé, création native
   des lignes et diff écrit à la main.

Chaque ligne contient trois cellules : identifiant, texte et score. Le deuxième
cas ajoute une quatrième cellule avec un bouton Edit, **composant Craft ordinaire
dans les trois variantes**. Sa métadonnée `providers: []` force le chemin
générique et conserve son injecteur propre. On mesure ainsi le coût de garder
ces îlots interactifs complets. Le rapport du compilateur confirme que les deux
formes de ligne sont compilées en `lean`, et que le bouton reste générique.

Le pont expérimental est injecté par Vite dans le contexte des directives, sans
modifier les sources des bibliothèques. Il transmet le contexte parent et
l'injecteur de la directive, dérive l'identité de la clé et délègue au renderer.
Le bloc détruit les emplacements retirés ; son injecteur libère aussi ceux qui
restent. Le prototype ne prend en charge que le patch d'un même enfant.

## Résultats de confirmation

Apple M3, Node 25.2.1, Chromium 153.0.8010.12, production minifiée. Sept
navigations fraîches par variante/taille/cas, ordre mélangé avec graine fixe :
**84 navigations de mesure**, en plus des contrats. Deux boucles d’échauffement,
puis cinq boucles mesurées. Le contrôle TypeScript du prototype passe.
[Données complètes et distributions](2026-11-17-imperative-rendering-summary.json).

Le montage ci-dessous est le bootstrap synchrone, en ms. Il exclut la mise en
page ultérieure ; il ne constitue pas une mesure de LCP ou de temps de peinture.

| Lignes | Bouton Craft par ligne | Runtime |  Lean | Impératif |
| -----: | :--------------------- | ------: | ----: | --------: |
|  5 000 | Non                    |    63,3 |  36,4 |      12,1 |
|  5 000 | Oui                    |   104,9 |  88,1 |      56,5 |
| 10 000 | Non                    |   124,3 |  41,2 |      23,1 |
| 10 000 | Oui                    |   338,8 | 157,8 |     131,0 |

À 10 000 lignes simples, le montage JS passe de 41,2 à 23,1 ms face à lean
(−44 %), et le heap JS après parcours/GC de 16,1 à 4,4 Mio (−73 %). Avec
10 000 boutons Craft ordinaires, le montage passe de 157,8 à 131,0 ms
(−17 %), et le heap de 58,9 à 46,3 Mio (−22 %). Ce heap ne mesure pas la
mémoire totale du navigateur ou de ses structures DOM natives.

La série présente des variations importantes. Exemple : le montage de 10 000
lignes avec boutons varie de 111 à 240 ms en lean et de 95 à 172 ms en
impératif. Leurs distributions se recouvrent. Les médianes ne constituent pas
une estimation précise d’un gain universel.

### Coût du navigateur

Le harness force ensuite une mise en page. La médiane de la somme par navigation
`montage + layout` donne :

| Lignes | Bouton Craft par ligne | Runtime |  Lean | Impératif |
| -----: | :--------------------- | ------: | ----: | --------: |
|  5 000 | Non                    |   104,4 |  91,1 |      62,0 |
|  5 000 | Oui                    |   188,7 | 204,1 |     148,3 |
| 10 000 | Non                    |   226,9 | 123,2 |     130,2 |
| 10 000 | Oui                    |   535,0 | 368,6 |     354,3 |

À 10 000 lignes simples, la somme médiane est même plus lente dans la variante
manuelle : 123,2 → 130,2 ms. Avec boutons, elle ne baisse que de 368,6 à
354,3 ms (−3,9 %), malgré le gain JS. Les mises en page varient fortement
avec la machine et l’ordre des travaux ; le banc ne permet pas d’attribuer leur
écart à la stratégie Craft. Le tableau contient 40 002 éléments sans boutons,
60 002 avec boutons, identiques entre variantes. **Créer ces nœuds plus vite
ne supprime pas leur coût de layout.**

### Mises à jour : contreparties réelles

Médianes en ms à 10 000 lignes ; DOM appliqué et microtask, sans layout/paint
ultérieur :

| Cas / action        | Lean | Impératif |
| ------------------- | ---: | --------: |
| Simple : une ligne  |  1,8 |       1,5 |
| Simple : restaurer  | 16,5 |       7,6 |
| Boutons : une ligne |  4,5 |       5,3 |
| Boutons : inverser  | 51,1 |      54,9 |
| Boutons : filtrer   | 40,4 |      48,2 |
| Boutons : restaurer | 66,7 |      82,3 |

Avec boutons, la restauration régresse de 66,7 à 82,3 ms (+23 %) ; modifier
une ligne passe de 4,5 à 5,3 ms. À 5 000 lignes, les tendances sont plus
favorables, sauf pour la mise à jour d’une ligne (1,0 → 1,5 ms). Le parcours
agrégé et le patch d’inputs des îlots ne remplacent pas automatiquement la
granularité du moteur. Le prototype est intéressant pour le montage et la
mémoire des cellules simples ; il ne démontre pas une amélioration générale
des tableaux interactifs face à lean.

## Contrats vérifiés et portée

Les navigations de contrat, distinctes des timings, comparent les DOM après
retrait des attributs et commentaires internes de Craft, à travers
modification, inversion, filtrage, restauration et insertion. La ligne conservée
reste le même nœud. Un clic après inversion modifie la bonne ligne et son titre
réactif. Les compteurs vérifient que tous les boutons sont détruits, et qu'un
bouton détaché ne déclenche plus son ancien listener.

Le serveur exécute le même code dans Node, avec `window` et `document` globaux
absents. Le HTML des tableaux manuel/interprété est comparé après normalisation
des métadonnées ; textes échappés et destruction des enfants sont vérifiés. Deux
requêtes de tailles différentes s'exécutent simultanément sans mélange d'état.

**SSR et hydratation sont deux contrats différents.** Ce prototype prouve la
construction serveur, pas la réutilisation du DOM serveur. Sa création native
ne réclame pas les nœuds au curseur d'hydratation. Une API publique devra proposer
un mode claim/adopt avec identités stables, ou un template générique de repli
pour le couple SSR/hydratation. Remonter volontairement le bloc est une autre
politique possible, qui doit être explicite.

Les cellules natives n'ont pas d'enregistrement de cible individuel ; les
boutons passent par le renderer de composants habituel. Le comptage et le DOM
visible ne certifient pas les adresses de replay, les locators ou l'inspection
de ces cellules. La publication d'une API doit définir ces garanties et les
éventuels replis de diagnostic.

Les cellules natives n'ont pas d'effet réactif individuel : le bloc parcourt la
collection pour trouver les changements. Ce contrat correspond à une source
`rows` remplaçant des objets immuables. Des signaux indépendants par cellule,
une ligne suspendue, des erreurs de nettoyage, une projection, des providers de
ligne, une requête async dans un enfant ou des scopes CSS demandent des essais
spécifiques avant de stabiliser l'API. Les clés doivent être uniques. Ce banc
ne certifie pas ces comportements supplémentaires.

## API à viser

Je recommande un bloc de rendu possédé, utilisable sans compilateur, que l'on
peut ensuite cacher derrière un composant de tableau. Son contexte fournirait :

- une façade DOM avec création, texte, attributs/propriétés validés et déplacements ;
- des effets et nettoyages automatiquement rattachés au bloc ;
- `mount`/`patch`/`destroy` d'enfants Craft dans des emplacements à clés stables ;
- les capacités SSR/hydratation et le scheduler de Craft.

Les morceaux créés à la main et le renderer doivent posséder des zones distinctes.
Le bloc peut déplacer la racine d'une ligne contenant un îlot ; il ne modifie
pas l'intérieur de cet îlot. Les scopes CSS et contrôles d'attributs/URLs doivent
passer par la même façade que le renderer. Exposer un `document` brut ne suffit
pas à définir ces contrats. L'accès est une capacité du contexte de montage,
pas une variable globale ou un singleton partagé entre requêtes.

Pour un premier produit utilisable, un tableau à schéma fixe et emplacements
Craft me paraît préférable à une liberté impérative sans contrat : clé de ligne,
descripteurs de colonnes, patchs de cellules, emplacements d'action. Le mécanisme
bas niveau reste disponible pour les cas spécialisés. Une autre exploitation
des mêmes résultats serait une compilation de `forNode` en plan de lignes,
avec le même diff natif et des trous Craft ; cela éviterait aux applications de
réécrire chacune la réconciliation.

## Très grandes collections

Le bloc réduit le coût Craft de chaque élément, pas le nombre d'éléments que le
navigateur doit mettre en page. Pour une longue liste dont seule une fenêtre
est visible, la virtualisation constitue donc la piste complémentaire prioritaire.
Elle limite les lignes et leurs boutons montés. Elle change aussi les contrats
de recherche dans la page, impression, focus, sélection et accessibilité : on
la mesure dans un cas distinct, pas comme une variante au DOM équivalent.

Craft possède déjà `scheduleFor({ frameBudgetMs: 4 })`, pour répartir le travail
sur les frames. Cela permet de rendre progressivement sans monopoliser aussi
longtemps le thread principal ; cela ne supprime ni le DOM total ni son coût.
Un bloc impératif devrait employer le scheduler/temps de Craft pour conserver
les possibilités de replay et d'annulation.

Références de conception : les [directives Lit](https://lit.dev/docs/templates/custom-directives/)
illustrent l'accès impératif et la gestion de durée de vie ; leur
[documentation SSR](https://lit.dev/docs/ssr/authoring/) traite séparément les
capacités exécutées sur le serveur. [web.dev](https://web.dev/articles/virtualize-long-lists-react-window)
décrit la fenêtre de lignes visibles et la limitation du nombre de nœuds.
Ces sources motivent les contrats proposés ; les gains chiffrés ci-dessus
proviennent uniquement de l'expérience Craft locale.
