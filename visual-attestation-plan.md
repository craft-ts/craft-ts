# Attestation visuelle — validation manuelle qui survit au refactor

## Résumé

Aujourd'hui `visualMatrix` part des feuilles de style, et la validation se fait par
comparaison de captures : n'importe quel changement de pixel redemande tout, et une
approbation n'existe nulle part — un `--update-snapshots` approuve en silence.

Ce plan remplace l'unité de vérité. On n'enregistre plus « voici les pixels de
référence » mais **« un humain a jugé ce rendu correct, et ce jugement tient tant que
le code qui le produit n'a pas bougé »**. Le mécanisme est volontairement agnostique du
visuel : il sert aussi aux instantanés de suite de tests.

Le plan est ordonné par rentabilité, pas par élégance. Les vagues 0 à 2 sont utiles
seules et livrent déjà la demande initiale. La vague 3, qui porte les idées les plus
fortes (voisinages de layout, points de bascule), est **conditionnelle** : elle ne
s'ouvre que si une mesure de la vague 2 le justifie.

## Le mécanisme, en une page

Deux questions distinctes, deux caches :

| question                             | clé                                 | coût d'une erreur |
| ------------------------------------ | ----------------------------------- | ----------------- |
| faut-il **re-rendre** ce scénario ?  | empreinte de la tranche de code     | du CPU            |
| faut-il **redemander à un humain** ? | empreinte de la **preuve produite** | du temps humain   |

D'où la règle centrale : si le code change mais que la preuve est identique,
l'attestation se **reporte automatiquement**, avec la mention « code changé, sortie
inchangée ». C'est ce qui rend le système survivable à un refactor, et ce qui autorise
une empreinte de code volontairement **prudente** — trop grossière ne coûte que du
calcul. Seule une empreinte trop _fine_ est dangereuse.

La preuve n'est pas un PNG mais un **digest de layout** : les mesures du rendu. Stable,
diffable, et surtout : il permet d'assertir automatiquement débordement, troncature,
chevauchement et contraste — donc une grande part de ce qu'on voulait regarder à l'œil
ne demande plus d'œil. Le PNG est conservé, mais uniquement pour l'humain.

## Hors périmètre

- La réduction combinatoire par couverture par paires entre composants. Elle est
  remplacée par la mesure d'inertie (exacte) et la recherche de bascules (mesurée). Si
  elle revient, ce sera comme dernier recours, jamais par défaut.
- Le remplacement de `visualMatrix`. Il reste l'étage bon marché pour le hors-flux
  (modales, popovers, infobulles) et pour les axes purement picturaux, qui n'ont pas de
  voisinage et n'ont aucun besoin d'une page.
- Le stockage distant des preuves. CAS local, régénérable, `.gitignore`.
- Toute forme de comparaison perceptuelle d'images en vague 1-2. Le canal pixel toléré
  est un point de décision de la vague 2, pas un acquis.

## Contraintes globales

- **Le registre est agnostique du sujet.** `@craft-ts/attest` ne connaît ni Playwright,
  ni le DOM, ni les styles. Un sujet est une chaîne, une empreinte et une preuve. Si le
  package doit importer quoi que ce soit de visuel, l'abstraction est fausse.
- **Aucune réduction sans trace.** Toute réduction qui n'est pas exactement vraie
  (échantillonnage de bascules, hypothèse de barrière) est **inscrite dans
  l'attestation**. Une attestation ne dit pas « validé », elle dit « validé, sous telle
  hypothèse ». Une hypothèse qui change fait échouer l'assertion d'exhaustivité.
- **Le déterminisme est une fonctionnalité, pas de l'hygiène.** Il porte deux
  mécanismes indépendants : le report automatique et la dichotomie. Un rendu instable
  fabrique des bascules fantômes _et_ noie la file de revue. Il est livré avant tout
  usage visuel du registre, jamais après.
- **Une empreinte trop grossière est acceptable, une empreinte trop fine ne l'est
  pas.** En cas de doute sur l'inclusion d'un nœud dans une tranche, on l'inclut.
- **La facture est un contrat.** Le nombre de scénarios par page et le diamètre de
  voisinage sont des diagnostics remontés. Quand un budget est dépassé, le système
  **échoue** et nomme la coupure qui règlerait le problème — il ne baisse jamais la
  couverture tout seul.
- **Rien ne s'enregistre à l'import.** Les déclarations vivent dans des fichiers
  `*.visual.ts` découverts par le plugin, exactement comme `*.style.ts`. Aucun effet de
  bord ne part dans le bundle applicatif.
- **Implémentation d'abord, tests ensuite.** Vitest, specs colocalisées, specs de types
  via `libs/test-type`.
- Docs en anglais. Ce plan en français.

## Carte des fichiers

