Mutation déclarative en Angular : le pattern qui me manquait

Dans ma lib @craft-ng, j'ai une mutation déclarative, pensée comme une resource Angular… mais orientée COMMANDE.

L’API est volontairement très proche de `query` (celle que j’ai présentée la semaine dernière), donc la prise en main est immédiate.

Ce que je trouve vraiment fort : on peut lancer des mutations en parallèle via `identifier`.
Parfait pour gérer des updates granulaires (ligne par ligne, item par item) sans se casser la tête avec des MergeMap.

Concrètement :

- orchestration déclarative des états de mutation
- parallélisation fine avec `identifier`
- mise à jour locale ciblée après succès
- peut aussi retourner des exceptions métier qui sont préservées dans le typage.
- s'accorde parfaitement avec le reste de la stack @craft-ng

Je ne vois que trop peu passer ce genre de pattern dans les projets Angular, alors que c’est un vrai gain de productivité et de maintenabilité.

Je milite pour éviter les `subscribe` dans les méthodes, au profit de patterns déclaratifs comme celui-ci.

Tu en penses quoi ?
Tu gères déjà tes mutations de manière granulaire, ou tu restes sur un flux plus global ?

Doc @craft-ng : https://ng-angular-stack.github.io/craft/

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
