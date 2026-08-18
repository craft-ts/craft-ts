# Prompt — supprimer `GenDeps_*`

Copier le bloc ci-dessous dans une session agent dédiée. Ne pas élargir au graphe d’architecture ni à `craft route verify`.

---

Tu travailles dans le repo **craft-ts** (`@craft-ts/core`, `@craft-ts/dev-tools`, démo, docs, skills).

## Objectif

**Il n’y a plus de `GenDeps_*`.** Ce n’est pas un alias optionnel, pas un fallback Angular, pas un commentaire « legacy ». Le contrat de dépendances d’un composant est **toujours** dérivé du composant (ou du fragment de route) via `ComponentDepsOf`. Un `CanRun` / `RouteCheckedDI` ne doit plus pouvoir valider une forme figée et périmée.

La démo est déjà la cible : `apps/demo` ne contient **aucun** `GenDeps_`. Reproduis ce modèle partout.

## Contrat de remplacement

| Avant (interdit) | Après (obligatoire) |
| --- | --- |
| `export type GenDeps_Foo = GetDeps<{ ... }>` | rien. Le composant porte `CRAFT_COMPONENT_DEPS`. |
| `componentDeps: {} as import('./foo').GenDeps_Foo` | `loadCraftComponent(...)` (le fragment **est** un `ComponentDepsCarrier`) **ou** `ComponentDepsOf<typeof Foo>` / `ComponentDepsOf<(typeof import('./foo'))['default']>` |
| `RouteCheckedDI<GenDeps_Foo, ...>` | `RouteCheckedDI<ComponentDepsOf<typeof Foo>, ...>` |
| `setupCraftComponentTestingByRegister(Foo, {} as GenDeps_Foo, ...)` | passer `ComponentDepsOf<typeof Foo>` (ou l’API de test équivalente déjà utilisée dans la démo) |
| JSDoc / docs / skills qui parlent de générer ou rafraîchir `GenDeps_*` | pointer vers `ComponentDepsOf` et `loadCraftComponent` |

`GetDeps` **n’est pas** `GenDeps`. `GetDeps` reste le type de forme interne (`deps` / `provided` / `missingProvider` / …). Ne le supprime que s’il ne sert plus qu’à matérialiser des alias `GenDeps_*`. Ne le documente plus comme « l’alias à coller dans la route ».

Les composants décorés `@Component` / `@Directive` **n’ont pas** le droit de récupérer un `GenDeps_*` généré. S’il reste un hôte Angular dans la lib, fais-en un `ComponentDepsCarrier` (comme `loadCraftComponent`) ou migre-le vers `craftComponent`. Pas de troisième voie.

## À supprimer (code)

Règles ESLint et tout ce qui n’existe que pour générer / synchroniser les alias :

- `libs/dev-tools/src/eslint-rules/brand-angular-gen-deps-required.cjs` (+ `.spec.ts`)
- `libs/dev-tools/src/eslint-rules/brand-angular-deps-match.cjs` (+ `.spec.ts`)
- `libs/dev-tools/src/eslint-rules/component-test-gen-deps-match.cjs` (+ `.spec.ts`)
- enregistrement dans `libs/dev-tools/src/eslint-rules/index.cjs`
- mentions dans les configs ESLint (démo, docs, README `dev-tools`)

Codemods / CLI / générateurs qui écrivent `export type GenDeps_…` ou `componentDeps: {} as import('…').GenDeps_…` :

- `libs/dev-tools/src/scripts/angular-brand-codemod.ts` (et specs)
- `libs/dev-tools/src/scripts/routes/migrate-routes.ts`, `route-command.ts`, `verify-routes.ts` (et specs)
- `libs/dev-tools/src/generators/route/`
- `tools/generators/type-stress/index.ts`

Alias encore présents dans la lib (remplacer par `ComponentDepsOf` / carrier, puis effacer l’alias) :

- `libs/core/src/lib/form/craft-field.directive.ts` (`GenDeps_LegacyCraftFieldDirective`, `GenDeps_CraftFieldDirective`)
- `libs/core/src/lib/craft-pending.ts` (`GenDeps_DefaultCraftPendingComponent`)
- `libs/core/src/lib/craft-route-load-error.ts` (`GenDeps_CraftRouteLoadErrorHostComponent`)
- `libs/core/src/lib/send-context-to-ai.ts` / `libs/component/src/lib/ai/send-context-to-ai.ts`
- `libs/component/src/lib/angular-host.ts` (`GenDeps_CraftAngularDirectiveHost`)
- `libs/component/src/lib/render/style-registry.ts` si ce n’est qu’un `GetDeps` pour un alias