| Fichier                                                 | Responsabilité                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| Modify `libs/dev-tools/src/scripts/dependency-graph.ts` | Identifiants stables (sans numéro de ligne) + hash de source par nœud |
| Create `libs/dev-tools/src/scripts/code-slice.ts`       | Fermeture transitive dans le graphe + empreinte merkle d'une tranche  |
| Create `libs/dev-tools/src/scripts/slice-precision.ts`  | Rejeu d'historique git pour mesurer la précision d'invalidation       |
| Create `libs/attest/src/lib/attestation.ts`             | Modèle : sujet, empreinte, preuve, verdict, hypothèses                |
| Create `libs/attest/src/lib/ledger.ts`                  | Registre : une ligne par attestation, trié, fusionnable sans conflit  |
| Create `libs/attest/src/lib/state.ts`                   | `current` / `renewed` / `review` / `missing` + report automatique     |
| Create `libs/attest/src/lib/evidence-store.ts`          | CAS local des preuves lourdes, hors git                               |
| Create `libs/attest/src/lib/subjects/test.ts`           | Adaptateur sujet `test` : inventaire, empreinte, diff avant/après     |
| Create `libs/attest/src/lib/subjects/visual.ts`         | Adaptateur sujet `visual` : scénario, digest, PNG                     |
| Create `libs/cli/src/lib/commands/attest.ts`            | `status`, `diff`, `why`, `renew`, `review`, `unwatched`               |
| Modify `libs/cli/src/lib/run.ts`                        | Enregistrement de la commande                                         |
| Create `libs/style-testing/src/lib/determinism.ts`      | Horloge, aléatoire, polices, animations, réseau, navigateur épinglé   |
| Create `libs/style-testing/src/lib/digest.ts`           | Digest de layout v1 + signature discrète                              |
| Create `libs/style-testing/src/lib/assertions.ts`       | Débordement, troncature, chevauchement, contraste, cible tactile      |
| Create `libs/style-testing/src/lib/transitions.ts`      | Recherche de bascules par dichotomie sur un paramètre continu         |
| Create `libs/style-testing/src/lib/margin.ts`           | Marge entre le contenu réel et la bascule la plus proche              |
| Create `libs/style-testing/src/lib/review/`             | Serveur local de revue : file, diff, « pourquoi », regroupement       |
| Create `libs/style-testing/src/lib/page.ts`             | `visualPage` : découverte par point fixe, budget (vague 3)            |
| Create `libs/style-testing/src/lib/neighborhood.ts`     | Voisinages mesurés, diamètre, `visualNeighborhood` (vague 3)          |
| Create `libs/style-testing/src/lib/seam.ts`             | `visualSeam` déclaré **et vérifié expérimentalement** (vague 3)       |
| Modify `libs/style/src/plugin/vite.ts`                  | Découverte des fichiers `*.visual.ts`                                 |
| Modify `libs/i18n/src/testing.ts`                       | Pseudo-locale, locale la plus longue mesurée, bornes de tokens        |
| Create `apps/docs/guide/style/attestation.md`           | Documentation                                                         |

## Types à figer

```ts
// libs/attest/src/lib/attestation.ts
export type SubjectKind = 'test' | 'visual' | 'doc-example' | 'api-surface';

export interface Attestation {
  readonly subject: string; // 'visual:route(/users)#viewport=md+query=error'
  readonly kind: SubjectKind;
  readonly fingerprint: string; // merkle de la tranche de code
  readonly evidence: string; // hash de la preuve jugée
  readonly verdict:
    | 'ok'
    | 'ok-with-note'
    | 'rejected'
    | 'known-issue'
    | 'blocked';
  readonly assumptions: readonly Assumption[];
  readonly by: string;
  readonly at: string;
  readonly toolVersion: string;
  readonly note?: string;
  /** Renseigné quand l'attestation a été reportée sans humain. */
  readonly carriedFrom?: string;
  /** Renseigné quand un verdict a couvert une grappe de diffs identiques. */
  readonly cluster?: readonly string[];
}

/** Toute réduction qui n'est pas exactement vraie. */
export type Assumption =
  | {
      readonly kind: 'sampling';
      readonly axis: string;
      readonly samples: number;
      readonly transitions: readonly number[];
    }
  | {
      readonly kind: 'seam';
      readonly node: string;
      readonly closes: readonly SeamDirection[];
      readonly reason: string;
    }
  | { readonly kind: 'neighborhood'; readonly members: readonly string[] };

export type SeamDirection = 'inline' | 'block' | 'baseline' | 'order';

export type AttestationState =
  | 'current' // empreinte inchangée : rien à faire
  | 'renewed' // code changé, preuve identique : reporté sans humain
  | 'review' // preuve différente : file d'attente humaine
  | 'missing'; // sujet jamais attesté
```

```ts
// libs/style-testing/src/lib/digest.ts — LE CHOIX IRRÉVERSIBLE
export interface LayoutDigest {
  readonly digestVersion: 1;
  readonly nodes: readonly LayoutNode[];
  readonly signature: LayoutSignature;
}

export interface LayoutNode {
  readonly path: string; // adresse stable dans l'arbre rendu
  readonly box: readonly [number, number, number, number]; // arrondi au 0.5 px
  readonly intrinsic?: {
    readonly minContent: number;
    readonly maxContent: number;
  };
  readonly text?: {
    readonly content: string;
    readonly lines: number;
    readonly clipped: number;
  };
  readonly styles: Readonly<Record<StyleKey, string>>;
  readonly overflow: { readonly inline: boolean; readonly block: boolean };
  readonly zOrder: number;
}

/** Liste fermée. L'élargir change `digestVersion`. */
export type StyleKey =
  | 'display'
  | 'position'
  | 'color'
  | 'background-color'
  | 'border-width'
  | 'border-radius'
  | 'font'
  | 'letter-spacing'
  | 'opacity'
  | 'visibility'
  | 'transform'
  | 'overflow'
  | 'flex'
  | 'grid-template-columns'
  | 'gap'
  | 'z-index';

/** Les faits DISCRETS. C'est sur eux que la dichotomie cherche des bascules. */
export interface LayoutSignature {
  readonly columns: Readonly<Record<string, number>>;
  readonly lines: Readonly<Record<string, number>>;
  readonly wrapped: readonly string[];
  readonly clipped: readonly string[];
  readonly scrollbars: readonly string[];
  readonly overlaps: readonly (readonly [string, string])[];
}
```

Règle de version : élargir la liste de champs **ne provoque pas** de revalidation en
masse. On recalcule, et si la seule différence tient aux champs nouvellement ajoutés,
l'attestation est reportée automatiquement. Sans cette règle, la v1 est un piège.

