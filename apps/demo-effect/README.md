# EffectTS + CraftTS demo

Application dédiée aux exemples d’intégration entre EffectTS et CraftTS.

## Serve

Depuis la racine du dépôt :

```bash
npx nx serve demo-effect
```

L’application démarre sur `http://localhost:4201` et présente l’exemple
`yield* Effect`. Le bridge Effect est installé globalement dans
`src/app/app.config.ts`; dans un loader, l’adaptation se limite à
`yield* runEffect(effect)`.

## Vérifications

```bash
npx nx typecheck demo-effect
npx nx typecheck-spec demo-effect
npx nx test demo-effect
npx nx build demo-effect
```
