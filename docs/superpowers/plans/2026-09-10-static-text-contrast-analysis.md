# Analyse statique du contraste texte/fond — plan d’implémentation

## Objectif

Garantir, sans ouvrir de navigateur, que les couples couleur de texte/fond
déclarés et réellement atteignables dans une application CraftTS respectent
WCAG 2.2 niveau AA, y compris dans les thèmes, variants et états `hover`.

L’analyse doit :

- calculer un seuil de `4.5:1` pour le texte normal et de `3:1` pour le grand
  texte ;
- partir du système de styles typé et du graphe CraftTS, pas d’un parseur CSS
  généraliste ;
- énumérer les états finis connus de CraftTS (`scheme`, `tone`, `size`,
  `hover`, etc.) ;
- résoudre `color`, `background-color`, les variables CSS et l’héritage ;
- produire un échec explicite lorsqu’une combinaison viole le seuil ;
- produire un diagnostic `indeterminate` lorsqu’une preuve statique est
  impossible, sans transformer ce manque d’information en succès ;
- être intégré par défaut aux nouvelles applications créées avec
  `craft create` lorsque les styles typés sont activés.

## Architecture

```text
*.style.ts
  ├── palettes, variables, classes, conditions
  └── nouvel axe interaction.hover
                 │
                 ▼
       .craft/style-graph.json
                 │
                 ├──────────────┐
                 ▼              ▼
    graphe des templates    matrice informative
    élément par élément     des tokens de couleur
                 │
                 ▼
       résolution statique des styles
       par élément et par scénario
                 │
                 ▼
       ratio + seuil petit/grand texte
                 │
          ┌──────┴─────────┐
          ▼                ▼
       violation      indeterminate
          └──────┬─────────┘
                 ▼
          npm run style:check
```

Le navigateur et Playwright ne font pas partie du chemin principal. Une future
comparaison avec un rendu réel pourra servir de test de fidélité du solveur,
mais ne doit pas être nécessaire pour exécuter la règle dans les projets
consommateurs.

## Cible normative

- Référence : WCAG 2.2, critère 1.4.3, niveau AA.
- Texte normal : ratio minimal `4.5:1`.
- Grand texte : ratio minimal `3:1`.
- Convention initiale pour les polices latines :
  - grand si `font-size >= 24px` ;
  - ou grand si `font-size >= 18.5px` et graisse assimilée à `bold`.
- Ne jamais arrondir le ratio avant de le comparer au seuil.
- Les textes décoratifs, logotypes et composants inactifs ne sont pas exclus
  automatiquement en v1 : une exception doit être explicite et justifiée.

## Périmètre v1

### Couvert

- couleurs opaques exprimées en hexadécimal ou `rgb()` ;
- `color` hérité ;
- `background-color` local ou visible à travers des ancêtres transparents ;
- variables CSS CraftTS déclarées avec `cssVars()` ;
- écritures statiques avec `set()` ;
- valeurs initiales et fallbacks `var(...)` produits par CraftTS ;
- classes constantes issues de `craftStyles()` ;
- thèmes clair/sombre ;
- axes d’état et de taille finis ;
- état `hover` déclaré avec l’axe CraftTS dédié ;
- texte statique ou dynamique lorsqu’il est possible de prouver que l’élément
  peut contenir du texte ;
- composition entre éléments d’un même composant et entre composants dont le
  graphe connaît le contexte de rendu.

### Non couvert en v1

- images et gradients derrière le texte ;
- canvas, SVG contenant du texte et pseudo-éléments générant du contenu ;
- `filter`, `backdrop-filter`, `mix-blend-mode` ;
- expressions CSS libres non comprises par le DSL ;
- couleurs calculées depuis une donnée runtime non finie ;
- feuilles de style externes et styles inline hors CraftTS ;
- calcul exhaustif des polices CJK ou des métriques particulières d’une fonte.

