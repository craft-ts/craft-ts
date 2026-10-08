# Herbier — implémenter le thème et les composants de la doc avec craft-ts

Date : 2026-10-07. Public : la personne (ou l'agent) qui reprend `feat/storm-ui`.

Herbier est la direction visuelle retenue pour la doc de craft-ts. Elle remplace
Storm Front dans `libs/storm-ui`. Ce document dit **quoi construire, dans quel
ordre, avec quelles contraintes du système de style**, et liste honnêtement ce
que la maquette montre mais que le vocabulaire actuel ne sait pas écrire.

## 0. En bref

- La maquette est un canvas Design (voir §1). Les valeurs de ce document en sont
  extraites ; en cas de doute, **la maquette fait foi**.
- Les composants `Doc*` déjà écrits (callout, code, prose, pipeline Markdown)
  **ne changent pas d'API** : on remplace la fondation et les feuilles de style.
- Le gros du travail est de **traduire** la maquette dans le vocabulaire de
  `@craft-ts/style` : pas de `color-mix`, pas d'alpha brut, pas de SVG inline.
  Le §4 donne la table de traduction.
- Six lots, chacun livrable seul, chacun avec ses preuves (contraste AA, rendu,
  matrice d'états). Le lot 1 (fondation) débloque tous les autres.

## 1. La maquette (source de vérité visuelle)

Artefact claude.ai, privé : `https://claude.ai/artifact/Ug3bn58w6MSrP3Kt819iFs`.
Il se lit avec l'outil Artifact (`action: "read"`, `path: "project/<fichier>"`),
pas avec un fetch.

| Planche (fichier `project/…`)                       | Contenu                                                   |
| --------------------------------------------------- | --------------------------------------------------------- |
| `P-Herbier.dc.html`, `P2-HerbierNuit.dc.html`       | La page de doc type (navbar, sidebar, code, tableau, callouts, forêt), jour puis nuit |
| `Q-HerbierStates.dc.html`, `Q2-HerbierNuitStates.dc.html` | Tokens et **tous** les états : boutons 5 variantes × 6 états, nav, champs, callouts, badges, toasts, menu, infobulle, dialogue, prose, icônes, **mouvement** (durées, courbe, 8 démonstrations en boucle) |

Comment les lire : ce sont des pages HTML avec une feuille de style dans
`<helmet><style>`. Les classes de cette feuille **sont** la spécification des
états : `.pb .b-p .b-t .b-s .b-d .b-l` (boutons), `.ib` (bouton icône), `.nv .tb`
(navigation), `.fi .ck .rd .sw` (champs), `.co` (callout), `.bd .kb .ic`
(badge, touche, code en ligne), `.ts` (toast), `.mi` (menu). Les états forcés
(`.s-h` survol, `.s-a` appui, `.s-f` focus, `.s-l` chargement) sont là pour les
montrer côte à côte, ce sont les mêmes règles que `:hover`, `:active`,
`:focus-visible`.

Le mode nuit est la classe `fx-night` sur la racine : tous les tokens y sont
redéfinis. Les blocs `.fx{…}` et `.fx.fx-night{…}` listent chaque variable.

Les illustrations (forêt, courbes de niveau, planche botanique) sont du SVG
dessiné par script ; les sources de script sont perdues, **le SVG de l'artefact
est la source** (§5.4).

## 2. Point de départ

Worktree : `../ng-craft.worktrees/storm-ui`, branche `feat/storm-ui`, basée sur
`main` (0c737f6c3). Rien n'y est commité. `node_modules` du worktree est un lien
vers celui du dépôt principal.

Déjà là, testé (59 tests) :

| Zone                         | Fichiers                                                  | Sort avec Herbier |
| ---------------------------- | --------------------------------------------------------- | ----------------- |
| Fondation                    | `foundation/storm.style.ts`, `storm.spec.ts`              | **réécrite** (§5) |
| Callout                      | `callout/callout.ts`, `callout.style.ts`, `callout.spec.ts` | feuille réécrite, composant inchangé |
| Code                         | `code/code.ts`, `code.style.ts`, `code.spec.ts`           | feuille réécrite, composant inchangé |
| Prose                        | `prose/prose.style.ts`                                    | réécrite |
| Pipeline Markdown            | `markdown/*` (parse, tree, highlight, render, snippet)    | **intact** |

Le pipeline produit un arbre de données (`parsePage`) rendu par `DocPage` ; il
ne connaît aucune couleur. Ne pas y toucher sauf pour brancher de nouveaux
composants (lot 6).

## 3. Décisions

À reprendre telles quelles (déjà tranchées) :

- Écrit **avec craft-ts** (`craftComponent` + `@craft-ts/style`), jamais de CSS
  écrit à la main, jamais de `styles:` en chaîne.
- Chaîne Markdown : markdown-it + shiki, mapping vers les composants.
- Périmètre : remplacer VitePress pour `apps/docs` (165 pages suivies par git).

**À confirmer avec l'utilisateur avant le lot 0** (recommandation incluse) :

- **Nom du package.** `libs/storm-ui` / `@craft-ts/storm-ui` ne tient plus : le
  thème n'est plus un orage. Recommandation : un nom **neutre**, `libs/docs-ui` /
  `@craft-ts/docs-ui`, et le thème n'apparaît que dans un fichier
  (`foundation/herbier.style.ts`, palette `herbier`). Ainsi la prochaine refonte
  ne renomme pas un package. Les composants s'appellent déjà `Doc*` : bon signe.
- Préfixes de feuilles : `craftStyles('stormCallout')` → `docCallout` ;
  `cssVars('storm', …)` → `herbier`. Le préfixe d'une feuille de composant est
  neutre, celui du thème porte le nom du thème.

## 4. Ce que le système de style impose (vérifié dans `libs/style`)

C'est la partie qui évite les mauvaises surprises. Chaque point a été relu dans
le code, pas supposé.

### 4.1 Règles de structure

- Un `*.style.ts` n'importe que du vocabulaire (règle `style-file-boundary`) :
  c'est ce qui permet au plugin Vite de l'évaluer sous Node. Pas d'import d'un
  composant, d'un service, d'un `.ts` utilitaire.
- **Une variante est un axe, jamais un nom de classe construit.** Le composant
  écrit une classe constante et un attribut `data-*` ; la feuille répond avec
  `when(axe.valeur, …)`. Voir `callout.style.ts` (axe `tone`) et le démo
  `apps/demo/src/app/examples/design-system/` (le README y explique le pourquoi).
- **Un composant lit des variables de thème, pas des jetons de palette.**
  Exception documentée : la surface de code, sombre dans les deux thèmes.
- Variables de thème : `cssVars(…, { inherits: true })`. Sans `inherits`, le mode
  sombre « ne fait rien » sans aucune erreur (piège rencontré, README du démo).
- Valeur initiale d'une variable enregistrée : unité **absolue** (`px`), jamais
  `rem` (`@property` invalide la registration en silence).
- Le mode : axe d'état `mode` (`light | dark`), posé par `data-mode` sur `<html>`,
  à côté du `prefers-color-scheme` (`when(scheme.dark, …)`). C'est déjà le schéma
  de `storm.style.ts` : le garder. Forcer un sous-arbre demande une classe de
  portée ; le thème maison de l'ancien site force le sombre sur `/learn-effect/`,
  donc prévoir ce besoin (lot 6).

### 4.2 Axes disponibles (inutile d'en écrire)

`libs/style/src/lib/axes/standard.ts` fournit :

| Besoin de la maquette                    | Axe standard                          |
| ---------------------------------------- | ------------------------------------- |
| survol, appui, désactivé, focus          | `interaction.hover / active / disabled / focus` |
| lien de navigation actif (sidebar, fil d'Ariane) | `ariaCurrent.page` (lit `aria-current="page"` : l'attribut annoncé par les lecteurs d'écran) |
| champ en erreur                          | `ariaInvalid.true`                    |
| bouton à bascule enfoncé                 | `ariaPressed.pressed`                 |
| sombre automatique / mouvement réduit    | `scheme.dark`, `motion.reduced`       |

À définir soi-même (`defineStateAxis`) : `tone` (existe déjà), `variant`
(bouton : primary, tonal, secondary, danger, link), `mode`. Le **focus visible**
n'est pas un axe : voir 4.4.

### 4.3 Valeurs : ce qui n'existe pas

La maquette utilise des écritures que le vocabulaire **refuse ou ne connaît pas**.
Table de traduction :

| Dans la maquette                               | Dans craft-ts                                              |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `color-mix(in srgb, …)`, `rgba(…)`             | **Aucun helper d'alpha, et `'rgba(…)'` est refusé** (`values.ts`). Chaque teinte devient un **jeton opaque** de la palette, calculé une fois : table au §5.2. Même méthode que Storm (« opaque tints, not alpha »). |
| Ombre diffuse `0 14px 30px rgba(…,0.12)`        | `shadow({ y, blur, color })` avec un jeton opaque `shadowSoft` (§5.2). Une ombre unie et floue se lit comme l'alpha sur la page. |
| Halo de focus de champ (3 px)                  | `shadow({ spread, blur: 0, color: herbier.focusHalo })` sous `interaction.focus` ; l'anneau de focus lui-même reste celui de la fondation (4.4). |
| Voile du dialogue (alpha 40 %)                 | `pseudo.backdrop([bg(ink), opacity(num(0.4))])` sur un `<dialog>` natif : `opacity` n'a pas besoin d'alpha dans la couleur. |
| Tailles d'affichage 56 / 72 / 84 px            | `text` ne va que de `xs` (12 px) à `xl` (22 px). Règle du système : « quand un pas manque, on l'ajoute à l'échelle ». Pour ne pas élargir la lib partagée, définir **trois** jetons locaux avec `unsafeLength(…, 'herbier-display')` : marqués, comptés par le graphe, donc dette visible. À défaire si l'échelle partagée s'agrandit. |
| Rayons 4 / 6 / 8 px                            | `radii.sm / md / lg` : **identiques**, rien à faire.       |
| Filets 1 px, 2 px                              | `lineWidth.hairline / thick` : identiques.                 |
| Espacements (4, 8, 12, 16…)                    | `space(1…24)` en pas de 0,25 rem : tous présents. Un 5 px ou 7 px de la maquette → arrondir au pas, pas d'`unsafeLength`. |
| `transition: background 0.2s ease …`           | `transitions([prop.backgroundColor, prop.borderColor], { duration: duration.fast, easing: ease })` (`animation.ts`). Les propriétés sont **nommées** : pas de `transition: all`. |
| Animations (apparition, tangage, brume)        | `keyframes` + `animate(…)` comme `arriving` ; détail au §4.7. Sous `prefers-reduced-motion`, la couche `craft.base` ramène **toute** animation et transition à l'instant (`global/base.ts`) : plus d'obligation par animation, ne pas la réécrire. |
| Polices avec axe optique (Newsreader `opsz`)   | `googleFont({ weights, italic })` ne connaît **ni axe optique, ni plage variable**. Voir 4.5. |
| Fond texturé (grain de papier)                 | `bgImage(…)` accepte des dégradés ; une `url()` passe par le helper `url(href)`. Le grain est **facultatif** (lot 6) et se fait avec une data URI SVG. |
| Icônes et illustrations SVG                    | Voir 4.6. |

### 4.4 Le focus est dans la fondation, pas dans les composants

`libs/style/src/lib/global/base.ts` dessine l'anneau sur **chaque**
`:focus-visible`, à partir de trois variables (`craftBase.focusRing`,
`focusWidth`, `focusOffset`) qu'on règle une fois dans `craftGlobalStyles` :

```ts
set(craftBase.focusRing, herbier.accent.action),   // épicéa (jour) / sauge (nuit)
set(craftBase.focusOffset, unit.px(3)),             // la maquette : 2 px d'anneau, 3 px de décalage
```

Herbier = « anneau épicéa de 2 px, jamais retiré ». Aucun composant ne redessine
son focus : l'obligation par composant (règle `require-focus-visible`) existait
pour les anciens blocs `styles:` et a été remplacée par cette couche globale
(`global/base.ts`). Seule la règle de nom accessible
(`control-has-accessible-name`) reste à la charge de chaque contrôle.

### 4.5 Polices

Familles : **Newsreader** (titres, légendes, citation), **Hanken Grotesk**
(interface, corps), **Geist Mono** (code).

```ts
export const display = defineFont('herbierDisplay', {
  family: 'Newsreader',
  source: googleFont({ weights: [400, 500, 600], italic: true }),
  display: 'swap',
  fallback: 'ui-serif',
});
export const sans = defineFont('herbierSans', {
  family: 'Hanken Grotesk',
  source: googleFont({ weights: [400, 500, 600, 700] }),
  display: 'swap',
  fallback: 'system-ui',
});
export const mono = defineFont('herbierMono', {
  family: 'Geist Mono',
  source: googleFont({ weights: [400, 500] }),
  display: 'swap',
  fallback: 'ui-monospace',
});
```

**Écart assumé.** La maquette charge Newsreader avec l'axe optique 6..72 : à
84 px les lettres sont plus fines et plus serrées. `googleFont` ne sait pas
demander un axe : le titre sera un peu plus lourd. Deux sorties, à décider
quand on regardera le rendu :

1. accepter l'écart (c'est la voie par défaut) ;
2. servir le fichier variable en local : `localFont({ files: [{ url, weight: [400, 600], style: … }] })`,
   après avoir déposé la police dans les assets de l'app. Vérifier la licence
   (Newsreader est sous OFL).

Fournir aussi des **métriques de repli** (`fallbackFaces`, `FontMetrics` de
Capsize) pour éviter le saut de mise en page au chargement ; la maquette ne les
mesure pas.

### 4.6 Icônes et illustrations

Piège connu de ce chantier : **pas d'inline SVG fiable dans un
`craftComponent`** (problème d'espace de noms). Le code actuel fait ses icônes
avec des formes CSS en pseudo-éléments. Pour Herbier, c'est insuffisant : il y a
16 icônes au trait fin, distinctes par la **forme** (un ton de callout ne doit
pas reposer sur la couleur seule).

Recommandation : **icônes par masque CSS**, une couleur courante.

- Les 16 icônes viennent de la planche Q (`ICONS` : feuille, épicéa, pousse,
  relief, boussole, recherche, copier, lien, valider, info, attention, fermer,
  suivant, soleil, lune, menu). Grille 24, trait 1,5, extrémités et jointures
  rondes.
- Chaque icône devient une `url("data:image/svg+xml,…")` (le helper `url()` de
  `@craft-ts/style` accepte une data URI, il l'échappe avec `JSON.stringify`),
  appliquée avec `maskImage(url(…))` + `maskSize` + `maskRepeat` et `bg(color)`.
  Le trait est noir dans le SVG : seul l'alpha compte, la couleur est celle du
  texte, donc le thème la pilote.
- Les chemins vivent **dans le fichier `*.style.ts`** (une constante
  `Record<IconName, string>` et une petite fonction pure qui assemble la data
  URI), parce qu'un `*.style.ts` n'importe pas d'utilitaire (4.1). Un axe
  `icon` (`defineStateAxis`) choisit le masque côté composant : `DocIcon` n'a
  qu'une entrée, `name`.
- Les **grandes illustrations décoratives** (forêt d'épicéas à 5 plans, courbes
  de niveau, planche botanique de la home) ne sont pas des icônes : fichiers
  `.svg` statiques dans les assets de l'app, utilisés en `img` avec `alt=""` ou
  en `bgImage(url(…))`. **Vérifier d'abord** que le plugin Vite de
  `@craft-ts/style` résout un `url()` relatif vers un asset ; sinon data URI.
  Les teintes de la forêt doivent suivre le thème : soit deux fichiers (jour,
  nuit) choisis par `mode`, soit des variables CSS dans le SVG si on l'inline
  via `maskImage` (une seule couleur par plan alors).

### 4.7 Le mouvement

Ajouté le 2026-10-07 à la demande de l'utilisateur (« de légères animations pour
rendre ça plus vivant »). La spécification visuelle est dans la maquette : la
planche P (arrivée de la page, forêt, feuilles, lucioles en nuit) et surtout le
panneau **« Mouvement »** de la planche Q, où chaque animation tourne en boucle
avec sa durée écrite dessous.

**Règles** (elles tiennent en cinq lignes, elles doivent rester vraies) :

1. Deux usages : *répondre* (survol, appui, ouverture : 150 à 250 ms) et
   *habiter* (arrivée, brise, brume : lent, jamais au centre de l'attention).
2. Trois durées : `fast` 150 ms, `normal` 250 ms, `slow` 450 à 900 ms (une fois) ;
   plus l'ambiant, **5 s ou plus** par boucle. Ce sont les `duration` de la
   fondation, pas de nouvelles valeurs.
3. **Une seule courbe**, `ease` de la fondation (`cubic-bezier(0.22, 1, 0.36, 1)`) :
   départ vif, pose douce, aucun rebond.
4. On n'anime que `opacity` et les transformations. Une oscillation continue
   reste sous 2° et 12 px ; seules quatre feuilles voyagent, en 24 à 31 s.
5. Sous `prefers-reduced-motion`, tout est figé à l'état final (couche
   `craft.base`, §4.3). Une animation d'entrée doit donc **se terminer sur l'état
   normal** de l'élément (`fillMode: 'backwards'`, jamais `forwards`) : figée,
   la page est complète.

**Traduction dans craft-ts :**

| Animation de la maquette | Où | Écriture |
| ------------------------ | -- | -------- |
| Arrivée échelonnée des blocs (10 px, fondu, 120 ms de décalage) | feuilles des composants | `animate(arrive, { duration: duration.slow, easing: ease, fillMode: 'backwards' })` (c'est `arriving`, déjà là). Le décalage : variable `kind.time` écrite par `assign(v.delay, unit.ms(index * 120))` au rendu, lue par `animationDelay(v.delay)`. **Au plus six éléments échelonnés par page**, au-delà tout arrive ensemble. |
| Soulèvement de carte, flèche qui glisse, couleurs d'état | feuilles des composants | `transitions([prop.boxShadow, prop.translate], { duration: duration.normal, easing: ease })` + `when(interaction.hover, [translate(…), shadow(…)])`. Individuelles `translate`, `rotate`, `scale` : le raccourci `transform` de la table n'accepte que `none`. |
| Trait de titre qui se dessine | feuille (`scale` + `transformOrigin`) | `keyframes` de `scale` de 0 à 1, origine à gauche, une fois. |
| Tige de la fougère, courbes de niveau qui se tracent | **dans le fichier SVG** | `stroke-dasharray` / `stroke-dashoffset` avec `pathLength="1"`, dans un `<style>` du SVG. Une fois. |
| Brise des folioles, brume, dérive des plans de forêt, feuilles, lucioles | **dans le fichier SVG** | boucles CSS internes. Elles jouent même quand le SVG est chargé par `img` ou `bgImage(url(…))`, mais **ne lisent aucune variable du thème** : deux fichiers (jour, nuit), les lucioles seulement dans le fichier nuit. |
| Ouverture d'un menu ou d'un dialogue (250 ms), fermeture (150 ms) | `DocMenu`, `DocDialog` | animation d'entrée à l'insertion du nœud. La **sortie** exige que le démontage attende la fin d'une animation : à vérifier dans le renderer ; sinon, entrée seule. |
| Ligne de délai d'un toast | `DocToast` | `keyframes` de `scale` sur une barre, durée = délai de fermeture, la même variable pilote le minuteur. |

**Budget.** La page P a 40 animations vivantes en jour (30 folioles, 3 plans de
forêt, 4 feuilles, brume, icône, rameau). Garder ce plafond d'ordre de grandeur :
les folioles se regroupent dans le SVG, pas dans la feuille. Aucune propriété
qui force la mise en page ; pas de `will-change` d'office.

## 5. Les tokens

### 5.1 Palette (jour · nuit)

Chaque jeton est une paire `{ light, dark }` de `definePalette('herbier', …)`.
`darkOf(token)` lit le côté sombre ; le thème n'est écrit qu'une fois.

| Jeton palette                | Jour      | Nuit      | Rôle |
| ---------------------------- | --------- | --------- | ---- |
| `surface.page`               | `#F2EEE3` | `#0F1914` | fond de page |
| `surface.raised`             | `#FAF7EF` | `#15231C` | cartes, champs |
| `surface.selected`           | `#DDE5D2` | `#1B2E24` | sélection, tonal, code en ligne |
| `surface.code`               | `#17261F` | `#0B130F` | bloc de code (sombre dans les deux modes) |
| `surface.info` / `tip` / `important` / `warning` / `danger` | `#DDE8EC` / `#DDE5D2` / `#F3E7C4` / `#F5E1D6` / `#F2DCDD` | `#1B2C33` / `#1B2E24` / `#2A2515` / `#2E1E16` / `#331C20` | fonds de callout et de badge |
| `text.strong` = `text.body`  | `#1E2B24` | `#E6E4D6` | texte principal |
| `text.muted`                 | `#46544B` | `#B5C2B6` | texte secondaire |
| `text.subtle`                | `#566459` | `#94A497` | libellés, bordures de contrôles (≥ 3:1) |
| `text.link`                  | `#234536` | `#A9D9B8` | liens |
| `text.info` / `tip` / `important` / `warning` / `danger` | `#3F6272` / `#234536` / `#7C5A0B` / `#9A4727` / `#8E2F3C` | `#9CC4D6` / `#A9D9B8` / `#E0B65A` / `#E39A72` / `#EC9AA3` | titres de callout, texte de badge |
| `accent.action`              | `#2F5D46` | `#8FC3A0` | bouton principal, focus, interrupteur |
| `accent.onAction`            | `#F7F4EA` | `#0E1A14` | texte sur `accent.action` **et** sur `danger` plein |
| `accent.danger`              | `#8E2F3C` | `#EC9AA3` | bouton danger |
| `accent.decor`               | `#6E8F5C` | `#7FA88A` | décor seulement (jamais du texte) |
| `border.subtle`              | `#CFC9B6` | `#2A3B31` | séparateurs, cartes |
| `border.strong` = `text.subtle` | `#566459` | `#94A497` | contours de champs et boutons secondaires |

Correspondance : « Épicéa » = `accent.action`, « Sauge claire » = `surface.selected`,
« Ocre » = `important`, « Rouille » = `warning`, « Ardoise » = `info`,
« Vin » = `danger`, « Filet » = `border.subtle`.

**Mapping des tons Markdown** (l'API de `DocCallout` ne change pas) :
`info` = ardoise (NOTE GitHub inclus), `tip` = épicéa, `important` = ocre
(sert aussi au « BETA » de la maquette via une légende personnalisée),
`warning` = rouille, `danger` = vin. Icônes par ton : info → cercle-i, tip →
feuille, important → pousse, warning → triangle, danger → croix dans un cercle.

### 5.2 Teintes dérivées (opaques, déjà calculées)

La maquette les produit par `color-mix` ; on les fige en jetons. Valeurs
calculées par script, mélange `sRGB`.

| Jeton                | Jour      | Nuit      | Origine dans la maquette |
| -------------------- | --------- | --------- | ------------------------ |
| `surface.selectedHover`  | `#C1CFBC` | `#2E4638` | `.b-t:hover`, `.ib:hover` : sauge claire 84 % + épicéa 16 % |
| `surface.selectedActive` | `#ACBFAB` | `#3B5847` | `.b-t:active` : 72 % + 28 % |
| `surface.navHover`       | `#E5E9D9` | `#16261E` | `.nv.s-h` : sauge claire 60 % sur le papier |
| `border.tip`             | `#96A897` | `#516F5C` | bord de callout : ton 38 % sur son fond |
| `border.info`            | `#A1B5BE` | `#4C6671` | idem |
| `border.important`       | `#C6B17E` | `#6F5C2F` | idem |
| `border.warning`         | `#D2A694` | `#734D39` | idem |
| `border.danger`          | `#CC9AA0` | `#794C52` | idem |
| `border.focusHalo`       | `#C1CCC0` | `#375041` | halo de champ en focus (épicéa 28 % sur la carte) |
| `shadowSoft`             | `#D9D7CC` | `#090F0C` | ombre des cartes flottantes |
| `border.codeLine`        | `#2A3731` | `#1F2622` | filet sous la barre du code |

**Teintes des lignes marquées du code** (`highlight`, `add`, `remove`,
`warning`, `error`) : la maquette n'en dessine pas. À dériver du jeton
`surface.code` en le mélangeant à `ardoise`, `sauge`, `rose`, `sable`. **Piège
mesuré** : à 14–16 % de mélange, la couleur de commentaire (`#8DA093`) tombe à
4,0–4,2:1 en jour (sous AA) alors qu'elle passe en nuit (≥ 4,98). Rester autour
de 8 % en jour, et laisser le test (§8) décider.

### 5.3 Couleurs de syntaxe

Identiques jour et nuit (la surface de code est sombre dans les deux) :

| Genre         | Valeur    | Contraste sur `#17261F` |
| ------------- | --------- | ----------------------- |
| `keyword`     | `#A9C98F` | 8,6:1 |
| `function`    | `#E8D6A0` | 10,9:1 |
| `string`      | `#BFD6C2` | 10,2:1 |
| `number`      | `#E39A72` | 6,9:1 |
| `type`        | `#9EC3D0` | 8,4:1 |
| `comment`     | `#8DA093` | 5,7:1 |
| `plain`       | `#E6E4D6` | — |
| `punctuation` | reprendre `text.muted` côté sombre |

### 5.4 Squelette de la fondation

À écrire en partant de `storm.style.ts` (même structure, mêmes noms de rôle) :

```ts
export const herbier = definePalette('herbier', {
  surface: {
    page: { light: '#F2EEE3', dark: '#0F1914' },
    raised: { light: '#FAF7EF', dark: '#15231C' },
    selected: { light: '#DDE5D2', dark: '#1B2E24' },
    // … voir §5.1 et §5.2, une entrée par ligne des tables
    code: { light: '#17261F', dark: '#0B130F' },
  },
  text: { /* strong, muted, subtle, link, tons, syntaxe */ },
  border: { /* subtle, strong, tons, codeLine, focusHalo */ },
  accent: { action: { light: '#2F5D46', dark: '#8FC3A0' } /* … */ },
});

export const theme = cssVars('herbier', {
  surface: kind.color(herbier.surface.page, { inherits: true }),
  // une variable par jeton lu par un composant : surface, raised, selected,
  // ink, inkMuted, inkSubtle, link, line, lineStrong, action, onAction, et
  // trois variables par ton (surface, border, ink) comme dans storm.style.ts
});
```

Puis, comme aujourd'hui : un `paint(side)` écrit une fois, appliqué en clair,
puis `when(scheme.dark, dark)`, puis `when(mode.light, light)` /
`when(mode.dark, dark)` dans `craftGlobalStyles('herbier', { root: […] })`.
Ajouter dans ce même `root` les réglages du focus (4.4).

## 6. Les composants

Convention du dépôt (à respecter, elle est déjà dans `callout.ts`) : une entrée
d'un composant est un **générateur** (`function* () { return v; }`) quand on
l'écrit à la main dans un test ; en usage normal on passe `Input<T>` ; une
variante est un attribut `data-*` lu par la feuille.

Forme canonique d'un bouton (vérifiée sur `ds-components.ts` du démo) :

```ts
import { button, craftComponent, type Input, type Output } from '@craft-ts/component';
import { buttonUi } from './button.style.ts';

export type ButtonVariant = 'primary' | 'tonal' | 'secondary' | 'danger' | 'link';

export const DocButton = craftComponent(
  'DocButton',
  {},
  (input: {
    readonly label: Input<string>;
    readonly variant: Input<ButtonVariant>;
    readonly press: Output<() => void>;
  }) =>
    button('docButton', {
      type: 'button', // règle button-has-type
      class: buttonUi.root,
      'data-variant': input.variant,
      click: input.press,
    }, input.label),
);
```

La feuille : une classe, un axe `variant`, les états par `interaction.*` :

```ts
when(variant.primary, [set(v.bg, theme.action), set(v.ink, theme.onAction)]),
when(interaction.hover, [ /* shadow({ y: …, blur: …, color: herbier.shadowSoft }) */ ]),
when(interaction.active, [ /* translateY(1px), bg plus foncé */ ]),
when(interaction.disabled, [ opacity(num(0.45)), cursor.notAllowed ]),
```

Chargement : un attribut `aria-busy`/`data-loading` (un axe `state`), un anneau
qui tourne (keyframes ; le mouvement réduit est géré par `craft.base`).

### 6.1 Inventaire (maquette → composant)

| Maquette (classe)       | Composant                         | Statut | Notes |
| ----------------------- | --------------------------------- | ------ | ----- |
| `.co`                   | `DocCallout`                      | existe | feuille réécrite, icône par masque (§4.6), légende inchangée |
| code + barre + Copier   | `DocCode`, `DocCodeGroup`         | existe / à faire | bouton Copier : frontière presse-papiers à vérifier (voir « Reste » de la mémoire du chantier) |
| prose, citation, légende| feuille `prose` + `DocFigure`     | existe / à faire | citation = filets haut et bas, italique Newsreader, **pas de filet latéral** ; `figcaption` italique `text.subtle` |
| `.pb`, `.ib`            | `DocButton`, `DocIconButton`      | à faire | 5 variantes × états ; `DocIconButton` exige un nom accessible |
| `.bd`                   | `DocBadge` (axe `tone`)           | à faire | capitales espacées, un mot toujours présent |
| `.kb`, `.ic`            | `DocKbd`, code en ligne           | à faire | pas d'helper `kbd`/`code` : `h('kbd', …)` |
| `.nv`                   | `DocNavLink`                      | à faire | actif = `ariaCurrent.page` ; aplat sauge + texte gras (deux signaux) |
| `.tb`                   | `DocTabs`                         | à faire | sert aux groupes de code ; l'onglet actif porte `aria-selected`, mais **aucun axe standard ne le lit** : définir un axe d'état (`selected`) posé avec l'attribut |
| fil d'Ariane, « sur cette page », précédent/suivant | `DocBreadcrumb`, `DocOutline`, `DocPager` | à faire | l'outline vient de `parsePage().outline` ; l'item courant se suit au défilement (axe `scrollState` ou observation à décider) |
| `.fi`, `.ck`, `.rd`, `.sw` | `DocField`, `DocCheckbox`, `DocRadio`, `DocSwitch` | à faire | éléments natifs stylés (`appearance`) ; erreur = `ariaInvalid.true` ; **la doc n'en a besoin que pour la recherche et le sélecteur de mode** : ne livrer que ceux-là d'abord |
| `.ts`                   | `DocToast`                        | à faire | région `aria-live`, bouton de fermeture, ligne de délai (keyframes) |
| `.mi`, infobulle        | `DocMenu`, `DocTooltip`           | à faire | menu natif (`popover`) si le renderer le permet, sinon à étudier |
| dialogue                | `DocDialog`                       | à faire | `<dialog>` natif + `pseudo.backdrop`, sert la recherche |
| navbar, sidebar, home, 404, pied de page | `DocNavbar`, `DocSidebar`, `DocHome`, `DocNotFound`, `DocFooter` | à faire | lot 6 ; la planche botanique est dans le hero de la home |
| forêt, courbes de niveau| `DocForest`, `DocContours`        | à faire | décor : `aria-hidden`, jamais d'information |

Règle de la maison (README du démo) : **tout n'est pas un composant**. Une pile,
une carte, un séparateur restent des feuilles que l'appelant applique.

## 7. Les lots

Chaque lot se termine par `tsc -p …/tsconfig.spec.json --noEmit` propre, tests
verts, ESLint sans erreur, et le rendu comparé à la maquette en jour **et** en
nuit.

**Lot 0 — renommage mécanique** (seulement si l'utilisateur confirme le §3).
Un commit : dossier, `package.json`, `project.json`, alias de
`tsconfig.base.json` et de `vitest.config.ts`, préfixes de feuilles. Aucun
changement de comportement. Les 59 tests restent verts.

**Lot 1 — fondation Herbier.** `herbier.style.ts` (palette, thème, axes `tone` et
`mode`, polices, durées, `arriving`, réglage du focus) ; test de contraste sur le
modèle de `storm.spec.ts` (§8). Sortie : la page d'accueil actuelle (callout,
code) rendue avec les nouvelles couleurs, rien d'autre ne change.

**Lot 2 — restyle de l'existant.** `callout.style.ts` (forme rectangulaire à
rayon `sm`, bord ton à 38 %, icône par masque, légende en capitales espacées),
`code.style.ts` (filet sous la barre, ligne marquée = teinte + glyphe), `prose`
(Newsreader en titres, Hanken en corps, tableau en filets fins, citation sans
filet latéral).

**Lot 3 — contrôles de base.** `DocIcon` (masques), `DocButton`,
`DocIconButton`, `DocBadge`, `DocKbd`, avec leurs `transitions` (§4.7). C'est le
lot qui valide la table de traduction du §4.3 sur de vrais composants.

**Lot 4 — navigation.** `DocNavLink`, `DocTabs`, `DocBreadcrumb`, `DocOutline`,
`DocPager`, puis `DocCodeGroup` avec le bouton Copier.

**Lot 5 — surfaces flottantes et champs.** `DocField` (recherche), `DocSwitch`
(mode), `DocToast`, `DocDialog`, `DocMenu`, `DocTooltip`.

**Lot 6 — mise en page et décor.** Navbar, sidebar, home (planche botanique),
404, pied de page avec la forêt, grain facultatif, forçage de thème par route
(`/learn-effect/`), **mouvement d'ambiance** (SVG animés jour et nuit, arrivée
échelonnée de la home, §4.7), puis le branchement : ESLint (preset `style` et règles
d'architecture), `include` du plugin Vite pour les `*.style.ts` de la lib côté
`apps/docs`, dépendances `markdown-it` et `shiki` dans le `package.json`,
routage, recherche, `llms.txt`, build du site à la place de `vitepress build`.

## 8. Preuves et vérification

- **Contraste AA, dans les deux modes.** Reprendre `foundation/storm.spec.ts`
  (`contrastRatio`, `AA_NORMAL_TEXT` de `@craft-ts/dev-tools/contrast`). Paires à
  prouver (valeurs de la maquette, toutes ≥ 4,5:1 mesurées, les deux modes) :
  `text.strong/muted` sur `surface.page` et `surface.raised` ; `text.subtle` sur
  `surface.raised` et `surface.selected` ; `text.link` sur la page ;
  `text.<ton>` sur `surface.<ton>` ; `text.strong` sur `surface.<ton>` ;
  `accent.onAction` sur `accent.action` et sur `accent.danger` ; chaque couleur
  de syntaxe sur `surface.code`, **et sur chaque teinte de ligne marquée**.
  Les **contours de contrôles** (`border.strong`) se prouvent à **3:1** :
  `contrast.ts` n'exporte que `AA_NORMAL_TEXT` (4,5) et `AA_LARGE_TEXT` (3), on
  prend `AA_LARGE_TEXT` pour ce seuil et on le nomme dans le test. 5,8:1 mesuré
  en jour.
- **Rendu et feuille émise.** Modèle de `callout.spec.ts` :
  `renderCraftComponent` + `renderCss(registeredAtoms(), …)` ; vérifier une
  règle par ton et par variante, et le côté sombre du thème.
- **Matrice d'états.** Le démo a `design-system.matrix.spec.ts` (`visualMatrix`,
  `assertExhaustiveVisualMatrix`). Chaque axe ajouté multiplie la matrice : le
  bouton (5 variantes × hover × active × disabled × …) est le premier à
  surveiller ; noter le cardinal comme le fait le démo.
- **Œil.** Ouvrir la maquette et le rendu côte à côte, jour puis nuit, avec
  `data-mode` forcé. Plusieurs défauts de ce chantier n'ont été attrapés qu'à
  l'œil (en-tête de code clair sur fond clair, bouton fantôme transparent qui
  laisse voir le décor, couleur de lien qui écrase celle d'un bouton-lien).
- Commandes : `npx vitest run --config libs/storm-ui/vitest.config.ts` depuis le
  worktree (chemin à adapter après le lot 0). Type-check avec
  `tsconfig.spec.json`, pas `tsconfig.lib.json` : celui-ci échoue en TS6305 tant
  que `core`, `component` et `style` ne sont pas buildés (références composites).
  Node 22 requis pour vitest.

## 9. Pièges connus

Du chantier `storm-ui` :

- Une entrée de composant nommée comme un attribut HTML (`lang`, `start`,
  `title`) est avalée et **décale** les suivantes : `language`, `firstLine`.
- Une entrée se passe comme générateur (`function* () { return v; }`), pas
  `() => v`.
- `overflow` n'existe pas dans la table : défilement horizontal =
  `provides(scrollPort.inline)`.
- Des tableaux d'enfants avec spreads conditionnels cassent la surcharge de
  `div`/`span` : construire un `CraftNodeChild[]` typé puis le passer.
- L'en-tête de code doit rester sombre dans les deux thèmes (`theme.sunken`
  clair avait rendu le nom de fichier illisible).
- `html: true` est nécessaire pour `<kbd>` et les blocs HTML du Markdown ;
  `<Nom></Nom>` sur une ligne est du HTML en ligne (seul `<Nom />` seul est un
  bloc) ; un `grep -r` sous `apps/docs` lit les copies de `.vitepress/dist`.

De cette revue :

- **Pas d'alpha, pas de `color-mix`** : tout calcul de teinte se fait avant,
  dans la palette. C'est la contrainte qui touche le plus de lignes de la
  maquette.
- Le **focus n'est jamais un état de composant** : ne pas écrire de
  `:focus-visible` dans une feuille, régler la fondation (§4.4).
- Ne pas confondre `interaction.focus` (`:focus`, pour ce qui doit *apparaître*
  au focus, comme le halo d'un champ) et l'anneau.
- Lien et bouton-lien : une règle globale `a { color }` écrase la couleur d'un
  bouton rendu en `<a>`. Ici les couleurs vivent dans les feuilles par axe, pas
  dans une règle d'élément ; ne pas en réintroduire une dans la fondation.
- Un bouton dont le fond est transparent laisse voir le décor derrière : le
  secondaire et le fantôme ont un fond de jeton (`surface.raised`).
- Les couleurs « tonales » du texte (`text.info`…) ne servent que pour des
  libellés **sur le fond de leur ton** (preuve ≥ 4,5:1 là, pas ailleurs).
- Le jaune « beurre » de Clairière et les cyans de Storm ne font **pas** partie
  d'Herbier : ne pas piocher dans les autres planches du canvas.

## 10. Hors périmètre et questions ouvertes

- Le **mode de rendu** des illustrations (fichiers ou masques, §4.6) et
  l'**axe optique** de Newsreader (§4.5) : à trancher en regardant le résultat.
- Les lignes de code **marquées** (§5.2) : à dessiner, la maquette n'en a pas.
- Le **bouton Copier** : la frontière navigateur/presse-papiers du renderer
  n'est pas vérifiée.
- Pas de planche pour : tableau trié, pagination de liste, recherche (résultats),
  mise en page de la home complète, 404, version mobile. La maquette est une
  page à 1200 px et des états à 1600 px ; **le comportement à largeur de
  téléphone n'est pas dessiné**. À demander avant le lot 6.
- Le **mode sombre forcé par route** (`/learn-effect/`) demande une classe de
  portée ; les règles globales n'atteignent que `:root`.
- Le mouvement d'ambiance (§4.7) dépend du choix « fichiers SVG animés » du
  §4.6. Si l'on retient les masques pour tout, il n'y a plus que l'arrivée
  échelonnée et les transitions : c'est un repli acceptable, l'ambiance seule
  n'est pas une fonctionnalité de la doc.
- Le **démontage différé** d'un menu ou d'un dialogue (animation de sortie) n'est
  pas vérifié dans le renderer.

## 11. État d'avancement (2026-10-07, fin de session)

Branche `feat/storm-ui` (worktree `../ng-craft.worktrees/storm-ui`), au-dessus de `main` (0c737f6c3) ; `git log 0c737f6c3..` donne les commits.
Vérifié : `tsc -p libs/docs-ui/tsconfig.spec.json` propre, **156 tests / 16 fichiers**
verts, ESLint à **0 erreur** avec les préréglages `style`, `a11y` et `typedCss`
(`libs/docs-ui/eslint.config.mjs`), 310 tests de `libs/component` verts, rendu
vérifié à l'œil dans le navigateur (jour, nuit, 1200 px, 375 px, recherche).

### Fait

| Lot | Contenu |
| --- | ------- |
| 0 | Renommage `storm-ui` → `libs/docs-ui` / `@craft-ts/docs-ui` (recommandation du §3 appliquée sans attendre la confirmation : mécanique et réversible). Préfixes `docCallout`, `docCode`, `docProse` ; thème `herbier` dans un seul fichier. |
| 1 | `foundation/herbier.style.ts` : palette (jour/nuit), teintes opaques du §5.2, variables de thème, axes `tone`/`mode`/`scope`, polices, `weight`, `displaySize` (3 `unsafeLength` marqués, avec `clamp` pour descendre jusqu'au téléphone), focus réglé dans la fondation, `arriving`/`fading`, points de rupture. Contraste AA prouvé dans les deux modes (`herbier.spec.ts`), contours de contrôle à 3:1. |
| 2 | Callout (icône par masque, tons par `toneRules` partagé), code (barre, filet, lignes marquées teinte + glyphe, bouton Copier), prose (Newsreader/Hanken/Geist Mono, tableau en filets, citation sans filet latéral). |
| 3 | `DocIcon` (20 icônes : les 16 de la planche Q + `error`, `previous`, `chevron`, `external`), `DocButton` (5 variantes × états), `DocLinkButton`, `DocIconButton`, `DocBadge`, `DocKbd`. |
| 4 | `DocNavLink`, `DocTabs` (patron ARIA complet, flèches, tabindex itinérant), `DocBreadcrumb`, `DocOutline`, `DocPager`, `DocCodeGroup` + `DocCopyButton`, et `::: code-group` dans le pipeline Markdown. |
| 5 | `DocField`, `DocSwitch`, `DocToast`/`DocToastRegion`/`DocToastQueue`, `DocDialog`, `DocMenu`, `DocTooltip`. |
| 6 | `DocNavbar`, `DocSidebar` (groupes numérotés en chiffres romains, groupes repliables natifs), `DocFooter`, `DocHome`, `DocNotFound`, `DocForest`/`DocContours`/`DocPlate` (dessins de la maquette repris en masques), `DocSearch`, `DocModeToggle`, et `DocLayout` qui assemble le tout (tiroir sur téléphone, ⌘K, bascule de mode, portée forcée claire/sombre). |
| Modèle de site | `site/site.ts` (sidebar d'un chemin, page courante, fil d'Ariane, précédent/suivant, chiffres romains), `site/search.ts` (index + requête), `site/vitepress.ts` (la config VitePress de `apps/docs` se lit telle quelle), `site/llms.ts`, `site/pages.ts` (découverte des pages, données du site), point d'entrée `@craft-ts/docs-ui/node`. Testé sur les vraies pages et la vraie config (`site/build.spec.ts`). |
| Outillage | Harnais `libs/docs-ui/preview` + `vite.preview.config.ts` (galerie, accueil, 404, page type ; `nx run docs-ui:preview`). |

### Écarts et décisions de la session

- **Points de rupture nommés pour trier** : `compact < medium < wide < xwide`.
  L'émetteur de `@craft-ts/style` ordonne les atomes **conditionnels par nom de
  classe**, et le nom de classe porte le nom du point : avec `sm`/`md`/`lg`
  l'ordre alphabétique est `lg`, `md`, `sm`, et la règle étroite gagnait à toutes
  les largeurs pour une même propriété. `herbier.spec.ts` garde cette propriété.
- **`arriving` pose `position: relative`** (la translation de 10 px passe par
  `inset-block-start`, il n'y a pas de `transform` typé). Une surface placée par
  le navigateur (un `<dialog>` modal est `position: fixed`) prend `fading`.
- **`unit.rem` suffit** pour une taille hors échelle ; `unsafeLength` n'est utilisé
  que pour les trois tailles d'affichage, comme le plan le demande.
- **`transparent` n'existe pas** dans le vocabulaire : un jeton de palette
  `surface.clear` (`#00000000`) sert au bouton-lien et aux boutons sans fond.
- **Teinte de la bordure des toasts/badges** : le jeton `border.<ton>` (38 % sur
  la surface du ton) au lieu des 45 %/30 % de la maquette, sur fond carte.
- **Menu et infobulle** sans `popover` ni ancrage CSS : `position: absolute` dans
  un conteneur relatif, ouverture par état ; l'infobulle passe sa visibilité par une
  variable (`--docTooltip-show`).

### Changements hors de la lib (à relire)

- `libs/dev-tools/src/eslint-rules/style-file-boundary.cjs` : acceptait
  `./x.style` mais refusait `./x.style.ts` (la règle dit « un import relatif vers
  un autre fichier de style est permis »). Un cas de test ajouté.
- `libs/component/src/lib/render/interpreter.ts` : un `dialog({ open: true })`
  recevait l'attribut `open` (ouverture **non modale**) puis `installDialog` voyait
  `dialog.open` déjà vrai et n'appelait jamais `showModal()`. Le dialogue restait
  dans le flux, sans couche supérieure, sans piège à focus. L'ouverture est
  maintenant faite **après** le montage des enfants (sinon `showModal()` n'a rien
  à focaliser) ; spec `dialog-modal.spec.ts`, échoue sans le correctif. La boîte
  de dialogue « Send context to AI » passe par le même chemin : à regarder.
- `tsconfig.base.json` : alias `@craft-ts/docs-ui` et `@craft-ts/docs-ui/node`.

### Constats sur les docs

- **Six pages ne figurent dans aucune sidebar** (VitePress a le même trou) :
  `/guide/migration/wave-1-tag-and-provided-in`, `/guide/routing/hash-location`,
  `/guide/testing/architecture/{primitive-method-usage,
  resource-params-query-state,unused-primitive-method}`, `/guide/testing/folder-layout`.
  Elles n'ont ni ligne surlignée ni précédent/suivant. `site/build.spec.ts` fige
  la liste : une nouvelle page orpheline fait échouer le test.
- `markdown-it`, `shiki` et `yaml` sont importés par le pipeline mais **ne sont
  déclarés nulle part** (ils arrivent par `vitepress`). À déclarer dans le
  `package.json` racine avec un `pnpm install` : sans cela, retirer VitePress
  casse le pipeline.

### Le branchement : `apps/docs-herbier` (fait, à côté de `apps/docs`)

Plutôt que copier les 296 fichiers de `apps/docs` (la copie diverge), une
application voisine **lit les mêmes pages en place** et prend sa navigation dans
la configuration VitePress de `apps/docs` : les deux sites montrent les mêmes
pages sous les mêmes sections, et se comparent côte à côte. `apps/docs` n'est
pas modifiée (ses tests lisent encore `CraftAgentPrompt.vue`).

- `nx serve docs-herbier` (:4420, rendu serveur à la demande), `nx build
  docs-herbier` (165 pages + 404 + `search-index.json` + `llms.txt`), `nx preview
  docs-herbier` (:4421, le site construit servi sous `/craft/` comme GitHub
  Pages). Détails : `apps/docs-herbier/README.md`.
- Les trois composants Vue du thème sont portés : `AuthorNote`, la carte « Start
  with an agent » et le migrateur de template (testé en direct).
- Vérifié en production : `startCraft` hydrate chaque page avec 0 écart, liens
  sous `/craft/`, 165 entrées dans l'index, `/learn-effect/` en sombre.
- Poids : 96 Mo bruts, 7,3 Mo en gzip pour les 166 pages (VitePress : 32 Mo). Les
  marqueurs d'hydratation (commentaires + `data-craft-hk`) font 1 Mo sur les pages
  les plus longues ; c'est le moteur, pas le thème.

Deux défauts du moteur trouvés en chemin (`libs/component`, avec tests) : les
nœuds d'un contenu projeté prenaient leurs clés d'hydratation de la page qui les
déclare (collisions, contenu éparpillé au premier plan) ; et un nœud créé après
la fin de l'hydratation réclamait encore des nœuds du serveur, de sorte qu'un
nouveau rendu du composant déclarant vidait le contenu projeté.

### Les saisons (fait, 2026-10-07)

Les quatre variantes de la maquette sont effectives et se choisissent comme le mode
clair/sombre.

- **Palette** : `foundation/seasons.style.ts` (printemps, été, automne, hiver ; jour
  et nuit), prouvée AA par `seasons.spec.ts` (texte, états des fills sauge, bouton plein,
  contours à 3:1, encre du code sur chaque surface marquée). Les tons qui portent un sens
  (info, important, avertissement, danger) restent ceux de `herbier` : un avertissement est le
  même en juillet et en janvier.
- **Dessins** : forêt, rehauts (neige, fleurs…), planche botanique et lueur changent par saison.
  Les masques de saison sont des variables de thème (`kind.url`) que la racine pose ;
  les composants de décor ne connaissent pas la saison (`decor/seasons.art.style.ts`,
  généré, 98 Ko).
- **Choix** : `data-season` sur `<html>`, à côté de `data-mode`. Le lecteur prend une
  saison ou « Automatique » (saison météorologique de l'hémisphère nord, mois entiers :
  mars-mai, juin-août, septembre-novembre, décembre-février). Stocké dans `localStorage`
  (`docs-season`) ; « Automatique » ne stocke rien, la date décide.
- **Avant le premier rendu** : `bootScript({ darkPaths })` (`foundation/season.ts`) est
  inséré dans le `<head>` par `document.ts`. Il pose `data-mode` et `data-season` avant la
  première peinture, et force le sombre sur `/learn-effect/`. Sa logique est répétée dans
  le texte du script (il tourne avant tout bundle) : `season.spec.ts` l'exécute contre les
  douze mois, les choix stockés, un stockage refusé et les chemins forcés.
- **Interface** : `DocSeasonPicker` (menu `menuitemradio`, `aria-checked`, icône de la saison
  affichée) dans la barre, avant l'interrupteur de mode. `DocSeasonView` pose aussi
  `data-season` s'il manque (script bloqué, harnais). `lockedMode` retire l'interrupteur de
  mode sur une page qui impose le sien ; le choix de saison reste libre.
- **Cascade** : chaque saison écrit son jour, ses dessins, puis sa nuit sous la préférence
  du navigateur (`scheme.dark`) et sous un choix explicite (`mode.light/dark`), tout sous
  `:root[data-season]` pour battre les règles de la palette classique. Vérifié dans le
  navigateur : 4 saisons × clair/sombre × préférence système sombre.
- **Non repris, par choix** : les particules ambiantes de la maquette (feuilles qui
  tombent, neige, lucioles, pollen), le grain et la brume. L'Herbier classique n'est
  atteignable que sans `data-season` (JavaScript désactivé).

### Navigation sans rechargement (fait, 2026-10-07)

Chaque clic sur un lien interne rechargeait le document puis réhydratait tout : ~0,4 s en
dev, un flash blanc, le scroll perdu. Le site garde un HTML complet par page (première
visite, moteurs de recherche, lien ouvert dans un onglet) et sait en plus changer de page
sans charger de document.

- **Données** : le build écrit `page-data/<route>.json` (une `PageData`, 4 Mo en tout) ; le
  serveur de dev répond à la même URL (`devPageData`).
- **Service** `DocsNavigation` (`apps/docs-herbier/src/navigation.ts`, craft-ts seul, pas
  d'Angular) : intercepte les clics sur les liens internes (pas les modificateurs, `target`,
  autres sites, fichiers), lit le JSON (préchargé au survol), pose la page dans un `state` que
  `DocsRoot` lit. Historique (`pushState`, retour arrière avec la position de scroll
  sauvegardée), scroll en haut ou vers l'ancre, focus sur `main` (`tabindex=-1`),
  `document.title`, mode forcé de `/learn-effect/` posé puis rendu. Tout ce qu'il ne sait
  pas faire (page sans données, erreur réseau) retombe sur un chargement normal.
- **Fermeture** : l'événement `doc-navigated` (`NAVIGATED_EVENT`) ferme le tiroir, la
  recherche et les menus ouverts.
- **Mesuré** (site construit, navigateur) : 12 à 53 ms pour dessiner la page suivante, le
  cadre (barre, sidebar, mode, saison) reste le même élément. Avant le correctif du moteur
  ci-dessous : 280 à 500 ms.
- **Défaut du moteur trouvé en route** (`libs/component`, `interpreter.ts`) :
  `ComponentRenderedNode.patch` écrivait les entrées d'un composant une par une, et les
  effets tournent de façon synchrone : un composant à douze entrées était dessiné treize fois
  par changement, avec des états intermédiaires incohérents (`2-1-1`, `2-2-1`), et chaque
  copie recommençait sur ses enfants (la barre était dessinée 132 fois par navigation).
  Les écritures sont maintenant regroupées (`ɵcraftBatch`), test
  `component-props-batch.spec.ts` (échoue sans le correctif). Gain : ~9 fois en jsdom.

### Le logo par saison (fait, 2026-10-07)

La marque de la barre est le vrai logo de craft-ts (l'astérisque à trois barres de
`apps/docs/public/assets/craft-ts-logo.png`), recoloré par saison et par mode. Un premier essai
redessinait les trois barres à la main : formes approximatives, dégradés plats, rejeté.

- **Méthode** : le logo est un dégradé continu (indigo, violet, magenta, rose, orange) avec des
  plis et des ombres ; il ne se réduit pas à une forme plate par couleur. `libs/docs-ui/scripts/logo-masks.py`
  le démonte à partir de ses pixels en onze masques alpha de 192 px (`logo/logo.art.style.ts`,
  généré) : la silhouette, huit bandes le long du dégradé (chaque pixel est placé sur la rampe
  par sa teinte ; les alphas sont calculés pour que huit couches peintes l'une sur l'autre
  redonnent exactement l'interpolation entre huit couleurs), l'ombre des plis et le liseré clair.
  `DocLogo` empile ces couches dans la silhouette ; la peinture vient de dix variables de thème.
  Avec les couleurs du logo d'origine, le rendu est indiscernable de l'original à l'œil.
- **Couleurs** : un groupe `logo` (`r0…r7`, `shade`, `light`) par palette, jour et nuit. Chaque
  saison traverse la roue chromatique par zones de teintes voisines (les trois premières sur
  les barres du haut, deux sur la barre en travers, trois sur le bout du bas) : printemps =
  azur, cyan, menthe / rose, pêche / beurre, citron vert ; été = bleus d'océan / corail, orange
  / ambre, or ; automne = prune, grenat, rouille / ambre, or, olive ; hiver = bleus,
  glace, lavande, orchidée.
- **Preuve** : chaque couleur tient 2:1 sur le papier (un dégradé traverse des jaunes) et 3:1
  la nuit ; les deux extrémités de chaque rampe sont à 60° au moins sur la roue chromatique
  (`seasons.spec.ts`, `herbier.spec.ts`).
- **Coût** : +56 Ko de masques dans la feuille de style (592 Ko, 104 Ko compressée).
- **Pas fait** : le favicon reste le PNG d'origine ; les superpositions d'ombres du logo
  d'origine sont rendues par la couche `shade`, une seule teinte par palette.

### Reste à faire

1. **Retirer VitePress** quand la comparaison est faite : déplacer la navigation
   (`nav`/`sidebar` de `config.mts`) dans un module à soi, brancher la CI sur
   `docs-herbier`, supprimer `.vitepress/`. `apps/docs-herbier/src/server/site.ts` est le seul
   endroit qui lit encore la configuration VitePress.
2. ~~**Correspondance route → portée**~~ fait avec les saisons : `/learn-effect/`
   est forcé en sombre par le script de démarrage (`darkPaths`) et le layout retire
   l'interrupteur (`lockedMode`). L'entrée `scope` du layout n'est plus utilisée par
   l'app.
3. **Polices** : l'axe optique de Newsreader (§4.5) reste un écart accepté ; les
   métriques de repli (`adjustFallback`) ne sont pas fournies, faute de source
   hors ligne pour les métriques Capsize.
4. **Non repris, par choix** (§10) : grain de papier, brume, tangage des folioles.
   `DocCheckbox`/`DocRadio` non livrés (la doc n'en a pas besoin).
5. **Non dessiné par la maquette, décidé ici** : le comportement à 375 px (barre
   réduite, tiroir pour la sidebar, sections de la barre dans le tiroir). À faire
   valider ou redessiner.
6. Pas vérifié à l'œil : la page 404, le tiroir ouvert, les toasts, le menu
   « Packages » ouvert (leurs tests de rendu passent).