---

# Vague 0 — Identité stable et tranche de code

Vague de dérisquage. Elle ne livre aucune fonctionnalité utilisateur : elle prouve que
le graphe sait répondre à « quel code peut changer ce rendu ». Si la mesure de la tâche
3 est mauvaise, tout le reste du plan est bâti sur du sable.

### Tâche 1 — Identifiants stables

Les identifiants portent aujourd'hui le numéro de ligne
(`…/app.ts:state:145`). Déplacer du code de trois lignes change chaque identifiant et
invaliderait la totalité du registre à chaque commit.

Nouvelle forme : `fichier#propriétaire/nom/ordinal`, la ligne devenant une métadonnée
non hachée. Migrer tous les consommateurs (`craft-graph`, `style-architecture`, les
outils MCP, les fichiers `craft-dependency-graph.*` régénérés).

Test décisif : déplacer un bloc de code de vingt lignes dans un fichier de la demo,
régénérer le graphe, vérifier que **l'ensemble des identifiants est inchangé**.

### Tâche 2 — Hash par nœud et fermeture

Un hash de la plage source propre à chaque nœud, puis
`slice(nodeId) → { nodes, fingerprint }` par fermeture transitive dans le graphe et
merkle sur les hashes triés.

Deux points à ne pas rater :

- la fermeture inclut ce qui **produit** le nœud, pas ce qu'il produit ;
- un nœud modifié dans le même fichier qu'un nœud de la tranche, mais absent de la
  fermeture, **ne doit pas** changer l'empreinte. C'est la propriété que la demande
  initiale réclame, et elle se teste directement.

### Tâche 3 — Mesure de précision (POINT DE DÉCISION)

`slice-precision.ts` rejoue les N derniers commits du dépôt. Pour chacun : quels
composants ont réellement changé de rendu (approximé par les fichiers touchés) contre
quelles tranches ont vu leur empreinte bouger.

Deux chiffres à consigner **dans ce fichier** :

- **taux d'invalidation médian** : fraction des tranches invalidées par un commit
  moyen. Attendu : bas. Au-delà de 25 %, le graphe est trop grossier ;
- **faux négatifs** : une tranche dont l'empreinte n'a _pas_ bougé alors qu'un fichier
  de sa fermeture a été modifié. Attendu : **zéro**. Un seul cas est bloquant, c'est le
  mode de défaillance dangereux.

Si le taux d'invalidation dépasse le seuil, la suite n'est pas annulée : elle attend la
tranche observée au rendu (`provideTemplateTrace`, cf. `template-trace-plan.md`), qui
resserre la fermeture aux nœuds réellement touchés. Cette dépendance est le seul lien
entre les deux plans, et elle est facultative.

#### Mesure — 2026-09-05, 20 derniers commits, `apps/demo/tsconfig.graph.json`

```
npx tsx libs/dev-tools/src/bin/craft-slice-precision.ts \
  --tsconfig apps/demo/tsconfig.graph.json --commits 20
```

| chiffre                    | tranche = nœuds seuls | tranche = nœuds **+ fichiers**    | seuil       |
| -------------------------- | --------------------- | --------------------------------- | ----------- |
| taux d'invalidation médian | 0,0 %                 | **0,0 %**                         | ≤ 25 %      |
| taux maximal               | 45,5 %                | 55,8 % (un commit de 88 fichiers) | —           |
| faux négatifs              | 0                     | **0**                             | 0, bloquant |

224 tranches (composants, routes, services). **Le point de décision est franchi**
et la vague 2 est ouverte.

La colonne de droite est celle qui est livrée : elle ajoute le hash de chaque fichier
touché par la fermeture, après le faux négatif décrit plus bas. Ce filet de sécurité
ne coûte **rien à la médiane** — elle reste à 0 % — et ne se paie que sur les gros
commits transverses, où re-rendre est de toute façon la bonne réponse.

