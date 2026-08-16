# Typed style system — journal d'exécution

Branche : `feat/typed-style-system`. Le plan complet (32 tâches, 5 vagues + vague 5
conditionnelle) reste le document de référence ; ce fichier ne consigne que ce que le
plan demande d'y écrire — les mesures, les décisions, et les écarts constatés entre le
plan et le dépôt réel.

## État

| Vague | Tâches | État |
|---|---|---|
| 0 — mécanisme de canaux | 1, 2 | faites |
| 0 — mesure et point de décision | 3 (steps 1 et 5), 3b | mesure faite, **3b non déclenchée** |
| 0 — migration `CssVars` | 3 (steps 2–4) | non commencée |
| 1 à 5 | 4 → 32 | non commencées |

## Écarts entre la file map du plan et le dépôt

À corriger dans le plan avant d'attaquer les vagues suivantes — plusieurs chemins
n'existent pas tels quels :

- `libs/core/src/lib/render/vnode.ts` → le vnode vit dans **`libs/component`**
  (`libs/component/src/lib/render/vnode.ts`). `channels.ts` a bien été créé dans
  `libs/core/src/lib/render/` comme prévu : l'algèbre est dans le core, le câblage
  dans component.
- `libs/component/src/lib/css-vars.type.ts` existe bien (tâche 3).
- `libs/component/src/lib/if-block.ts` et `match-block.ts` existent (tâche 16).
- `packages/mcp/src/mcp-server.ts` (tâche 29) : à vérifier, `packages/mcp` existe.

## Mesures

Outil : `tools/measure-typecheck.mjs`. Médiane sur N runs de
`tsc -p <project> --noEmit --extendedDiagnostics`. Baseline stockée dans
`tools/.typecheck-baseline.json`.

```sh
node tools/measure-typecheck.mjs --runs 5 --compare
```

### Tâche 3, step 1 — baseline `apps/demo/tsconfig.app.json`

| | ms | instantiations | types | mémoire |
|---|---|---|---|---|
| baseline (3 runs) | 8014 | 5 503 264 | 503 416 | 1 128 381 Ko |
| baseline revérifiée, dist reconstruit (3 runs) | 7955 | 5 503 311 | 503 435 | 1 128 667 Ko |

La deuxième ligne écarte un faux positif : `apps/demo` typecheck via des *project
references*, donc son coût dépend de la fraîcheur de `dist/out-tsc`. Les deux mesures
coïncident — la fraîcheur du dist n'était pas le facteur.

### Tâche 3, step 5 — après le branchement des canaux (tâches 1 + 2)

| | ms | instantiations |
|---|---|---|
| après (5 runs) | 8506 | 5 668 482 |
| **delta** | **+6,9 %** | **+3,0 %** |

Seuil du plan : +15 % sur l'une des deux métriques.

> **Décision : la tâche 3b n'est PAS déclenchée.** Les canaux restent dans la passe
> applicative, les erreurs d'obligation seront visibles dans l'éditeur, et le coût DX
> documenté en 3b (niveau 3 invisible dans le programme applicatif) est évité.

Piège de mesure à retenir : une médiane sur 3 runs a d'abord donné +27 % sur `ms`,
contre +6,9 % sur 5 runs, pour un delta d'instantiations inchangé à +3 %. Le temps mur
est trop bruité à cette échelle pour arbitrer seul ; **c'est le compte d'instantiations
qui décide**, le temps ne sert que de garde-fou grossier.

## Tâche 1 — canaux opaques dans le core

`libs/core/src/lib/render/channels.ts`, spec colocalisée, 9 assertions de types.

Écarts assumés par rapport aux « Shared types » du plan :

- `MergeChannelList` (fold sur un tuple) a été remplacé par **`MergeChannelUnion`** (merge
  sur une union). Les enfants arrivent dans l'arbre sous forme d'union, pas de tuple, et
  les deux formes sont prouvées équivalentes par une spec dédiée. Une seule façon
  d'écrire chaque chose.
- Ajout de `CraftChannelsCarrier`, `ChannelsOf`, `UndischargedObligations`, et de
  `CRAFT_CHANNELS` (exporté : le `keyof` guard en a besoin, voir plus bas).

Falsifiabilité vérifiée : `Exclude` remplacé par une union simple dans `MergeChannels`
⇒ 3 assertions rouges. Remis.

## Tâche 2 — branchement sur le vnode

