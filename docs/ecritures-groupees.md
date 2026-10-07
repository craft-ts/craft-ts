# Écritures groupées : pourquoi un changement ne doit dessiner qu'une fois

Date : 2026-10-07. Public : l'équipe qui écrit ou relit du code réactif de craft-ts.
Ce document explique un défaut du moteur de rendu, son correctif, ce que le correctif garantit
et ne garantit pas, et la règle à suivre pour ne pas le réintroduire. L'inventaire des autres
endroits touchés est dans [`ecritures-groupees.rapport.md`](./ecritures-groupees.rapport.md).

## 0. En bref

- Les effets de craft-ts sont **synchrones** : écrire un signal relance tout de suite ceux qui le lisent.
- Donc **N écritures à la suite = N relances**, chacune sur un état à moitié écrit.
- `ComponentRenderedNode.patch` écrivait les entrées d'un composant une par une. Un composant à
  N entrées qui changent était dessiné N+1 fois, et chaque copie recommençait sur ses enfants :
  le coût se **multipliait** avec la profondeur.
- Le correctif tient en un mot : `craftBatch`. Les écritures d'un même changement logique sont
  publiées ensemble, après la dernière.
- Sur la navigation de `apps/docs-herbier`, mesurée ici : **12 511 exécutions de template → 79**.

## 1. Le modèle

### Effets synchrones

craft-ts s'appuie sur `alien-signals` (3.2.1 dans le dépôt). Ce que fait une écriture, lu dans
`node_modules/alien-signals/esm/index.mjs` (`signalOper`, `flush`) :

1. `signal.set(v)` range la valeur, marque le signal « sale » et **met en file** les effets qui le lisent ;
2. si aucun lot n'est ouvert (`batchDepth === 0`), `flush()` **les exécute tout de suite**, avant que `set` ne rende la main.

```
count.set(1)  ──►  propage  ──►  met l'effet en file  ──►  flush()  ──►  l'effet tourne
                                                                         (avant le retour de set)
```

`craftWatch` est un `effect` d'`alien-signals`. Un template de composant est exécuté par un effet
(`component-render`, voir `libs/component/src/lib/render/interpreter.ts`). Donc **écrire une entrée
d'un composant redessine ce composant avant l'écriture suivante**.

Une écriture faite **depuis un effet qui tourne** déclenche aussi un `flush` immédiat, imbriqué :
la file est partagée, les effets en attente tournent à l'intérieur de l'effet courant. C'est ce qui
a produit la pile d'appels imbriquée observée sur le routeur (§ rapport, cas 1).

### Ce que font `startBatch` / `endBatch`

```ts
export function startBatch() { ++batchDepth; }
export function endBatch()   { if (!--batchDepth) flush(); }
```

C'est un compteur. Tant qu'il est positif, `set` **marque et met en file, mais ne lance rien**. Le
`flush` a lieu à la sortie du lot le plus extérieur. `craftBatch(fn)` (`libs/core/src/lib/host/craft-signal.ts`)
est `startBatch(); try { return fn(); } finally { endBatch(); }`.

Ce qui est **différé** : les *effets*. Ce qui ne l'est **pas** : les *lectures*. Lire un signal, ou un
`computed`, dans un lot rend la valeur à jour (`signalOper` valide la valeur en attente à la lecture).
C'est épinglé par `libs/core/src/lib/host/craft-batch.spec.ts`.

## 2. Pourquoi N entrées donnent N+1 rendus, et pourquoi le coût se multiplie

Un composant reçoit ses entrées dans des signaux, un par entrée, plus un signal pour les propriétés
d'hôte. Avant le correctif, `patch` faisait :

```ts
this.propKeys.forEach((key, index) => this.propSources[index].set(props[key])); // N écritures
this.hostPropsSource.set(hostPropsFromComponentProps(props));                    // +1
```

Chaque `set` relançait l'effet `component-render` : le template tournait **avec la nouvelle valeur de
cette entrée et l'ancienne valeur des suivantes**. D'où deux défauts : N+1 exécutions au lieu d'une,
et N exécutions sur des états incohérents que personne n'a voulu produire.