Chaque cas non couvert doit produire `indeterminate` avec sa provenance. Aucun
cas inconnu ne doit être omis silencieusement.

## Principes de conception

1. **Le graphe trouve les couples réellement atteignables.** La matrice globale
   de palette reste informative et ne bloque pas une combinaison jamais
   utilisée.
2. **La preuve est attachée à un élément, un contexte et un scénario.** Une
   erreur globale du type « bleu sur gris » n’est pas suffisamment actionnable.
3. **CraftTS reste un monde fermé.** Une propriété visuelle qui échappe au DSL
   ferme la preuve et crée un diagnostic.
4. **Pas de moteur CSS généraliste.** Le solveur n’implémente que la grammaire
   émise par CraftTS.
5. **Le hover est une condition du graphe.** Il n’est pas simulé par une souris.
6. **Les héritages sont contextuels.** Un composant réutilisé sur deux surfaces
   doit être évalué deux fois si son texte hérite de son contexte.
7. **Un résultat inconnu est visible.** La CI distingue violations et trous de
   couverture.

## Modèle de résultat

```ts
export type ContrastScenario = Readonly<{
  id: string;
  axes: Readonly<Record<string, string>>;
}>;

export type ResolvedTextContrast = Readonly<{
  kind: 'resolved';
  route?: string;
  component: string;
  element: string;
  scenario: ContrastScenario;
  foreground: { value: string; source: string };
  background: { value: string; source: string };
  fontSizePx: number;
  fontWeight: number;
  textScale: 'normal' | 'large';
  ratio: number;
  required: 3 | 4.5;
  verdict: 'pass' | 'fail';
}>;

export type IndeterminateTextContrast = Readonly<{
  kind: 'indeterminate';
  route?: string;
  component: string;
  element: string;
  scenario: ContrastScenario;
  reason:
    | 'unknown-foreground'
    | 'unknown-background'
    | 'unknown-font-size'
    | 'unsupported-background'
    | 'dynamic-style'
    | 'external-style'
    | 'incomplete-render-context';
  detail: string;
}>;

export type TextContrastResult =
  | ResolvedTextContrast
  | IndeterminateTextContrast;
```

Exemple de diagnostic humain :

```text
contrast/fail
route: /checkout
component: SubmitButton
element: button.root
scenario: scheme=dark + tone=warning + interaction.hover=active
foreground: theme.onAccent -> #0b0d11
background: button.bg -> #735000
font: 14px / 600 (normal text)
ratio: 3.91:1
required: 4.5:1
```

## Carte des fichiers

| Fichier | Responsabilité |
|---|---|
| `libs/style/src/lib/contrast.ts` (nouveau) | Parsing couleur, luminance, ratio, classification normal/grand texte |
| `libs/style/src/lib/contrast.spec.ts` (nouveau) | Tests numériques et seuils WCAG |
| `libs/style/src/lib/axes/types.ts` | Nouveau driver/état statique `hover` |
| `libs/style/src/lib/axes/standard.ts` | Export de `interaction.hover` |
| `libs/style/src/lib/axes/axes.spec.ts` | Contrat de l’axe hover |
| `libs/style/src/lib/tokens/palette.ts` | Provenance stable des tokens nommés |
| `libs/style/src/plugin/emit.ts` | Sérialisation de la provenance utile au rapport |
| `libs/dev-tools/src/scripts/dependency-graph.ts` | Nœuds d’éléments stylables et hiérarchie de rendu |
| `libs/dev-tools/src/scripts/style-graph.ts` | Arêtes élément → classe et données de style nécessaires |
| `libs/dev-tools/src/scripts/style-contrast.ts` (nouveau) | Résolution statique et calcul des résultats |
| `libs/dev-tools/src/scripts/style-contrast.spec.ts` (nouveau) | Tests du solveur sur graphes minimaux |
| `libs/dev-tools/src/scripts/style-report.ts` | Projection matrice de palette et rapport de contraste |
| `libs/dev-tools/src/bin/craft-graph.ts` | Commande de rapport/validation |
| `libs/dev-tools/src/eslint-rules/*` | Signalement des pseudo-états et couleurs échappant au modèle |
| `libs/dev-tools/src/scripts/create/create-project.ts` | Starter, script `style:check`, CI et documentation générée |
| `apps/demo/src/app/examples/design-system/*` | Première preuve sur un design system réel |
| `apps/docs/guide/style/*` | Documentation utilisateur |