Note de vocabulaire : le plan pose « faux négatif » au niveau _fichier_ (« une tranche
dont l'empreinte n'a pas bougé alors qu'un fichier de sa fermeture a été modifié »).
L'outil le mesure au niveau **nœud** — empreinte immobile alors qu'un nœud _de la
fermeture_ a changé de source — parce que c'est le seul mode de défaillance qui ne
puisse être qu'un défaut d'implémentation. Les deux valent zéro dans la version
livrée, puisque le fichier est désormais une feuille.

---

# Vague 1 — Le registre, prouvé sans navigateur

Le mécanisme central, branché d'abord sur les tests. Aucun pixel, aucun Playwright,
aucun déterminisme de rendu requis. À la fin de cette vague, la demande
« instantané de suite de tests, avec avant/après » est livrée en entier.

### Tâche 4 — Modèle et registre

Le format sur disque est **une ligne par attestation, triée par sujet**, pour que deux
branches qui attestent des sujets différents fusionnent sans conflit. Preuves lourdes
dans un CAS `.craft/evidence/<hash>`, hors git.

### Tâche 5 — Calcul d'état et report automatique

`current` / `renewed` / `review` / `missing`. Le report automatique est le cœur : il
inscrit `carriedFrom` avec l'empreinte précédente, de sorte qu'une chaîne de reports
reste auditable jusqu'au jugement humain d'origine.

Test décisif : une attestation dont l'empreinte a changé et la preuve non doit
ressortir `renewed` **sans intervention**, et la chaîne `carriedFrom` doit remonter au
verdict humain initial.

### Tâche 6 — Sujet `test`

Inventaire des tests (fichier, nom complet), empreinte = tranche du corps du test
**union** tranche du code sous test. Le diff avant/après produit cinq catégories :
ajoutés, supprimés, modifiés, **verts alors que le code sous eux a changé**, et
rouges. La quatrième est celle qui n'existe nulle part ailleurs.

### Tâche 7 — CLI

`craft-ts attest status | diff | why <sujet> | renew`. `why` répond en nommant les
nœuds du graphe qui ont bougé dans la tranche — c'est ce qui rend une revue rapide, et
c'est aussi le meilleur outil de débogage du mécanisme lui-même.

`renew --all` est autorisé mais **marqué comme tel** dans les attestations produites :
un renouvellement en masse doit rester visible dans le registre.

### Tâche 8 — Le rapport inverse

`craft-ts attest unwatched` : les nœuds dont l'empreinte a changé et qui
n'appartiennent à la tranche d'**aucun** sujet attesté. « Ce qui a bougé sans que
personne ne regarde. » Sort gratuitement de la machinerie et répond directement au
besoin de vigilance sur l'évolution du projet.

---

# Vague 2 — Déterminisme, digest, et la première boucle humaine

Le produit minimal utile. À la fin de cette vague : « je valide une fois à la main, on
ne me redemande que si le code concerné a bougé » fonctionne réellement, sur les
composants, avec l'énumération `visualMatrix` **existante**. Aucune notion de page, de
voisinage ni de bascule n'est requise.

### Tâche 9 — Harnais déterministe

Horloge gelée, aléatoire seedé, polices sous-settées et embarquées, animations et
transitions coupées, réseau bouché par défaut, version de navigateur épinglée.

Test décisif : cent rendus consécutifs du même scénario produisent **cent digests
identiques**. Tant que ce test n'est pas vert, la vague n'avance pas — le report
automatique et la dichotomie en dépendent tous les deux.

**Vert** — `libs/style-testing/e2e/digest.spec.ts`, Chromium :
`measureDeterminism(…, 100)` → `distinct: 1`. Le test tourne dans un vrai moteur et
pas sous jsdom, qui renvoie zéro pour toutes les boîtes et ferait passer n'importe
quoi.

### Tâche 10 — Digest de layout v1

Les types ci-dessus, `digestVersion: 1`, arrondi au demi-pixel, liste de styles fermée.
Implémenter dès maintenant la règle de migration : à un changement de version, un digest
qui ne diffère que par des champs ajoutés se reporte automatiquement.

### Tâche 11 — Assertions automatiques

Depuis le seul digest : débordement inline et block, texte tronqué, boîtes qui se
chevauchent, contraste insuffisant, cible tactile sous le seuil. Ce sont des
**échecs**, pas des éléments de file d'attente : ils ne demandent aucun humain.

Témoin obligatoire : un composant de la demo dont le titre déborde en allemand doit
faire échouer cette tâche, et le message doit nommer le nœud et le nombre de pixels.

### Tâche 12 — Sujet `visual` sur la matrice existante

Brancher le registre sur `visualMatrix` telle qu'elle est. Empreinte = tranche du
composant, de ses feuilles, de ses variables. Preuve = digest, PNG en accompagnement
dans le CAS.

### Tâche 13 — Surface de revue

Serveur local, file d'attente, pilotage clavier. Chaque carte montre : le rendu, le
rendu approuvé précédent avec son diff **lisible** (« `.card` padding 8→12 »), et
**pourquoi** l'élément est dans la file.

Deux mécanismes anti-abandon, sans lesquels le système meurt au premier refactor :

- le report automatique de la tâche 5 ;
- le **regroupement par forme de diff** : un changement de rayon de bordure produit
  deux cents scénarios au delta identique, une seule décision les couvre, et la grappe
  est inscrite dans chaque attestation.

### Tâche 14 — Bascules sur un emplacement isolé

Dichotomie sur un paramètre continu (nombre de caractères, ordre de grandeur d'un
nombre) en observant la signature discrète du digest. Grille grossière d'abord — huit à
seize points, aux frontières de mots et aux changements de nombre de chiffres — puis
dichotomie dans les seuls intervalles où la signature bouge.

Portée limitée à un composant isolé : pas de voisinage, pas de page. Le résultat est un
ensemble de points `t-1` / `t` par axe, et le nombre d'échantillons part dans
`assumptions`.

### Tâche 15 — Marge avant rupture (POINT DE DÉCISION)

> `userCard/title` : passe à deux lignes à 34 caractères.
> Traduction allemande actuelle : 33. **Marge : 1.**

Un budget (« marge minimale de 15 % au point de bascule ») qui échoue en CI, sans
humain et sans pixel. C'est le signal **prédictif** du plan : il ne dit pas « ça a
cassé », il dit « ça cassera à la prochaine traduction ».

Point de décision : mesurer ici le coût réel de la dichotomie (nombre de rendus, temps
mur) sur trois composants de la demo. **La vague 3 ne s'ouvre que si ce coût est
supportable**, parce qu'elle multiplie ce balayage par le nombre de points d'arrêt du
viewport et par le nombre de voisinages. Consigner les chiffres dans ce fichier.

#### Mesure — 2026-09-05, Chromium, `libs/style-testing/e2e/transitions.spec.ts`

| axe                                | plage          | rendus | temps mur |
| ---------------------------------- | -------------- | ------ | --------- |
| `userCard/title` (caractères)      | 1 → 68         | 15     | 41 ms     |
| `row` (largeur du conteneur, px)   | 80 → 400       | 14     | 50 ms     |
| `cart/total` (grille de magnitude) | 0 → 10 000 000 | 25     | 63 ms     |

**≈ 3 ms par rendu, 14 à 25 rendus par axe.** Le coût est supportable : même
multiplié par cinq points d'arrêt de viewport et cinq voisinages, un axe reste sous
les deux secondes.

Écart assumé : les trois sujets sont des pages-fixtures (`page.setContent`) et non des
routes de la demo. Ce qui est mesuré ici est le coût de la dichotomie et la lecture du
moteur de layout ; brancher une application rendrait un échec ambigu entre le
collecteur et l'app, et obligerait à faire tourner un serveur de dev pour une mesure
qui n'en a pas besoin. Le branchement sur des routes réelles est la première tâche
d'un usage en production.

**Le coût n'ouvre pas la vague 3 à lui seul.** Le second critère — « les vagues 0-2 en
usage réel ont montré que l'étage composant isolé rate des bugs de composition » — ne
peut pas être satisfait avant que le dispositif ait servi. La vague 3 reste donc
fermée, comme prévu.

---

# Vague 3 — La page : voisinages et bascules (CONDITIONNELLE)

> Ne s'ouvre que si la tâche 15 a produit un coût acceptable **et** si les vagues 0-2
> en usage réel ont montré que l'étage composant isolé rate des bugs de composition.
> C'est la partie la plus forte intellectuellement et la plus chère ; elle n'a pas à
> être construite pour que le reste serve.

### Tâche 16 — Découverte des fichiers `*.visual.ts`

Par le plugin, comme `findStyleModules` pour `*.style.ts`. Le fichier devient aussi
l'objet à hacher pour l'empreinte de **l'énumération** elle-même : ajouter un axe doit
invalider la complétude, pas seulement les captures.

### Tâche 17 — Passe d'inertie (réduction exacte)

Un rendu isolé par point d'axe. On mesure la boîte, `min-content`, `max-content`. Si
rien ne bouge, l'axe est **prouvé** sans effet de voisinage : il est purement pictural,
et on le sort du croisement sans hypothèse. C'est la seule réduction exacte de la
vague, et c'est celle qui paie le plus.

### Tâche 18 — Découverte par point fixe

Rendre, découvrir les composants et leurs axes, générer, rendre à nouveau, jusqu'à
stabilisation — un composant qui n'apparaît que dans l'état `error` d'une query a ses
propres axes, invisibles au premier rendu. Condition de terminaison explicite.

Diagnostic de premier plan : un composant que le graphe connaît (arêtes `renders`,
`loads`) et qu'aucun scénario n'a jamais fait apparaître est un trou de couverture.
**« Jamais rendu, donc jamais validé. »**

### Tâche 19 — Voisinages mesurés

Le voisinage est un fait **découvert au rendu**, pas déclaré : on fait varier la
pression d'un nœud et on observe qui bouge. La relation est dirigée (en flux normal, on
pousse vers le bas, pas vers le haut) et les voisinages s'emboîtent.

