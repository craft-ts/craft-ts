# EffectTS + CraftTS quickstart

This is the smallest executable EffectTS + CraftTS application in the
workspace. It demonstrates the complete frontend boundary:

```text
Effect domain program → Layer → queryEffect → Craft component
```

The app deliberately contains one task read and one typed business error. It
also enables the Effect ESLint preset, the Effect language-service diagnostics,
and architecture assertions so it can serve as a starter template and a CI
fixture.

## Run it

From the repository root:

```bash
npx nx serve quickstart-effect
```

The app runs at `http://localhost:4202`.

## Verify it

```bash
npx nx lint quickstart-effect
npx nx typecheck quickstart-effect
npx nx effect-check quickstart-effect
npx nx typecheck-spec quickstart-effect
npx nx test quickstart-effect
npx nx typecheck-architecture quickstart-effect
npx nx architecture quickstart-effect
npx nx build quickstart-effect
```

Read the corresponding documentation page:
[Effect users: start here](https://craft-ts.github.io/craft/learn-effect/00-start-here).
