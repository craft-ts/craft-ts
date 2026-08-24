# Accessibilité forcée dans CraftTS

Cible : WCAG 2.2 AA. Couches : types hyperscript, ESLint `craft-ts/a11y`,
runtime des blocs, primitives `dialog` / `liveRegion` / outline de titres,
skip-link, titres de route, focus après navigation, tests.

Toute SFC `loadComponent` appelle `heading()`. Layout : `headingSection` autour
de l’outlet. Shell : pas de `heading()` au-dessus de l’outlet.