Sans règle d'arrêt, la fermeture avale la page entière — précisément dans les mises en
page pauvres en barrières, celles où l'outil sert le plus. Donc le **diamètre de
voisinage** est un diagnostic remonté, dans la veine de `unproven`.

### Tâche 20 — `visualSeam`, déclaré et vérifié

```ts
section({ class: layout.scrollArea }, [ProductList()]).pipe(
  visualSeam({
    closes: ['inline'],
    reason: 'Conteneur borné avec défilement interne.',
  }),
);
```

Vocabulaire **fermé** : `inline`, `block`, `baseline`, `order`. Une direction non listée
vaut **ouverte** — `contain: inline-size` ne ferme pas le block, le contenu continue de
pousser ce qui est en dessous, et un défaut inverse créerait un trou muet.

Vérification expérimentale, pas inspection du CSS : rendre à pression minimale puis
maximale, comparer la géométrie **extérieure** au seam. S'il a bougé, le seam ment et le
test échoue avec le nombre. Deux rendus qu'on fait déjà.

La composition du voisinage et le seam qui le clôt partent dans `assumptions` : si la
barrière disparaît, l'exhaustivité échoue au lieu de rester silencieusement fausse.

### Tâche 21 — `visualNeighborhood`, deux opérateurs

`merge` (« ces frères que la mesure croyait indépendants forment une unité ») et
`close` (« c'est l'unité, on ne descend pas »). Ce sont des opérations opposées, et
c'est `close` qui contrôle la facture.

### Tâche 22 — Frères interchangeables

À l'intérieur d'un voisinage le produit complet est requis — six cartes à quatre états
font 4096 combinaisons. Deux réductions le ramènent à une poignée :

- **multiensemble** sur classes d'équivalence : tout au repos ; un à chaque extrême ;
  tout au plus gourmand ; les deux extrêmes les plus opposés, adjacents. Noter que
  `(max, max)` — les deux qui se disputent la place — est généralement pire que
  `(min, max)`, et c'est le cas que l'intuition rate ;
- **positions aux bords seulement** : premier, dernier, un du milieu, et l'élément qui
  bascule le premier à la ligne suivante. Jamais par index.

### Tâche 23 — `visualPage` et budget

```ts
export const productPageVisual = visualPage(productPage, {
  data: {
    productStore: constant({
      /* … */
    }),
  }, // typé, pas un input de descendant
  content: { 'productCard/title': atTransitions() }, // mesuré, pas deviné
  pinned: { 'de-facture-longue': [provideLocale('de-DE'), total(12_345_678)] },
  budget: { scenarios: 60, neighborhoodDiameter: 8 },
});
```

Trois points non négociables, chacun corrigeant un piège identifié :

- **`data`, pas `inputs`.** Adresser l'input d'un descendant par nom nu est intypable,
  ambigu, et surtout : renommer cet input rend la fixture inerte pendant que le
  scénario continue de passer. Fausse couverture silencieuse. Les fixtures surchargent
  les sources de données de la page — l'infra existe (`SERVICE_RUNTIME_OVERRIDES`,
  registre HTTP mocké par route).
