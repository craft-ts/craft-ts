## Backlog

- [ ] For query/mutation/AsyncProcess insertions, expose a set and state similar to other primitive states that will simplify create reusable insert. (for persister one more property isStable ? To invalidate state while mutating)
- [ ] Improve localStoragePersister invalidation
- [ ] Explore to make Source similar to Subject/ReplaySubject
- [ ] Add support for RxJs source without having an explicitly dependency on RxJs.
- [ ] Changer package sur npm & upload & mettre à jour la doc
- [ ] Clean internal code
- [ ] Explore explicit type safe error in state
- [ ] In Craft, explore a way to only craftQueryParams in scoped craft (without affecting global query params or add warnings)
- [ ] In Craft, explore a way to create properties/methods that are one available in the state / in craft (but on exposed in a component)
- [ ] Explore a way to handle selectedIds (that can be used for bulk delete ...), creating a dedicated state, or a dedicated insertion. It will expose all selected, some selected, toggleOne/toggleAll...
