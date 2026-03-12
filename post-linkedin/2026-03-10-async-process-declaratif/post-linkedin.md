AsyncProcess en Angular : une API déclarative pour l’asynchrone

Je continue de creuser les primitives de @craft-ng, et `asyncProcess` est clairement un utilitaire que j’aime beaucoup.

L’idée : proposer une API très proche des `resources` Angular, mais pensée pour piloter des traitements asynchrones de façon déclarative.

Ce que j’apprécie particulièrement 👇

- API familière si tu utilises déjà les resources Angular
- possibilité de lancer plusieurs exécutions en parallèle (avec `identifier`)
- gestion des exceptions métier avec typage préservé
- même pattern de composition que les autres primitives @craft-ng

Je pense à rendre cet utilitaire encore plus flexible pour gérer plus de cas par pilotage de la logique.
Je suis encore en phase de réflexion sur la meilleure direction. 🤔

Tu voudrais quelles capacités en priorité sur ce genre de primitive ?

Doc @craft-ng : https://ng-angular-stack.github.io/craft/

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