- **`atTransitions()` à côté de `constant()`.** Une chaîne écrite à la main teste un
  point arbitraire ; personne ne sait si elle est juste sous le seuil ou très au-delà.
- **`pinned` séparé des axes.** Un cas réel épinglé n'est pas un point d'axe : il ne se
  croise avec rien.

Budget dépassé : le système **échoue**, et le message nomme le voisinage le plus large
et le seam qui le couperait. Ce qui fait de l'outil autant un instrument de qualité de
mise en page qu'un outil de test.

Enfin `assertVisualCoverage(pages, ledger)`, dans un spec, sur le modèle de
`assertExhaustiveVisualMatrix` : échoue si un seam se brise, si la composition d'un
voisinage change, ou si la stratégie d'échantillonnage change.

---

# Vague 4 — i18n

Se branche comme fournisseur d'axes supplémentaire. Ne dépend pas de la vague 3 :
utilisable dès la vague 2 sur des composants isolés.

### Tâche 24 — Locale la plus longue, mesurée

Le catalogue est une valeur TypeScript. Pour une page donnée, calculer la locale qui
maximise la longueur totale des clés effectivement utilisées. Exact, gratuit, aucune
approximation. Un point d'axe, pas N.

### Tâche 25 — Pseudo-locale

Locale générée : allongement de 40 %, encadrement `[[…]]` pour rendre la troncature
visible, accentuation de chaque caractère pour faire ressortir les **chaînes en dur non
externalisées**, paramètres préservés. Elle trouve la casse _future_, avant les
traducteurs.

### Tâche 26 — Pluriels et paramètres

Les catégories déclarées par `plural()` sont des points d'axe **par construction** :
elles sont déjà écrites et déjà vérifiées exhaustives par locale. Les tokens portent un
Standard Schema, donc les valeurs de bord se dérivent : `0`, `1`, frontières CLDR,
`9 999 999` pour un nombre ; court / typique / long / CJK / emoji-ZWJ pour une chaîne.

Distinguer les deux pressions, qui ont des modes de défaillance opposés :
**`min-content` qui monte** (mot insécable, URL, nombre long) empêche la colonne de
rétrécir ; **`max-content` qui monte** (phrase longue mais sécable) vole de la largeur
aux frères dans une piste `auto`. Une phrase longue avec des espaces ne change souvent
pas le `min-content`.

---

## Vérification

```sh
npx vitest run libs/attest
npx vitest run libs/style-testing
npx nx test dev-tools
npx vitest run libs/dev-tools/tests/architecture
npx nx build demo && npx nx lint demo
npx playwright test apps/demo/e2e
node -e "require('./libs/dev-tools/src/scripts/slice-precision.ts')"  # mesure vague 0
craft-ts attest status && craft-ts attest unwatched
```

Vérification humaine, fin de vague 2 : attester une poignée de scénarios, faire un
refactor purement cosmétique du composant (renommer une variable locale, déplacer une
fonction), relancer. **Attendu : aucun élément en file d'attente**, et les attestations
marquées `renewed`. C'est le seul test qui prouve que le dispositif tient la promesse
qui l'a motivé.

Vérification humaine, fin de vague 3 : retirer un `visualSeam` d'un conteneur borné et
vérifier que la suite **échoue en nommant la géométrie qui a bougé** — pas qu'elle
élargit silencieusement le voisinage.

## Risques

- **Le non-déterminisme du rendu.** Il casse deux choses indépendantes : le report
  automatique (la file se remplit sans raison, les humains tamponnent) et la dichotomie
  (bascules fantômes). C'est le risque le plus probable et le plus coûteux du plan,
  d'où le test des cent rendus identiques en tâche 9, bloquant.
- **Une empreinte trop fine rate une régression, en silence.** Le seul mode de
  défaillance dangereux du mécanisme. Mitigé par la mesure de faux négatifs en tâche 3,
  avec un seuil à zéro, et par la règle « en cas de doute, on inclut ».
- **Le renouvellement en masse vide le registre de son sens.** Un `renew --all` qui ne
  laisse pas de trace transforme le registre en tampon. D'où le marquage explicite en
  tâche 7.
- **Le voisinage dégénère à la page entière** dans les mises en page pauvres en
  barrières — celles où l'outil est le plus utile. Le diamètre remonté en diagnostic est
  la seule parade, et il implique d'accepter que l'outil dise « je ne peux pas réduire
  ceci » plutôt que de produire une couverture fausse.
- **La liste de champs du digest est difficile à élargir.** Elle est figée dans chaque
  empreinte de preuve. La règle de migration de la tâche 10 ramène un changement de
  contrat au coût d'un re-rendu ; sans elle, la v1 est un piège. C'est le seul choix du
  plan qui doit être pris **avant** d'accumuler des attestations.
- **La vague 3 peut ne jamais rentabiliser son coût.** Elle est explicitement
  conditionnelle, derrière une mesure. Les vagues 0 à 2 doivent rester utiles et
  cohérentes si elle n'est jamais ouverte — c'est un critère de conception, pas une
  consolation.

## Hypothèses retenues

- Le registre est agnostique du sujet et n'importe rien de visuel.
- L'empreinte de code sert à décider d'un re-rendu ; l'empreinte de preuve sert à
  décider d'une revue humaine. Les confondre est l'erreur de conception à éviter.
- La preuve jugée est le digest de layout ; le PNG est un support de revue, pas la
  référence. Le canal pixel toléré reste un point de décision ouvert de la vague 2.
- `visualMatrix` survit pour le hors-flux et les axes picturaux ; `visualPage` ne le
  remplace pas.
