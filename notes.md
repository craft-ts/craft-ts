## Deploy doc

Run `docs:publish`, then from the VSCode editor, add a commit with all the changes and push into the gh-pages branches.

## Déployer une nouvelle version de @craft-ng/core

### Prérequis

1. Être connecté à npm : `npm whoami` (si erreur, faire `npm login`)
2. Avoir build le projet : `nx build ng-craft-core`

### Commandes pour publier

**Option 1 : Processus complet automatisé**

```bash
nx release --first-release
```

Cette commande :

- Demande le type de bump (major/minor/patch)
- Build automatiquement via `preVersionCommand`
- Met à jour les versions dans package.json
- Génère/met à jour le CHANGELOG.md
- Crée un commit et tag git
- Publie sur npm

**Option 2 : Processus manuel en 2 étapes**

```bash
nx release version     # calcule et applique les nouvelles versions
nx release publish     # publie sur npm (selon "packageRoot" de chaque projet)
```

**Option 3 : Publication manuelle depuis dist/**

```bash
cd dist/libs/core && npm publish --access public
```

### Notes

- Le flag `--first-release` est nécessaire la première fois ou quand il n'y a pas de tags git précédents
- La version est mise à jour dans `dist/libs/core/package.json` automatiquement
- Penser à mettre à jour manuellement `libs/core/package.json` après publication

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

// todo state, factoriser les insertions siganture+implem
