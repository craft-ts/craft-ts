## Backlog

- [ ] For query/mutation/AsyncProcess insertions, expose a set and state similar to other primitive states that will simplify creating reusable insertions. (for persister one more property isStable ? To invalidate state while mutating)
- [ ] Improve storage persister (better invalidation, handle storing state)
- [x] Explore to make Source similar to Subject/ReplaySubject
- [ ] Add support for RxJs source without having an explicit dependency on RxJs and accepts Observable as params for mutation/query/asyncProcess
- [ ] Clean internal code
- [ ] Explore explicit type safe error in primitive / use eslint to force handling it (create adapter for OpenApi contract, TS-Rest contract...)
- [ ] Explore a way to handle selectedIds (that can be used for bulk delete ...), creating a dedicated state, or a dedicated insertion. It will expose all selected, some selected, toggleOne/toggleAll...
- [ ] Add to-source$ utility to create a source from a DOM event
- [ ] Propose a state or pattern to handle trees (to explore)
- [ ] add crossLayerEvent to insertSelect (from bottom to top)
- [ ] Rename craftException to cException
- [ ] Create a insertContract similar to a class to implement an interface, also add an helper with a proxy to mock the data ?
- Explore an explicit way to pass dependencies of primitives (it would be easier for testing)

- forms:
  - Handle async validator calls in parallel
  - login form example, explain how to trigger an exception on submit and debounce errors
  - show an error if the form submit mutation doesn't have the same payload as the form value
  - formRoot can't be used for submission, create an alternative directive?