- Les déclarations vivent dans `*.visual.ts`, découvertes par le plugin, jamais
  enregistrées à l'import.
- Toute réduction qui n'est pas exactement vraie est inscrite dans l'attestation, et un
  changement d'hypothèse fait échouer l'exhaustivité.

---

# État de la mise en œuvre — 2026-09-05

Vagues 0, 1, 2 et 4 livrées ; vague 3 volontairement **fermée** (voir la tâche 15).

| tâche                                | état                                                                 | où                                                                                |
| ------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1 · identifiants stables             | fait                                                                 | `dependency-graph.ts`, `code-slice.spec.ts`                                       |
| 2 · hash par nœud, fermeture, merkle | fait                                                                 | `code-slice.ts`                                                                   |
| 3 · mesure de précision              | fait — **0 % médian, 0 faux négatif**                                | `slice-precision.ts`                                                              |
| 4 · modèle et registre               | fait                                                                 | `libs/attest/src/lib/{attestation,ledger}.ts`                                     |
| 5 · état et report automatique       | fait                                                                 | `state.ts`                                                                        |
| 6 · sujet `test`                     | fait                                                                 | `subjects/test.ts`, `test-slice.ts`                                               |
| 7 · CLI                              | fait                                                                 | `libs/cli/src/lib/commands/attest.ts`                                             |
| 8 · rapport inverse                  | fait                                                                 | `attest unwatched`                                                                |
| 9 · harnais déterministe             | fait — **100 rendus, 1 digest**                                      | `determinism.ts`                                                                  |
| 10 · digest v1 + migration           | fait                                                                 | `digest.ts`                                                                       |
| 11 · assertions automatiques         | fait — témoin allemand vert                                          | `assertions.ts`                                                                   |
| 12 · sujet `visual` sur la matrice   | fait — **4 scénarios sur une route réelle**                          | `subjects/visual.ts`, `lib/attest.ts`, `apps/demo/e2e/visual-attestation.spec.ts` |
| 13 · surface de revue                | fait — application CraftTS, API locale, queue dynamique, métadonnées | `lib/review/`, `review-app/`, `libs/cli/src/lib/commands/attest.ts`               |
| 14 · bascules par dichotomie         | fait                                                                 | `transitions.ts`                                                                  |
| 15 · marge avant rupture             | fait — **≈ 3 ms/rendu**                                              | `margin.ts`                                                                       |
| 16 – 23 · la page                    | **non ouvert** (conditionnel)                                        | —                                                                                 |
| 24 · locale la plus longue           | fait                                                                 | `i18n/src/lib/visual-testing.ts`                                                  |
| 25 · pseudo-locale                   | fait                                                                 | idem                                                                              |
| 26 · pluriels et bornes de tokens    | fait                                                                 | idem                                                                              |

## Écarts assumés

- **`carriedFrom` pointe sur l'origine, pas sur l'empreinte précédente.** Le registre
  ne garde qu'une ligne par sujet ; un pointeur vers l'empreinte immédiatement
  précédente casserait la chaîne au deuxième report et l'origine deviendrait
  irrécupérable. Chaque report recopie le pointeur au lieu de le redéplacer, ce qui
  rend « qui a jugé ça, et quand » lisible sur une seule ligne. `by`, `at` et `verdict`
  ne sont jamais rafraîchis par un report.
- **Faux négatifs mesurés au nœud, pas au fichier** (tâche 3, détaillé ci-dessus).
- **Un fichier de plus que la carte** : `libs/dev-tools/src/scripts/test-slice.ts`
  (tranche d'un test) et `libs/style-testing/src/lib/attest.ts` (branchement de la
  matrice sur le registre). Les mettre ailleurs aurait fait entrer ts-morph dans
  `@craft-ts/cli` et `@craft-ts/attest` dans `@craft-ts/style-testing`, c'est-à-dire
  cassé les deux frontières que le plan pose comme contraintes.
- **`text.clipped` ne compte que ce qui est réellement masqué.** Un mot insécable qui
  déborde d'une boîte en `overflow: visible` est un défaut différent, remonté par
  `overflow.inline`. Les confondre faisait lire toute URL comme une troncature.
- **Le manifeste de tranche est adressé par sujet + empreinte**, pas par l'empreinte
  seule. Deux sujets qui partagent une empreinte la partagent parce que leurs tranches
  sont identiques — mais le stockage ne doit pas dépendre de ce que chaque appelant
  respecte cette règle, et l'échec sinon est un `why` qui décrit silencieusement le
  mauvais sujet.

## Vérification

```sh
npx tsc -b tsconfig.json --pretty false
node tools/run-lib-vitest.mjs libs/attest/vitest.config.ts          # 36
node tools/run-lib-vitest.mjs libs/style-testing/vitest.config.mts  # 77
node tools/run-lib-vitest.mjs libs/dev-tools/vitest.config.mts      # 748
node tools/run-lib-vitest.mjs libs/i18n/vitest.config.ts            # 26
node tools/run-lib-vitest.mjs libs/cli/vitest.config.ts             # 55
npx playwright test --config libs/style-testing/playwright.config.ts  # 10, Chromium
CRAFT_VISUAL_REPORT=.craft/runs/design-system.json \
  npx playwright test apps/demo/e2e/visual-attestation.spec.ts \
  --config apps/demo/playwright.config.ts --project chromium          # 1, Chromium
npx tsx libs/cli/src/bin/craft-ts.ts attest status \
  --report .craft/runs/design-system.json \
  --tsconfig apps/demo/tsconfig.graph.json
npx tsx libs/dev-tools/src/bin/craft-slice-precision.ts \
  --tsconfig apps/demo/tsconfig.graph.json --commits 20
```