---

## Task 1 — Extraire un noyau de calcul WCAG pur

**Fichiers :**

- créer `libs/style/src/lib/contrast.ts` ;
- créer `libs/style/src/lib/contrast.spec.ts` ;
- modifier `libs/style/src/index.ts` ;
- modifier `libs/style-testing/src/lib/assertions.ts` pour réutiliser ce noyau.

- [ ] Déplacer ou réimplémenter dans `@craft-ts/style` les fonctions pures de
  parsing, luminance relative et ratio de contraste.
- [ ] Supporter `#rgb`, `#rrggbb`, `rgb()` et `rgba()` opaque.
- [ ] Retourner un résultat explicite pour une couleur non supportée ou
  semi-transparente au lieu de produire un ratio trompeur.
- [ ] Ajouter `textContrastRequirement({ fontSizePx, fontWeight })`.
- [ ] Utiliser `3` pour le grand texte et `4.5` pour le texte normal.
- [ ] Comparer les valeurs non arrondies.
- [ ] Garder `@craft-ts/style-testing` compatible en important le calcul commun
  au lieu de conserver deux implémentations.

**Tests requis :**

- noir/blanc donne `21:1` ;
- `4.499:1` échoue pour un seuil `4.5` ;
- `24px / 400` utilise `3:1` ;
- `18.5px / 700` utilise `3:1` ;
- `18.5px / 600` utilise `4.5:1` ;
- une couleur avec alpha produit un résultat non résolu en v1.

**Commande :**

```bash
npx nx test style --testPathPattern=contrast.spec
npx nx test style-testing --testPathPattern=assertions.spec
```

## Task 2 — Représenter `hover` dans le langage CraftTS

**Fichiers :**

- modifier `libs/style/src/lib/axes/types.ts` ;
- modifier `libs/style/src/lib/axes/standard.ts` ;
- modifier `libs/style/src/lib/axes/axes.spec.ts` ;
- modifier `libs/style-testing/src/lib/drivers.ts` seulement pour préserver le
  contrat général « tout axe possède un driver atteignable ».

- [ ] Ajouter `interaction.hover` avec la condition CSS `&:hover`.
- [ ] Donner au point un driver descriptif stable, par exemple
  `{ kind: 'selfState', state: 'hover' }`.
- [ ] Faire apparaître `interaction.hover` dans `STANDARD_AXES`.
- [ ] Vérifier que `craftStyles()` et `styleDump()` conservent la condition
  `interaction.hover:active`.
- [ ] Vérifier que `visualMatrix()` ajoute `base` et `hover` seulement aux
  classes qui utilisent réellement cet axe.
- [ ] Ajouter l’adaptateur Playwright correspondant dans `applyScenario()` pour
  ne pas casser l’invariant du système visuel, tout en gardant cet adaptateur
  hors du solveur statique.

**Critère d’acceptation :**

```ts
when(interaction.hover, [
  set(buttonVars.bg, ui.accent.warningHover),
]);
```

doit produire une règle `:hover`, un point de matrice et une condition lisible
par le graphe.

## Task 3 — Conserver la provenance des couleurs du design system

Le calcul peut fonctionner avec les valeurs CSS seules, mais les diagnostics
doivent pouvoir nommer `ui.text.onAccent` plutôt que seulement `#ffffff`.

**Fichiers :**

