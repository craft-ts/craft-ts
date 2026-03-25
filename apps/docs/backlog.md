## Backlog

- [ ] For query/mutation/AsyncProcess insertions, expose a set and state similar to other primitive states that will simplify creating reusable insertions. (for persister one more property isStable ? To invalidate state while mutating)
- [ ] Improve localStoragePersister (better invalidation, handle storing state)
- [x] Explore to make Source similar to Subject/ReplaySubject
- [ ] Add support for RxJs source without having an explicit dependency on RxJs and accepts Observable as params for mutation/query/asyncProcess
- [ ] Clean internal code
- [ ] Explore explicit type safe error in primitive / use eslint to force handling it (create adapter for OpenApi contract, TS-Rest contract...)
- [ ] In Craft, explore a way to only use craftQueryParams in scoped craft (without affecting global query params or add warnings)
- [ ] In Craft, explore a way to create properties/methods that are only available in the state / in craft (but not exposed in a component)
- [ ] Explore a way to handle selectedIds (that can be used for bulk delete ...), creating a dedicated state, or a dedicated insertion. It will expose all selected, some selected, toggleOne/toggleAll...
- [ ] Standardize craftState => craftStates naming where possible
- [ ] Add to-source$ utility to create a source from a DOM event
- [ ] Proposer un state ou un pattern pour gérer les tree (à explorer)

- [ ] Tester insertion localStorage
- [ ] add crossLayerEvent to insertSelect (from bottom to top)
- [ ] insertSelect add support for non object/array state (ex: primitive state) and pass the selected state as param to the insertion
- [ ] Rename craftException to cException
- [ ] Create a insertContract similar to a class to implement an interface, also add an helper with a proxy to mock the data ?
- ajouter inject service à la doc

- forms:
  - Gérer les appels async des valdiateurs en parallèle
  - vérifier l'état du form si des validateurs sont en pending
  - ajouter un état submitted ou autre qui signifie que le user a essayé de submit le form (pour afficher les erreurs seulement après) et exposer un expcetion submittedOrDirty
  - login form exemple, expliquer comment trigger une exception au submit et debounce les erreurs
  - il faut vraiment que les validateurs comme cRequired appellent les originaux pour mettre à jour le html avec le bon tag et ajouter testes
  - ajouter des insertions à insertForm
  - supprimer modalValidatorRef
  - afficher erreur si form submit mutation n'a pas la même payload que le form value
  - on ne peut pas utilise formRoot pour la soumission, créer une directive alternative ?
