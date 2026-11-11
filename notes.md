## Deploy doc

Run `docs:publish`, then from the VSCode editor, add a commit with all the changes and push into the gh-pages branches.

## Déployer une nouvelle version de @craft-ts/core

### Prérequis

1. Être connecté à npm : `npm whoami` (si erreur, faire `npm login`)
2. Avoir build le projet : `nx build craft-ts-core`

### Commandes pour publier la lib

Générer un grannular token, puis depuis ce projet= `npm config set //registry.npmjs.org/:\_authToken=TOKENKEY``
Ou le mettre à jour: https://www.npmjs.com/settings/ronnain/tokens/

(Penser à bien cocher By-pass two-factor authentication pour ce token, sinon la publication échouera)

npm config set //registry.npmjs.org/:\_authToken "VOTRE_TOKEN"

```bash
npm login
```

Commandes prévues :

```
npm run release:local -- patch
npm run release:local -- minor
npm run release:local -- major
```

Ou avec une version précise :

```
npm run release:local -- 0.6.0-beta.3
```

Pour vérifier sans modifier ni publier :
npm run release:local -- minor --dry-run
Le script nécessite aussi les dépôts voisins ../craft-ts.github.io et ../craft-ts-demo, chacun sur la branche main.

### Notes

## Tests with UI

`npx nx run craft-ts-core:test --watch --ui`

### Debug mode:

`npx nx run craft-ts-core:test:debug --watch --ui`

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

## Contrats de dépendances des composants

Les contrats sont inférés depuis les composants Craft avec `ComponentDepsOf`; aucun alias généré
n'est maintenu séparément.