- modifier `libs/style/src/lib/tokens/units.ts` ;
- modifier `libs/style/src/lib/tokens/palette.ts` ;
- modifier `libs/style/src/lib/tokens/tokens.spec.ts` ;
- modifier `libs/style/src/plugin/emit.ts` ;
- modifier `libs/dev-tools/src/scripts/style-graph.ts`.

- [ ] Ajouter une provenance optionnelle aux `ColorValue`.
- [ ] Ajouter un overload rétrocompatible permettant de nommer une palette :

```ts
definePalette('ui', {
  text: { onAccent: { light: '#fff', dark: '#0b0d11' } },
  // ...
});
```

- [ ] Conserver `definePalette(spec)` pour les consommateurs existants, mais
  produire un nom de provenance moins précis ou un diagnostic de couverture.
- [ ] Enregistrer `palette`, `group`, `token`, `role`, `light` et `dark` dans le
  dump de styles.
- [ ] Faire évoluer le format du dump de manière rétrocompatible ou le
  versionner explicitement.
- [ ] Mettre à jour le design system généré et celui de la démo pour utiliser
  une palette nommée.

## Task 4 — Étendre le graphe au niveau de l’élément stylable

Le graphe actuel relie principalement un composant à l’ensemble de ses classes.
La preuve de contraste exige une relation élément par élément.

**Fichiers :**

- modifier `libs/dev-tools/src/scripts/dependency-graph.ts` ;
- modifier ses tests ciblés ;
- modifier `libs/dev-tools/src/scripts/style-graph.ts` et ses tests.

- [ ] Ajouter un nœud dédié pour chaque appel hyperscript stylable, sans changer
  l’identité des `template-element` interactifs existants.
- [ ] Conserver le tag, la position source et une identité stable.
- [ ] Ajouter `mayContainText` lorsque l’élément reçoit du texte statique,
  dynamique ou des enfants susceptibles de produire du texte.
- [ ] Extraire la classe constante depuis les props `class`.
- [ ] Résoudre `button.root` vers la clé enregistrée `dsButton-root` en suivant
  la déclaration `craftStyles('dsButton', ...)`.
- [ ] Ajouter une arête `styled-by` entre l’élément précis et chaque classe.
- [ ] Ajouter les arêtes parent/enfant à l’intérieur du template.
- [ ] Relier les composants enfants à leur emplacement de rendu afin qu’un
  composant hérité puisse être évalué dans chaque contexte parent.
- [ ] Représenter séparément les branches conditionnelles et conserver leur
  exclusivité lorsque celle-ci est prouvable.
- [ ] Produire un diagnostic pour les tableaux, factories ou appels dynamiques
  dont la structure ne peut pas être résolue.

**Critère d’acceptation :**

Pour `card.body`, le graphe doit pouvoir prouver que le texte reçoit
`theme.inkMuted` et que le fond visible vient de l’ancêtre `card.root` utilisant
`theme.raised`.

## Task 5 — Implémenter le solveur de styles statique

**Fichiers :**

- créer `libs/dev-tools/src/scripts/style-contrast.ts` ;
- créer `libs/dev-tools/src/scripts/style-contrast.spec.ts` ;
- exporter l’API depuis `libs/dev-tools/src/index.ts`.

- [ ] Partir d’un élément texte et de son contexte de rendu.
- [ ] Construire seulement les scénarios des axes qui peuvent modifier :
  `color`, `background-color`, `font-size`, `font-weight`, `opacity` ou une
  variable lue par ces propriétés.
- [ ] Résoudre les atomes applicables pour chaque scénario.
- [ ] Appliquer l’ordre déterministe émis par CraftTS.
- [ ] Résoudre les variables, leurs valeurs initiales, leurs écritures
  conditionnelles et leurs fallbacks.
- [ ] Hériter `color`, `font-size` et `font-weight` depuis les ancêtres.
- [ ] Pour le fond, prendre le fond local opaque ou remonter jusqu’au premier
  ancêtre peint.
