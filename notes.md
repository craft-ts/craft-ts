## Deploy doc

Run `docs:publish`, then from the VSCode editor, add a commit with all the changes and push into the gh-pages branches.

## Déployer une nouvelle version de @craft-ng/core

### Prérequis

1. Être connecté à npm : `npm whoami` (si erreur, faire `npm login`)
2. Avoir build le projet : `nx build ng-craft-core`

### Commandes pour publier la lib

Générer un grannular token, puis depuis ce projet= `npm config set //registry.npmjs.org/:\_authToken=TOKENKEY``
Ou le mettre à jour: https://www.npmjs.com/settings/ronnain/tokens/

(Penser à bien cocher By-pass two-factor authentication pour ce token, sinon la publication échouera)

npm config set //registry.npmjs.org/:\_authToken "VOTRE_TOKEN"

```bash
npm login

# 1. Versionner le package
nx release version 0.1.0

# 2. Publier sur npm
nx release publish
```

Puis mettre à jour les versions dans les packages.json

### Notes

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

## Mettre à jour les deps des composants

1- Faire le build de la lib dev-tools

2- `node dist/libs/dev-tools/src/scripts/angular-brand-codemod.js --root apps/demo/src`