Deux échecs préexistants dans `libs/cli/src/lib/demo-manifests.spec.ts` : ils
demandent un `dist/apps/demo` construit, absent d'un worktree neuf. Sans rapport avec
ce plan.

## Vérification sur une route réelle — 2026-09-05

`/design-system` est maintenant capturée dans les quatre cellules de la matrice du
thème : `base`, `scheme=dark`, `viewport=md` et leur combinaison. Le rapport emploie
l'identifiant portable
`component:apps/demo/src/app/examples/design-system/design-system-demo.ts:designSystemDemo` ;
la CLI l'a résolu contre `apps/demo/tsconfig.graph.json` et a calculé :

- une empreinte de tranche commune aux quatre scénarios ;
- quatre digests distincts ;
- `missing: 4` dans un ledger vide, puis une file locale de **4 éléments et 4
  décisions**. Une première capture ne possède aucun delta comparable et n'est
  donc jamais regroupée avec une autre.

La surface initiale en HTML statique a été remplacée par une application CraftTS.
Elle consomme une API locale tenue par la CLI, actualise les compteurs après chaque
écriture confirmée, garde une carte visible en cas d'échec, expose les actions par
boutons et raccourcis, et centre la preuve dans un canvas avec zoom ajusté/réel.
Chaque capture transporte aussi son viewport, la taille de l'élément capturé, le
schéma de couleur, le navigateur et le sélecteur racine. Pour le témoin actuel,
`base` vaut explicitement `375×900` et `viewport=md` vaut `768×900` ; ce sont des
faits affichés, plus une convention implicite.

Aucun verdict n'a été écrit pendant cette vérification : le premier jugement reste
nécessairement humain. Les rapports et PNG vont dans `.craft/runs/`, hors git ; le
ledger reste versionné.

## Contradiction trouvée dans le plan, et comment elle a été tranchée

La vérification humaine de fin de vague 2 a été faite pour de vrai, sur
`/design-system` de la demo. Elle a mis au jour un **faux négatif**, c'est-à-dire le
seul mode de défaillance que le plan déclare bloquant.

Le plan demande deux choses qui s'excluent :

1. **Tâche 2, deuxième point** — « un nœud modifié dans le même fichier qu'un nœud de
   la tranche, mais absent de la fermeture, **ne doit pas** changer l'empreinte. C'est
   la propriété que la demande initiale réclame. »
2. **Contraintes globales et risques** — « en cas de doute sur l'inclusion d'un nœud
   dans une tranche, on l'inclut » ; « faux négatifs, attendu : zéro. Un seul cas est
   bloquant. »

Le cas concret : dans `design-system-demo.ts`,

```ts
const initialShowcase = () => ({ tone: 'info', size: 'md', progress: 40 });
```

n'est pas une primitive craft. Le graphe ne le modélise donc pas, il n'appartient à
aucune fermeture, et il n'a pas de hash. Passer `progress` de 40 à 55 **change le
rendu** et ne bougeait **aucune empreinte** : `current 4`, personne n'est prévenu,
jamais.

Ce n'est pas un cas de coin. Toute fonction utilitaire de module — une valeur par
défaut, un formateur, un comparateur — est dans ce trou.

### Arbitrage

Le plan tranche lui-même : trop grossier est acceptable, trop fin ne l'est pas. Chaque
tranche porte donc, **en plus** des hashes de nœuds, un hash par fichier qu'elle
touche (`fileLeavesOf` dans `code-slice.ts`). La garantie devient explicite au lieu
d'être un accident de quels types de nœuds portent une plage source.

Le prix est exactement celui que le plan dit supportable : un refactor cosmétique
re-rend le composant et ressort **`renewed`** — le report automatique l'absorbe, la
file de revue reste vide, aucun humain n'est dérangé. C'est la promesse initiale,
tenue ; ce qui est perdu, c'est seulement le calcul économisé.

### Boucle vérifiée de bout en bout, sur du vrai code

| geste                                         | attendu               | obtenu                                  |
| --------------------------------------------- | --------------------- | --------------------------------------- |
| attester 4 scénarios de `/design-system`      | —                     | `current 4`                             |
| déplacer `constant` de 20 lignes (cosmétique) | rien en file          | **`renewed 4`**, `review 0`             |
| `progress: 40 → 55` (vrai changement)         | re-rendu              | **`renewed 4`** (empreinte bougée)      |
| recapturer après ce changement                | un humain             | **`review 4` — « the output changed »** |
| `attest why <sujet>`                          | nommer ce qui a bougé | 3 nœuds `property:` nommés              |

### Ce qui reste ouvert

La fermeture **exacte** existe : au lieu de hacher le fichier entier, résoudre les
identifiants référencés dans la plage source d'un nœud jusqu'à leurs déclarations, et
inclure celles-là. `initialShowcase` rentrerait dans la tranche parce qu'il est
référencé ; un voisin que personne n'appelle resterait dehors. Cela satisferait les
deux exigences au lieu d'en sacrifier une. C'est un travail de graphe non trivial et
il n'a pas été fait : la version sûre est livrée, la version précise est un choix à
prendre.

## Vérification humaine restant à faire

- **Fin de vague 2.** Attester une poignée de scénarios, faire un refactor purement
  cosmétique (renommer une variable locale, déplacer une fonction), relancer
  `craft-ts attest status`. Attendu : rien en file d'attente, attestations `renewed`.
  Le mécanisme est couvert par `state.spec.ts` et `attest.spec.ts`, et la stabilité des
  identifiants par `code-slice.spec.ts` — mais la boucle complète sur du vrai code n'a
  pas encore été faite à la main.