- [ ] Évaluer chaque contexte de rendu d’un composant réutilisé.
- [ ] Classer le texte en `normal` ou `large`.
- [ ] Calculer le ratio et produire `pass` ou `fail`.
- [ ] Produire `indeterminate` pour toute étape non prouvable.
- [ ] Dédupliquer les résultats identiques sans perdre la liste des scénarios
  qu’ils représentent.

**Cas de tests minimaux :**

- couleur et fond sur le même élément ;
- couleur héritée et fond sur le parent ;
- deux niveaux de fond transparent ;
- thème clair passant et thème sombre échouant ;
- bouton passant au repos et échouant au hover ;
- même couleur avec petit texte en échec et grand texte en succès ;
- variable locale écrasant une variable de thème ;
- composant utilisé sur deux surfaces différentes ;
- gradient et couleur dynamique produisant `indeterminate` ;
- branche absente non croisée avec les styles qu’elle ne rend pas.

## Task 6 — Ajouter la matrice informative de palette

**Fichiers :**

- modifier `libs/dev-tools/src/scripts/style-report.ts` ;
- modifier `libs/dev-tools/src/scripts/style-report.spec.ts`.

- [ ] Ajouter `paletteContrastMatrix()`.
- [ ] Permettre de sélectionner les rôles de foreground et background.
- [ ] Produire les ratios light/dark pour chaque couple.
- [ ] Présenter séparément les résultats aux seuils `3` et `4.5`.
- [ ] Ne pas utiliser cette matrice comme règle bloquante par défaut.
- [ ] Relier, lorsque possible, chaque couple à ses usages réels dans le graphe.

Exemple :

```json
{
  "foreground": "ui.text.onAccent",
  "background": "ui.accent.warning",
  "light": { "ratio": 3.82, "normalText": "fail", "largeText": "pass" },
  "dark": { "ratio": 8.14, "normalText": "pass", "largeText": "pass" },
  "usedBy": ["dsButton-root"]
}
```

## Task 7 — Exposer la validation dans la CLI

**Fichiers :**

- modifier `libs/dev-tools/src/bin/craft-graph.ts` ;
- ajouter ou modifier les tests CLI associés ;
- modifier le `styleCheckScript` généré dans
  `libs/dev-tools/src/scripts/create/create-project.ts`.

- [ ] Ajouter une commande de rapport, par exemple :

```bash
npx craft-graph --style-contrast --style-dump .craft/style-graph.json
```

- [ ] Construire le graphe TypeScript puis fusionner le dump de styles pour
  cette commande ; contrairement à `--style-matrix`, le contraste a besoin des
  contextes de templates.
- [ ] Afficher un résumé puis les violations et les résultats indéterminés.
- [ ] Sortir avec un code non nul lorsqu’une violation existe.
- [ ] Définir une politique explicite pour `indeterminate` : erreur par défaut
  en mode strict, avertissement seulement avec une option nommée.
- [ ] Ajouter un format JSON stable pour la CI et les outils futurs.
- [ ] Remplacer le `style:check` actuel, qui vérifie seulement la présence de
  `vite.config.ts`, par une véritable génération du dump suivie de l’analyse.

## Task 8 — Ajouter les garde-fous ESLint

**Fichiers :**

- ajouter les règles et tests dans `libs/dev-tools/src/eslint-rules` ;
- activer les règles pertinentes dans le preset de styles généré.

- [ ] Signaler `:hover` écrit librement dans un fichier `*.style.ts` et proposer
  `interaction.hover`.
- [ ] Signaler `color`, `background-color`, `font-size` et `font-weight` qui
  échappent au DSL dans une surface déclarée comme couverte.
- [ ] Réutiliser les diagnostics `unproven` existants pour les escape hatches.
- [ ] Ne pas prétendre couvrir les styles globaux ou externes : permettre de
  déclarer explicitement les surfaces non couvertes.