« N » compte les entrées dont la **valeur change**. Une entrée passée comme `function* () { … }` est
une fonction neuve à chaque dessin du parent : elle change toujours. Une référence stable (`props.badge`)
ne change pas et ne relance rien. L'objet des propriétés d'hôte est refait à chaque patch : c'est le « +1 ».

### La cascade parent → enfant

Un composant qui se redessine **patche ses enfants dans son propre template**. Chacune de ses N+1
exécutions patche donc chaque enfant, et chaque patch d'enfant refait la même chose pour ses propres
enfants. Les facteurs se **multiplient** le long d'une branche :

```
Parent P  (reçoit 1 changement logique)
│
│  P.patch écrit 11 entrées  ───────────►  P dessiné 12 fois        (11 + 1)
│
├── à chacun de ces 12 dessins, P patche son enfant E
│       E.patch écrit 10 entrées  ──────►  E dessiné 11 fois par dessin de P
│                                          soit 12 × 11 = 132 dessins de E
│
└── à chacun de ces 132 dessins, E patche ses enfants (icônes, boutons…)
        chaque icône : 7 939 dessins au total sur la navigation mesurée

              profondeur 1       profondeur 2          profondeur 3
 sans lot :       12          ×     11  = 132      ×  …  = 7 939 (DocIcon)
 avec lot :        1          ×      1  =   1      ×  …  =    28 (20 instances)
```

Les chiffres de cette section sont ceux de la mesure du § 6 : `DocLayout` 12, `DocNavbar` 132,
`DocIcon` 7 939 sans lot ; 1, 1 et 28 avec lot. `12 × 11 = 132` colle avec « DocLayout : 11 entrées qui
changent + l'hôte » puis « DocNavbar : 10 + l'hôte ». Je n'ai pas recompté une à une les entrées de
`DocNavbar` qui sont des références stables ; la cohérence des produits est le seul recoupement fait.

Avec le lot, le nombre de dessins d'un composant par patch du parent est **un**, quel que soit N :
la cascade ne multiplie plus, elle s'additionne (un dessin par composant touché).

## 3. Pourquoi ce n'était pas visible

- **L'état final est juste.** La dernière des N+1 exécutions voit toutes les entrées à jour. L'écran,
  le DOM et les tests de contenu sont corrects ; seuls le temps et les états intermédiaires diffèrent.
- **Aucun test ne comptait.** Les tests regardaient ce qui est affiché, pas combien de fois le template
  avait tourné. Un rendu superflu ne fait échouer aucune assertion de contenu.
- **Les démos ont peu d'entrées.** À 2 ou 3 entrées, `(N+1)` par niveau est petit ; le coût explose avec
  des composants de cadre à 10 entrées imbriqués sur trois niveaux, comme ceux de `docs-ui`.
- **Le chemin de l'hydratation ne patche pas.** À la création, `ComponentRenderedNode` construit ses
  signaux d'entrée **une fois** avec les valeurs initiales (`signal(props[key])`, constructeur) : pas
  d'écriture, donc pas de cascade. Seul le **re-dessin d'un parent** passe par `patch`. Une page
  hydratée en ~100 ms pouvait donc coûter 280 à 500 ms à chaque navigation SPA.
- **La boucle est ancienne.** Elle date de `0bf05dda04` (24 juillet 2026). `craftBatch` n'a été ajouté
  que le 17 août (`5c95e956d1`), et seulement pour `craft-resource.ts` : le besoin y était apparu
  (une ressource vue à moitié dans son ancien état), pas dans le rendu.

## 4. Le correctif, ses garanties, ses limites

### Le correctif

