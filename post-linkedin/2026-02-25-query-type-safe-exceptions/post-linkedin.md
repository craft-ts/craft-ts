Query type-safe avec exceptions inférées: ce que j’ajoute à @craft-ng

Je suis en train de finaliser une évolution importante de `query` : les exceptions type-safe inférées depuis `params` et `loader`.

Exemple de syntaxe côté loader 👇

`loader: ({ params: userId }) => getUser(userId)`

avec un retour typé comme :
`User | CraftException<{ code: 'USER_NOT_FOUND' }> | CraftException<{ code: 'COMMON_HTTP_ERROR' }>`

Concrètement, ça apporte quoi ?

- gestion d’erreurs plus pro, avec moins d’oublis de gestion d'erreurs côté UX/UI
- exceptions accessibles/typées directement depuis `params` ou `loader`
- logique UI plus simple à brancher (ex: connexion coupée => `COMMON_HTTP_ERROR` => afficher un bouton “recharger”)
- très bon fit avec des contrats OpenAPI / tRPC

Et par rapport aux resources Angular, qu’est-ce qu’il y a en plus ?

- queries parallèles (via identifier), avec une API pensée pour ce cas
- dernière valeur préservée pendant le loading pour éviter le flickering
- système d’insertions composables :
  - persistance via le backend de stockage configuré (`insertStoragePersister`)
  - smart loading
  - propriétés dérivées
  - interaction native avec les mutations (`optimistic update` / `reload on failure`)

Je partagerai bientôt d’autres exemples concrets avec ce système.

Qu'est-ce que tu penses de ce mécanisme ? Est-ce tu traites déjà proprement toutes les erreurs de tes queries ?

Doc @craft-ng : https://ng-angular-stack.github.io/craft/

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