Specs qui fabriquent un `type GenDeps_* = GetDeps<{...}>` comme stand-in : les réécrire avec un vrai `craftComponent` / `ComponentDepsOf`, pas un alias nommé `GenDeps_*`.

Fichiers typiques : `route-checked-di.ts` (JSDoc + exemples), `route-checked-di.spec.ts`, `app-checked-di.spec.ts`, `craft-routes.spec.ts`, `setup-craft-service-testing-by-register.spec.ts`, `branded-component.spec.ts`, `parallel-form-dom-bindings.spec.ts`.

Dans `route-checked-di.ts`, supprimer toute phrase du genre « decorated Angular components can still pass their legacy generated `GenDeps_*` alias ».

## À supprimer (docs et skills)

Toute occurrence de `GenDeps_`, `brand-angular-gen-deps-required`, `brand-angular-deps-match`, `component-test-gen-deps-match`, `craft:brand` présenté comme générateur de `GenDeps_*`.

Priorité :

- `apps/docs/guide/routing/**` (`setup.md`, `eslint-rules.md`, `pending-ui.md`, `exception-handling.md`, `guards.md`, `route-providers.md`, `scaling.md`, `route-load-errors.md`, `global-error-component.md`, `angular-brand-config.md`, `automation.md`)
- `apps/docs/tests/browser-boundaries-docs.spec.ts` (les assertions de snippets)
- `apps/docs/guide/testing/components.md`, `services.md`
- `apps/docs/learn/09-routing.md`
- `libs/dev-tools/README.md`
- `.cursor/skills/craft-ts-routes/` (`SKILL.md` + `references/di-checks.md`, `eslint-workflow.md`, `pending-and-exceptions.md`)
- `.agents/skills/craft-ts-service-migration/SKILL.md`
- `.agents/skills/migrate-to-craft-ts/SKILL.md`
- `.github/copilot-instructions.md`
- `articles/03-the-di-patterns-you-stopped-using.md` seulement si ça présente `GenDeps_*` comme API courante

Exemples de routes dans la doc : même forme que `apps/demo/src/app/app.routes.ts` et `lazy-layout.routes.ts` (`loadCraftComponent` + `ComponentDepsOf<(typeof import('./x'))['default']>` dans le `RouteCheckedDI` si besoin). **Interdit** : `componentDeps: {} as import('./x').GenDeps_X`.

## Invariants

- `ValidateCascadeRoutesFile`, `RouteCheckedDI`, `CanRun`, `assertExhaustiveRouteExceptions` restent. On enlève l’alias figé, pas le filet de types.
- `loadCraftComponent` continue de propager `ComponentDepsOf<Component>` sur le fragment. Ne casse pas ce carrier.
- Ne réintroduis pas un alias `GenDeps_*` « pour Angular ».
- Ne touche pas au graphe d’architecture (`architecture-graph`, `assertCraftUnique`, etc.) sauf si un commentaire / fixture mentionne `GenDeps_*`.

## Méthode

1. Inventaire : `rg 'GenDeps_' --glob '!docs/prompts/remove-gendeeps.md'` jusqu’à zéro hit (hors ce prompt).
2. Inventaire règles : `rg 'brand-angular-gen-deps-required|brand-angular-deps-match|component-test-gen-deps-match'`.
3. Remplacer fichier par fichier, en t’alignant sur la démo, pas sur l’ancienne skill routes.
4. Compiler / tester les projets touchés (`core`, `component`, `dev-tools`, `demo`, tests de snippets docs).
5. Relancer les deux `rg` : zéro occurrence hors ce fichier de prompt.

## Definition of done

- Aucun `export type GenDeps_`.
- Aucune règle ESLint dont le job est de créer ou rafraîchir `GenDeps_*`.
- Docs, skills et copilot-instructions enseignent `ComponentDepsOf` / `loadCraftComponent` uniquement.
- Un `CanRun<RouteCheckedDI<ComponentDepsOf<typeof X>, …>>` casse si `X` change ses deps — plus si un alias oublié n’a pas été régénéré.