Points de propagation couverts : `h()`, les deux branches d'`ifBlock`, `each`
(item + empty), `craftTemplate`/`renderTemplate`, la frontière de composant. Plus les
nœuds pipés (catch, pending, field-exception, directive) — une frontière d'exception
n'est pas une frontière de style, et un canal qui disparaîtrait là serait exactement
l'échappatoire silencieuse que le plan interdit.

Trois décisions de conception qui n'étaient pas dans le plan :

1. **Un élément ne prend pas de paramètre de canal, il le dérive** de ses props et de
   ses enfants. Un paramètre en queue, même défaillé à `EmptyChannels`, est **imprimé
   dans les déclarations émises** — la première version faisait apparaître
   `import("@craft-ng/core").EmptyChannels` dans chaque `.d.ts` de la lib. En dérivant,
   les 170 `.d.ts` émis par `libs/component` sont **identiques au byte près**, sauf les
   trois fichiers réellement modifiés (`vnode`, `types`, `channels`). C'est le critère
   de non-régression de la tâche 2, step 2 — et il ne passe que sous cette forme.
   Seul `PipedCraftNodeDirective` fait exception : ce chemin efface props et enfants,
   donc le canal y transite par une prop fantôme à `unique symbol`.

2. **L'extraction se garde sur `typeof CRAFT_CHANNELS extends keyof Value`.** Un simple
   `Value extends CraftChannelsCarrier<infer C>` ne suffit pas : la propriété du porteur
   est optionnelle, donc *tout* type passe le test, et pour un type sans site
   d'inférence — un enfant `string` — TypeScript retombe sur la contrainte et renvoie
   `CraftChannels` lui-même, dont `discharges` vaut `unknown`. Un seul
   `Exclude<…, unknown>` en aval efface alors **toutes** les obligations de l'arbre,
   silencieusement, en laissant les tests verts. C'est la panne exacte que le plan
   redoute pour les brands (« un brand mal posé annule tout, sans bruit ») ; elle s'est
   produite ici, sur le porteur. Le garde `keyof` est celui que le porteur de deps
   utilise déjà.

3. **Le canal d'un composant se calcule depuis `Template`, jamais depuis
   `CraftComponent`.** La signature d'appel de `CraftComponent` reconstruit le type
   complet du composant pour le passer à `ComponentCallNode` ; dériver le canal depuis
   ce type-là re-dérive le composant entier à chaque site d'appel, et comme les enfants
   d'un template sont eux-mêmes des nœuds de composant, ça imbrique jusqu'au TS2589
   (rencontré, puis corrigé). Lire `Template` une fois — et laisser chaque nœud enfant
   rendre le canal qu'il porte déjà — garde le travail plat. C'est la même raison qui
   fait que `ComponentCssVars` est écrit ainsi. **À rejouer tel quel en vague 3** pour
   `seals` : toute dérivation partant de `CraftComponent` rejouera le TS2589.

Falsifiabilité vérifiée : source `props` retirée d'`ElementNodeChannels` ⇒ 9 assertions
rouges. Remis.

Vérifications : `npx tsc -b libs/component/tsconfig.lib.json` ✓,
`npx tsc -p apps/demo/tsconfig.app.json --noEmit` ✓, suite component 202/202 ✓.
`npx nx build demo` échoue sur `dev-tools:build` — **préexistant**, vérifié sur l'arbre
propre avant modification.

## Tâche 3 — reste à faire, et ce qu'on sait déjà

La migration de `CssVarContract` sur le canal générique n'est pas commencée. Une
lecture du code existant donne déjà la contrainte principale, à intégrer avant de
commencer :

`CraftNodeChildrenCssVars` (le merge entre frères) fait aujourd'hui une **union
champ par champ, sans annulation** : un frère qui déclare `--x` n'annule pas le
`required: '--x'` d'un autre frère. L'annulation vit ailleurs, dans
`MergeCssVarContracts`, qui est asymétrique (`declared: Left['declared']`,
`inherited: Right['inherited']`) et sert à composer *meta ⊗ template*, pas frère ⊗ frère.

Conséquence : une migration fidèle ne peut pas poser `required` sur `obligations` et
`declared` sur `discharges` — ça introduirait une annulation entre frères qui n'existe
pas et changerait le comportement. Les six champs passent sur **`accumulate`** (union
pure), et `MergeCssVarContracts` reste tel quel. C'est un résultat honnête pour la
tâche 3 : css-vars n'exerce qu'un des deux canaux, ce qui valide le transport et la
reconstruction d'une vue typée, pas la sémantique de décharge — laquelle ne sera
réellement exercée qu'en vague 3.
