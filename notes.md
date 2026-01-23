## Deploy doc

Run `docs:publish`, then from the VSCode editor, add a commit with all the changes and push into the gh-pages branches.

## Versioning Nx

nx release version # calcule et applique les nouvelles versions
nx release publish # publie sur npm (selon "packageRoot" de chaque projet)

## Tests with UI

`npx nx run ng-craft-core:test --watch --ui`

### Debug mode:

`npx nx run ng-craft-core:test:debug --watch --ui`

And run the following launch configuration in VSCode:
`launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach Nx Vitest (port 9229)",
      "port": 9229,
      "restart": true,
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "type": "node",
      "request": "attach",
      "name": "Attach Nx Vitest (PID picker)",
      "processId": "${command:PickProcess}",
      "restart": true,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```
