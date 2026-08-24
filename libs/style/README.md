# `@craft-ts/style` — esquisse

Assez de code pour voir la tête que ça a, et pour que les problèmes d'API sortent
maintenant plutôt qu'à la vague 3. **Ce n'est pas le package**, c'est un exemple qui
compile.

```sh
npx tsc -p libs/style/tsconfig.spec.json --noEmit
npx vitest run --config libs/style/vitest.config.mts
```

## Ce que ça donne

```ts
// badge.style.ts — un *.style.ts n'importe QUE du vocabulaire, jamais du code
// applicatif : c'est ce qui permettra au plugin de l'évaluer en Node.

export const v = cssVars('badge', {
  ink: kind.color(palette.text.strong),
  bg: kind.color(palette.surface.raised),
});

export const badge = craftStyles('badge', {
  root: [
    display.inlineFlex, align.center, gap(space(2)),
    px(space(3)), py(space(1)),
    radius(radii.full), font(text.sm),
    bg(v.bg), color(v.ink),

    when(bp.md, [px(space(4)), font(text.base)]),
    when(scheme.dark, [
      color(palette.text.muted),
      when(bp.md, [fontWeight.bold]),   // conjonction = imbrication, point final
    ]),
    when(tone.danger, [bg(palette.accent.danger)]),
  ],
  dot: [display.block, radius(radii.full), bg(v.ink)],
});
```

```ts
// back-to-top.style.ts — le cas qui a motivé le dispositif
export const backToTop = craftStyles('backToTop', {
  button: [requires(scrollPort.block), position.sticky, /* … */],
});

export const shell = craftStyles('appShell', {
  main: [provides(scrollPort.block), display.block],
});
```

## Les quatre choses que l'exemple prouve

**Aucune valeur n'est une chaîne.** `p('12px')`, `` p(`${4}px`) ``, `bg('red')`,
`p(space(5))`, `p(palette.text.strong)` — cinq erreurs de compilation. Les valeurs sont
des **objets nominaux** à `unique symbol`, pas des `string & { __length?: true }` : avec
un phantom optionnel sur une base primitive, `'blabla'` reste assignable et toute la
garantie tombe en silence.

**Sortir de l'échelle est possible et laisse une trace.** `unsafeLength('13px', 'raison')`
compile et propage `unproven` jusqu'au registre. Sans cette porte, un agent bloqué
contourne le design system entièrement ; avec elle non marquée, il le contourne en
silence.

**Le contrat de variantes est inféré, et ne retient que ce qui sert.** `bp` définit `sm`
et `md` ; `badge.root` n'utilise que `md`, donc `VariantsOf<typeof badge.root>['viewport']`
vaut `'md'`, pas `'sm' | 'md'`. La matrice compte 12 scénarios pour `badge-root`
(2 schemes × 3 tones × 2 viewports, `base` compris) et **1** pour `badge-dot`. Chaque
point porte son driver — un axe sans driver produirait des captures identiques, donc une
fausse couverture.

**L'obligation remonte l'arbre et s'annule au bon nœud.** `div([span({ class: backToTop.button })])`
porte `obligations: Obligation<'scrollPort.block'>` ; ajouter `class: shell.main` sur un
ancêtre la ramène à `never`. Ça marche sur les canaux réellement commités
(`libs/core/src/lib/render/channels.ts`), pas sur une maquette.

Vérifié : retirer `provides(scrollPort.block)` de `shell.main` fait échouer
`npx tsc -p libs/style/tsconfig.spec.json` — avant tout lancement de l'app.

## Le message d'erreur, en vrai

```
Property '"'scrollPort.block' est exigee par une classe de ce sous-arbre et
personne ne la fournit. Ajoutez provides(scrollPort.block) sur le composant de
layout qui possede la zone concernee — pas sur le parent direct, ou l'effet CSS
creerait un second contexte et deplacerait le bug au lieu de le corriger."'
is missing in type 'ElementNode<…>'
```

Le texte est complet et suffit à corriger sans autre contexte. En revanche tsc imprime
le type de nœud entier avant et après — le message arrive en ligne 2 d'une erreur de
douze lignes. C'est une limite de la forme « intersection sur le paramètre », pas du
message ; mettre le message en **clé** plutôt qu'en valeur le fait au moins sortir avant
le reste.

## Ce qui n'est pas là

- La table de propriétés est écrite à la main (une douzaine de helpers). La vraie est
  **générée** depuis MDN/webref — c'est la seule façon de garantir qu'aucun mot-clé n'a
  été inventé. `overflow` en est exclu par construction, ici comme là-bas : l'unique
  chemin vers `overflow: auto` est `provides(scrollPort.*)`.
- Pas de plugin d'émission. Le registre (`registeredClasses()`) tient les règles à la
  place des classes, qui sont des chaînes ; c'est lui que lirait l'émetteur.
- Pas de drivers Playwright, pas d'assertion d'exhaustivité contre des baselines, pas
  d'intégration au graphe.
- `seal()` est une fonction au lieu de vivre sur `craftComponent(..., { seals })`, pour
  que l'exemple tienne en un fichier.

## Deux collisions d'API trouvées en écrivant ça

1. `px` est à la fois une unité (`px(4)`) et `padding-inline` (`px(space(3))`). Les
   unités sont donc passées sous `unit.px` / `unit.rem`. À trancher dans le plan.
2. `color` est à la fois une propriété et un kind `@property`. Les kinds sont passés
   sous `kind.color` / `kind.length`.

## Un piège de typage rencontré deux fois

Un conditionnel ne distribue que sur un **paramètre nu**. Écrit directement,
`ChannelsOf<Node>['obligations'] extends Obligation<infer Id>` ne distribue pas, et
`never extends Obligation<infer Id>` est **vrai** — `Id` retombe sur sa contrainte et
vaut `string`. Un arbre sans aucune obligation ouverte échouait alors au scellage, avec
un message parlant d'une obligation nommée `string`. Même famille que le garde `keyof`
des porteurs type-only : ces pannes-là laissent tous les tests verts.