## Task 9 — Prouver le fonctionnement sur le design system de la démo

**Fichiers :**

- modifier `apps/demo/src/app/examples/design-system/foundation.style.ts` ;
- modifier `apps/demo/src/app/examples/design-system/components.style.ts` ;
- modifier ou ajouter les specs `design-system.*.spec.ts`.

- [ ] Nommer la palette `ui`.
- [ ] Ajouter des couleurs de hover dédiées au design system.
- [ ] Migrer le bouton vers `interaction.hover`.
- [ ] Vérifier les boutons pour chaque ton, taille, thème et état hover.
- [ ] Introduire dans un test une couleur hover insuffisante et vérifier que le
  rapport nomme exactement la combinaison fautive.
- [ ] Vérifier qu’un texte de grande taille utilise `3:1` tandis qu’un texte
  normal utilise `4.5:1`.
- [ ] Vérifier au moins un héritage de fond depuis un parent.
- [ ] Vérifier qu’un fond complexe n’est jamais annoncé comme valide.

## Task 10 — Intégrer la garantie aux projets générés

**Fichiers :**

- modifier `libs/dev-tools/src/scripts/create/create-project.ts` ;
- modifier les tests de génération ;
- modifier `apps/docs/guide/create-project.md` et les guides de style.

- [ ] Générer une palette nommée.
- [ ] Générer au moins un composant avec un hover typé.
- [ ] Faire exécuter la validation par `npm run style:check`.
- [ ] Garder cette étape conditionnée à `typedCss: true`.
- [ ] Ajouter `npm run style:check` à la CI générée.
- [ ] Tester au minimum les configurations standalone/Nx et plain/Effect avec
  styles typés.
- [ ] Documenter comment corriger une violation et comment traiter un
  `indeterminate`.
- [ ] Prévoir une commande de migration ou une section de migration pour les
  projets CraftTS existants.

## Task 11 — Documentation et contrat de couverture

- [ ] Documenter la différence entre matrice de palette et usages bloquants.
- [ ] Documenter l’héritage de `color` et la recherche du fond visible.
- [ ] Documenter les seuils petit/grand texte.
- [ ] Documenter la modélisation de `hover`.
- [ ] Lister précisément les fonctionnalités CSS non supportées en v1.
- [ ] Expliquer qu’un rapport sans violation mais avec `indeterminate` n’est pas
  une preuve complète.
- [ ] Ne pas présenter l’outil comme une certification globale d’accessibilité :
  il prouve uniquement le contraste texte/fond dans le sous-ensemble déclaré.

## Vérification finale

```bash
npx nx test style
npx nx test style-testing
npx nx test dev-tools
npm run lint
npm run typecheck
npm run architecture
npm run style:check
```

Vérifications supplémentaires :

- [ ] Deux exécutions sans changement produisent le même rapport JSON.
- [ ] L’ordre des fichiers et des déclarations indépendantes ne change pas les
  identifiants des résultats.
- [ ] Une violation volontaire fait échouer `style:check`.
- [ ] Un gradient volontaire produit `indeterminate`, jamais `pass`.
- [ ] Un hover invalide est détecté sans lancer de navigateur.
- [ ] Le rapport indique la source de la couleur, la source du fond et le
  contexte de rendu.
- [ ] Un starter fraîchement créé passe la règle sans configuration manuelle.

## Définition de terminé

Le premier incrément est terminé lorsqu’une application CraftTS utilisant les
styles typés peut exécuter une seule commande et obtenir, sans navigateur :

1. la liste des couples de couleurs de sa palette ;
2. la liste des couples réellement utilisés par ses textes ;
3. un verdict par thème, variant, taille et hover ;
4. un seuil correct selon la taille du texte ;
5. une erreur actionnable pour chaque violation ;
6. une liste exhaustive des situations que le graphe n’a pas pu prouver.
