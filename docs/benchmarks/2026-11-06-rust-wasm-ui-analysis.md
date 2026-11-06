# Rust et WebAssembly : architectures utiles à CraftTS

Recherche du 6 novembre 2026. Analyse des documentations primaires, sans nouvelle mesure de ces frameworks dans notre benchmark. Les résultats des prototypes CraftTS ne permettent pas de leur attribuer un classement de performances.

## Conclusion

Rust et WebAssembly peuvent être utiles, mais aucun résultat de cette recherche ne justifie de porter le renderer CraftTS pour obtenir automatiquement un gain. Les idées les plus pertinentes sont les vues préparées de Kobold, les bindings fins de Leptos, les identifiants de stockage de Sycamore et le traitement des mutations de Dioxus/Sledgehammer.

Ces architectures peuvent inspirer du JavaScript. Un outil écrit en Rust pourrait également générer des plans JavaScript, sans imposer WebAssembly aux applications.

## Kobold : création du DOM statique générée en JavaScript

La macro `view!` génère une vue typée et du JavaScript pour construire les éléments statiques. Les références des nœuds correspondant aux expressions dynamiques sont conservées ; les mises à jour visent ces emplacements. La documentation indique qu'une vue entièrement statique a une méthode de mise à jour vide. Cela ne signifie pas que créer son DOM est gratuit. [Documentation Kobold](https://docs.rs/kobold/latest/kobold/).

L'auteur montre concrètement l'expansion d'une vue en fonction JavaScript de création DOM. Cette organisation limite les passages Wasm/JS nécessaires à la construction de la vue. [Présentation avec code généré](https://maciej.codes/2023-03-23-kobold.html).

**Application possible à CraftTS, à mesurer :** un plan par forme de template contenant une fabrique de montage, les références des bindings dynamiques et leurs fonctions de mise à jour. Nos fabriques DOM préparées ont déjà validé une partie de cette direction sur la ligne de benchmark. Kobold ne démontre pas un gain supplémentaire par rapport à ces prototypes. Une fabrique JavaScript spécialisée pourrait aussi être comparée au clonage de template utilisé actuellement.

## Leptos : composant initialisé une fois, mises à jour ciblées

Dans le modèle documenté, la fonction de composant initialise la vue une fois. Les signaux et closures réactives permettent de mettre à jour les parties dépendantes. [Modèle de réactivité Leptos](https://book.leptos.dev/reactivity/interlude_functions.html).

Tachys, utilisé dans l'écosystème Leptos, représente les vues avec un arbre statiquement typé et sépare cette représentation du système de détection de changements. [Documentation Tachys](https://docs.rs/tachys/latest/tachys/).

**Application possible :** conserver la réactivité fine de CraftTS tout en préparant la structure et les accès au DOM. La granularité et la spécialisation du rendu sont deux axes différents. La documentation ne fournit pas de comparaison chiffrée avec nos effets, scopes DI, traces ou contrats de replay.

## Sycamore : signaux référencés par identifiants

La documentation décrit une réactivité fine inspirée de Solid. Les signaux sont stockés dans une structure de type arène ; un handle de signal contient un identifiant vers ce stockage. [Documentation Sycamore](https://sycamore.dev/book/introduction/adding-state).

**Piste nouvelle, non validée :** examiner si certains états internes du renderer pourraient utiliser des handles et un stockage compact. Cela ne consiste pas à remplacer quelques Maps : notre expérience de tables DI partagées n'a pas donné de gain global convaincant. Les performances d'une arène en Rust ne prédisent pas celles d'une implémentation JavaScript, et remplacer le moteur réactif actuel serait un changement d'une autre ampleur.

## Dioxus et Sledgehammer : templates statiques et application des mutations

Dioxus prépare des définitions de templates via ses macros et distingue leurs parties dynamiques. [Vue d'ensemble de son architecture](https://github.com/DioxusLabs/dioxus/blob/main/notes/architecture/00-OVERVIEW.md).

Son interpréteur DOM est écrit en TypeScript puis distribué en JavaScript : il applique les éditions produites par le VirtualDOM. [Documentation de l'interpréteur](https://docs.rs/dioxus-interpreter-js/latest/dioxus_interpreter_js/).

Sledgehammer fournit des bindings qui enregistrent des appels et les exécutent lors d'un flush. [Documentation des appels groupés](https://docs.rs/sledgehammer_bindgen/latest/sledgehammer_bindgen/attr.bindgen.html).

**Application possible :** étudier la séparation entre calcul des changements et application au DOM. Une partie de l'intérêt de Sledgehammer répond spécifiquement au passage Wasm/JS, absent du renderer JavaScript actuel de CraftTS. Ce résultat ne permet donc pas de promettre un gain équivalent pour CraftTS. Grouper des commandes diffère aussi de notre essai de construction dans un DocumentFragment, qui n'a pas donné de gain convaincant.

## Ce que WebAssembly ajouterait au projet

L'accès aux Web APIs passe actuellement par des bindings JavaScript dans les usages Rust/Wasm étudiés. Les conversions et les objets d'interop peuvent avoir un coût, même si l'appel élémentaire entre JavaScript et Wasm est rapide. [Analyse de Mozilla](https://hacks.mozilla.org/2026/02/making-webassembly-a-first-class-language-on-the-web/).

Les passages de `String`/`str` par wasm-bindgen impliquent notamment de l'encodage et des copies. Il existe des représentations conservant les chaînes côté JavaScript, mais elles ont un autre contrat. [Types de chaînes wasm-bindgen](https://wasm-bindgen.github.io/wasm-bindgen/reference/types/str.html).

Un détail importe pour nos identités : JavaScript accepte des surrogates UTF-16 isolés ; une conversion classique en chaîne Rust UTF-8 peut les remplacer. Un éventuel port des empreintes doit conserver nos unités UTF-16 et nos règles d'erreur, pas uniquement produire un hash ressemblant sur du texte ASCII.

## Trois usages à distinguer

1. **S'inspirer des moteurs Rust et rester en JavaScript.** C'est directement pertinent pour les plans de rendu préparés et leurs bindings.
2. **Utiliser Rust dans un outil de génération.** Il pourrait produire du JavaScript spécialisé ; son langage d'implémentation ne garantit pas à lui seul un meilleur code de rendu.
3. **Exécuter un module Rust/Wasm dans le navigateur.** À envisager pour un calcul autonome et assez conséquent, avec des données traitées par lots. Il faut mesurer le coût de chargement et d'instanciation, les transferts, le calcul et la restitution des résultats dans le parcours complet.

Pour les calculs d'empreintes ou d'identités, une fonction Rust isolée plus rapide ne suffirait pas à démontrer un montage plus rapide. La préparation des chaînes et des chemins, leur transfert et les adresses finales font partie du coût et du contrat.

## Priorité proposée

Étudier en premier le modèle de plan de Kobold, en l'associant à des bindings fins comme Leptos. Le comparer à notre chemin préparé actuel sur des composants plus variés, en conservant les identités, scopes, événements et nettoyages. Un port Rust/Wasm du renderer n'est pas validé par cette recherche ; l'intégration de ces bibliothèques confierait une partie du rendu à un autre moteur et demanderait une adaptation des contrats CraftTS.

Cette recherche n'a modifié aucune bibliothèque du runtime et n'ajoute aucune dépendance Rust ou WebAssembly.
