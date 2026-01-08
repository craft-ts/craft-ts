## Deploy doc

Run `docs:publish`, then from the VSCode editor, add a commit with all the changes and push into the gh-pages branches.

## Versioning Nx

nx release version # calcule et applique les nouvelles versions
nx release publish # publie sur npm (selon "packageRoot" de chaque projet)

## Tests with UI

npx nx run ng-craft-core:test --watch --ui