`ComponentRenderedNode.patch` écrit ses N entrées et les propriétés d'hôte dans un seul `ɵcraftBatch`
(`libs/component/src/lib/render/interpreter.ts`, `ɵcraftBatch` exporté par `libs/core/src/index.ts`).
Test : `libs/component/src/lib/component-props-batch.spec.ts`. Il échoue sans le correctif
(il voit `2-1-1` puis `2-2-1`) et passe avec (`1-1-1`, puis `2-2-2` : un dessin, jamais d'état mêlé).

### Ce que le lot garantit

- **Une écriture logique = un rendu.** Les effets qui lisent les signaux écrits tournent une fois,
  après la dernière écriture.
- **Aucun état intermédiaire n'est observable par un effet ou un template.**
- **Les lots imbriqués se fondent dans le plus extérieur** : une fonction qui se groupe elle-même peut
  être appelée depuis un autre lot sans changer le résultat (utilisé dans les formulaires, où l'écriture
  d'un champ enfant et la propagation à ses parents forment un seul lot).

### Les écritures d'un lot sont-elles lues avant `endBatch` ?

**Oui, et elles sont à jour.** Dans le lot, `signal()` et un `computed` qui en dépend rendent les valeurs
déjà écrites. Seuls les **effets** attendent. Conséquence : le code *dans* le lot voit chaque étape ;
c'est voulu, c'est lui qui écrit. Test : `craft-batch.spec.ts`, « lets the code inside read what it has
just written ».

### Y a-t-il des effets qui comptent sur l'ordre intermédiaire ?

Oui : **trois cas relevés** où un effet *doit* tourner entre deux écritures. Ils sont la raison pour
laquelle on ne regroupe pas « tout ce qui est consécutif ».

1. **Le rejeu (`ɵwithCraftReplay`).** L'historique de machine restaure des primitives sous un drapeau
   synchrone ; une ressource lit ce drapeau, quand son effet tourne, pour *ne pas recharger* (`craft-resource.ts`,
   `if (isCraftReplaying()) return`). Si le lot englobe la restauration, les effets tournent **après** la
   sortie du drapeau et la ressource recharge. Vérifié par expérience : regrouper `goTo` fait échouer
   « reloads a resource the snapshot could not capture » (`['a','b','b','a']` au lieu de `['a','b','a']`).
   `goTo` reste donc **non regroupé** (commit de l'historique).
2. **Le flush synchrone de l'outlet.** `commit()` appelle `syncTemplateFlush()` après avoir publié la page ;
   ce flush doit voir l'état publié. Le lot de `commit()` se ferme **avant** cet appel, et aucun lot
   extérieur n'englobe `showComponent` (§ rapport, cas 1).
3. **Les événements portés par un signal.** Deux écritures successives du **même** signal dans un lot
   n'en laissent voir que la dernière : la première valeur n'est jamais notifiée. À ne pas regrouper si
   chaque valeur est un événement (`signal-source.ts` le dit : « No synchronous intermediate value
   reactions »). Aucun des lots posés ici n'écrit deux fois le même signal.

Il existe aussi des ordres d'écriture voulus qui ne dépendent pas des effets : `query.ts` écrit les
paramètres puis incrémente le déclencheur en dernier, `commit()` du routeur publiait la cible en dernier.
Dans un lot l'ordre n'a plus d'effet sur les observateurs ; il reste inoffensif.

### Que se passe-t-il si une exception est levée au milieu du lot ?

Vérifié dans `craft-batch.spec.ts` et par une sonde :

- **Pas d'annulation.** Les écritures déjà faites restent. `craftBatch` utilise `try/finally` : le compteur
  est toujours rétabli, donc le lot est bien fermé.
- **Les effets tournent une fois, sur l'état à moitié écrit**, puis l'exception remonte à l'appelant.
  Conséquence pratique : on ne sort pas d'un lot au milieu d'une paire ; on prépare les valeurs (et les
  validations qui peuvent lever) **avant** d'ouvrir le lot, comme `queryParams.navigate` qui encode tous
  les paramètres avant d'écrire.
- **Un effet qui lève pendant la publication** interrompt la publication : les effets mis en file *après
  lui* ne tournent pas pour cette publication (les suivants sont marqués pour la prochaine écriture). C'est
  identique avec ou sans lot, mais **un lot rassemble plusieurs écritures dans une seule publication** :
  le rayon d'un effet défaillant y est plus large. Le lot est cependant fermé, une écriture ultérieure
  publie normalement.

### Ce que le lot ne résout pas

- **Les chaînes d'effets.** Un effet qui écrit un signal qu'un autre effet lit ajoute une étape, lot ou
  non : `craftEffect` passe par deux effets (un effet externe qui ne lit qu'un compteur d'invalidation, et un `craftWatch` interne qui exécute le corps une fois puis se contente d'incrémenter ce compteur quand une dépendance change, ce qui relance l'externe),
  `preservedResource` recopie la valeur brute par un effet, `afterRecomputation` dérive par un effet. Le
  remède est de dériver par un `computed`, pas de grouper. Rencontré : après le lot, `resourceById.set`
  change la liste des clés d'un coup, mais la valeur d'une clé conservée arrive un effet plus tard.
- **L'asynchrone.** Un lot est synchrone. Des écritures séparées par un `await` ne sont pas groupées.
- **Une écriture faite dans un effet** relance la file immédiatement (§ 1). Si l'effet écrit plusieurs
  signaux, il groupe lui-même.
- **Ce qui est dessiné deux fois par conception.** Après correctif, `DocOutline` et `DocFooter` tournent
  deux fois par navigation : le plan de la page est enregistré par `DocPage`, rendu après eux. C'est un
  flux de données, pas une écriture non regroupée.

## 5. La règle pour la suite

> **Quand une fonction écrit plusieurs signaux qu'un même lecteur peut lire ensemble, elle les écrit
> dans un seul `craftBatch`.**

Trois questions décident :

1. Y a-t-il **deux signaux ou plus** écrits dans la même fonction synchrone ?
2. Un lecteur (template, effet, `computed` lu par un effet, code appelant) peut-il les lire **ensemble**,
   ou lire l'un sous condition de l'autre (valeur et statut, valeur et `dirty`, curseur et liste) ?
3. Aucun effet ne doit-il tourner **entre** les écritures (rejeu, flush synchrone, événements sur un
   même signal) ? Si oui, ne regroupe pas, et dis pourquoi en commentaire.

Trois oui/oui/non : un lot. Autrement :

- les valeurs **toujours lues ensemble** vont dans **un seul signal** (un objet), comme le `state` de
  `DocLayout` : il n'y a plus de paire à protéger ;
- n'enveloppe jamais dans un lot un appel qui doit voir les effets publiés (`syncTemplateFlush`, un drapeau
  ambiant) ; ferme le lot avant.

### Comment le tester : le témoin et le compteur

On ne teste pas « le résultat est juste » (il l'est), on teste **ce que le lecteur a vu à chaque exécution**.

**Le témoin** : un effet qui note l'état qu'il lit, et une assertion sur la liste complète des
observations. Une seule observation, sur un état qui existe :

```ts
const seen: string[] = [];
const watch = craftWatch(() => {
  seen.push(`${field.value()}|${field.dirty()}`);
});
seen.length = 0;                       // on ne garde que ce que le changement produit

field.set('a@b.c');

expect(seen).toEqual(['a@b.c|true']);  // jamais 'a@b.c|false' avant
```

**Le compteur de rendus** : un composant témoin qui note chaque exécution de son template, comme
`component-props-batch.spec.ts` et `craft-router-outlet-page-swap.spec.ts` :

```ts
const drawn: string[] = [];
const Child = craftComponent('Child', {}, function* (props: ChildInput) {
  drawn.push(`${yield* props.a()}-${yield* props.b()}`);   // un push par exécution
  return p('…');
});
…
expect(drawn).toEqual(['1-1', '2-2']);   // un dessin par changement, jamais ['1-1', '2-1', '2-2']
```

Exiger trois choses d'un test de ce type :

1. il **échoue avant le correctif** (le lancer sur le code non corrigé, pas seulement sur le code corrigé) ;
2. il compare la **liste entière** des observations, pas seulement la dernière ;
3. le lecteur lit **tous** les signaux du groupe, comme le vrai lecteur : un témoin qui ne lit qu'un
   signal ne peut pas voir la paire.

Un piège de test : un nom d'entrée de composant comme `id`, `title`, `lang`, `hidden`, `start`,
`autofocus` est pris par l'hôte et n'arrive pas au template.

## 6. Résultats mesurés et protocole

### Résultats

Scénario : `apps/docs-herbier`, page `/guide/` hydratée, puis un clic sur le lien vers
`/guide/state/local-state` (navigation SPA), dans jsdom, Node 22. Mesure de l'exécution des templates par
`definition.name`. Huit passes alternées (quatre sans lot, quatre avec) ; la première paire chauffe le JIT et n'est pas retenue pour les médianes.

| | sans lot (avant) | avec lot (après) |
|---|---|---|
| exécutions de template, total | **12 511** | **79** |
| composants concernés | 25 | 25 |
| `DocLayout` (1 instance) | 12 | 1 |
| `DocNavbar` (1 instance) | 132 | 1 |
| `DocIcon` (20 instances) | 7 939 | 28 |
| `DocNavLink` (3 instances) | 1 080 | 3 |
| `DocField` | 641 | 3 |
| temps mur de la navigation, jsdom | 503 à 761 ms (passe de chauffe : 761 ; médiane des trois suivantes : 520 ms) | 146 à 153 ms (médiane des trois suivantes : 148 ms) |

Les nombres d'exécutions sont **identiques à chaque passe**. Le temps mur varie ; il est mesuré dans
jsdom, plus lent qu'un navigateur : le gain est d'environ 3,5 fois ici (520 ms → 148 ms). Mesuré dans un navigateur
(par l'auteur du correctif) : **280 à 500 ms → 12 à 53 ms** par navigation, `DocNavbar` dessinée 132 fois
puis 1 fois. Ce protocole retrouve les mêmes `132` et `12` que cette mesure.

Le « profil » imprimé par le harnais est **indicatif** : il inclut la surcharge du profileur et peut
dépasser le temps mur. Seuls le compte d'exécutions et le temps mur font foi.

### Protocole pour reproduire

Prérequis : Node 22, depuis la racine du dépôt (ou d'un worktree) :

1. **Instrumenter** : appliquer le patch `docs/ecritures-groupees.mesure.patch`. Il ajoute deux choses
   à `libs/component/src/lib/render/interpreter.ts` : un appel `globalThis.__craftRun(nom, instance)`
   dans l'effet `component-render`, et un interrupteur `globalThis.__craftUnbatched` qui remet la boucle
   d'écritures d'avant le correctif.
   ```bash
   git apply docs/ecritures-groupees.mesure.patch
   ```
2. **Poser le harnais** : copier `docs/ecritures-groupees.mesure.spec.ts.txt` en
   `apps/docs-herbier/src/measure.local.spec.ts`. (`.txt` pour qu'aucun outil ne le prenne pour un test.)
   Il hydrate la page, branche les compteurs (runs et instances par `definition.name`), ouvre une
   `Session` de `node:inspector` (le profil du worker n'est pas rendu par `NODE_OPTIONS=--cpu-prof`),
   clique le lien, attend que le focus arrive sur `#main`, puis attend un tour de boucle avec un
   `MessageChannel` : dans un onglet caché, `setTimeout` est étranglé à 1 s, un `MessageChannel` non.
3. **Lancer** :
   ```bash
   MEASURE_OUT=/tmp/render-count.txt npx vitest run --config apps/docs-herbier/vitest.config.ts apps/docs-herbier/src/measure.local.spec.ts
   cat /tmp/render-count.txt
   ```
4. **Retirer l'instrumentation** (rien de tout cela ne se committe) :
   ```bash
   git checkout libs/component/src/lib/render/interpreter.ts
   rm apps/docs-herbier/src/measure.local.spec.ts
   ```

Dans un navigateur : même instrumentation, mais **mesurer avec un `MessageChannel`**, pas avec `setTimeout`
(onglet caché = timers à 1 s).

## 7. Ce que cette étude n'a pas couvert

- Seuls `libs/core` et `libs/component` ont été fouillés à la main ; `libs/docs-ui`, `libs/effect`, `libs/i18n*`,
  `libs/style` et `apps/docs-herbier` ont été passés au même détecteur (écritures consécutives de
  `.set`/`.update`, 25 lignes de fenêtre) : seules des écritures dans des `Map` en sont ressorties.
- Le détecteur cherche `.set(` et `.update(`. Il ne voit pas une écriture faite par un autre moyen (appel
  d'un signal avec valeur, méthode de primitive), ni deux écritures séparées par plus de 25 lignes ou
  réparties dans deux fonctions qui s'appellent.
- La navigation de `docs-herbier` écrit la page puis émet un événement DOM qui ferme tiroir, recherche et
  menus : deux étapes. Les regrouper donnerait un seul dessin pour ces fermetures ; **non fait**, c'est une
  optimisation de l'application, pas ce défaut, et `whenDrawn` s'appuie sur le calendrier des mutations.
- Aucune mesure n'a été refaite dans un navigateur réel pour ce document.
