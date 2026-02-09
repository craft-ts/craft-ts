𝐂𝐨𝐦𝐦𝐞𝐧𝐭 𝐝𝐞𝐯𝐞𝐧𝐢𝐫 𝐮𝐧 𝐦𝐞𝐢𝐥𝐥𝐞𝐮𝐫 𝐝é𝐯𝐞𝐥𝐨𝐩𝐩𝐞𝐮𝐫 𝐀𝐧𝐠𝐮𝐥𝐚𝐫 𝐞𝐧 𝐮𝐧𝐞 𝐣𝐨𝐮𝐫𝐧é𝐞 ?
La réponse 👉 hashtag#𝐍𝐠𝐁𝐚𝐠𝐮𝐞𝐭𝐭𝐞𝐂𝐨𝐧𝐟

3 points :

1️⃣ La première :
Les conférences prévues sont incroyables. Je suis sûr que je vais apprendre plein de choses.

C’est exactement ce que j’attendais.

Je pense qu’assister à ce genre d’événement va me permettre d’améliorer mes compétences. C’est quelque chose qui manque à mon parcours.

2️⃣ La deuxième :
Je vais moi aussi donner une conférence où je t’aiderai à maîtriser l’art du typage pour le mettre à ton service.

C’est le genre d’informations que j’aurais aimé avoir quand j’ai commencé à m’intéresser au typage en TypeScript.

💎 𝐋𝐞 𝐦𝐞𝐢𝐥𝐥𝐞𝐮𝐫 𝐩𝐨𝐮𝐫 𝐥𝐚 𝐟𝐢𝐧 (😉 je rigole)

3️⃣ La troisième :
Je vais pouvoir discuter avec des passionnés d’Angular.

C’est aussi un privilège d’avoir ce genre d’occasion. Je sais d’avance que cela va beaucoup m’apporter, et sans doute de façon réciproque.

👉 Donc prends vite ta place et envoie-moi un message pour me dire que tu y participes.

---

Petite avancée sur mon projet de lib de State Management

Je viens d'ajouter une fonctionnalité appelée 𝐢𝐧𝐬𝐞𝐫𝐭𝐄𝐧𝐭𝐢𝐭𝐢𝐞𝐬.

Je tenais à ce qu'elle soit prête avant de lancer plus officiellement ma librairie, car elle m'a permis de valider un concept.

J'ai trouvé un moyen beaucoup plus simple de créer des fonctions génériques, compatibles avec chaque state.

Désormais, j'expose systématiquement les fonctions 𝐬𝐞𝐭 et 𝐬𝐭𝐚𝐭𝐞 de chaque primitive state (cf. la doc, qui sera bientôt disponible).

Cela simplifie la composition des primitives states via une approche réutilisable/composable.

> Il me reste encore à valider l'ensemble du concept avec la fonctionnalité 𝐢𝐧𝐬𝐞𝐫𝐭𝐋𝐨𝐜𝐚𝐥𝐒𝐭𝐨𝐫𝐚𝐠𝐞𝐏𝐞𝐫𝐬𝐢𝐬𝐭𝐞𝐫, car stocker le résultat de queries pouvant s'exécuter en parallèle n'est pas sans contraintes.

Revenons à 𝐢𝐧𝐬𝐞𝐫𝐭𝐄𝐧𝐭𝐢𝐭𝐢𝐞𝐬 : elle permet de connecter facilement des utilitaires pour manipuler des listes de données.

Et peuvent se plugger sur l'ensemble des primitives states.

Pour les states qui n'exposent pas directement une liste, il est obligatoire (type-safety first) de fournir le chemin d'accès vers une liste.

De mon point de vue, la solution finale offre une excellente DX, en réduisant encore les frictions liées à la manipulation de listes.

Ci-joint un PDF que j'ai généré via l'IA. (Pour un petit overview).

Je dois encore améliorer le rendu, mais je vais faire ça en baby steps.

PS : la lib ne s'appellera finalement pas @𝐧𝐠-𝐜𝐫𝐚𝐟𝐭, car le nom était déjà pris. Ce document ne fait donc pas office de documentation officielle, mais plutôt d'aperçu.

---

Astuce pour déboguer les Signals d’Angular avec Angular DevTools

Je mets en place pas mal de tooling et des fonctions utilitaires basées sur les 𝐒𝐢𝐠𝐧𝐚𝐥𝐬, ce qui m’aide à écrire du code plus déclaratif.

Mais parfois, je tombe sur des erreurs comme celle-ci :

```
ERROR Error: Detected cycle in computations.
```

Le problème, c’est qu’il n’y a 𝐚𝐮𝐜𝐮𝐧𝐞 𝐢𝐧𝐝𝐢𝐜𝐚𝐭𝐢𝐨𝐧 𝐜𝐥𝐚𝐢𝐫𝐞 sur l’origine du bug.

À la lecture du code, à part quelques changements récents, rien ne permet d’identifier facilement la cause.

En cherchant comment obtenir plus d’informations, j’ai découvert — grâce à une suggestion de Matthieu Riegler qu’on peut utiliser 𝐀𝐧𝐠𝐮𝐥𝐚𝐫 𝐃𝐞𝐯𝐓𝐨𝐨𝐥𝐬 et plus précisément le 𝐒𝐢𝐠𝐧𝐚𝐥 𝐆𝐫𝐚𝐩𝐡.

Je ne maîtrise pas encore l’outil à 100 %, mais il peut aider à 𝐯𝐢𝐬𝐮𝐚𝐥𝐢𝐬𝐞𝐫 𝐥𝐞𝐬 𝐝é𝐩𝐞𝐧𝐝𝐚𝐧𝐜𝐞𝐬 𝐞𝐧𝐭𝐫𝐞 𝐥𝐞𝐬 𝐬𝐢𝐠𝐧𝐚𝐥𝐬 et à repérer celui qui pose problème.

- Ajouter des `debugName` sur les signals (pour une identification plus précise)
- Ouvrir Angular DevTools
- Inspecter le 𝐒𝐢𝐠𝐧𝐚𝐥 𝐆𝐫𝐚𝐩𝐡 (il faut avoir activer l'option dans les paramètres)

Exemple :

```ts
// Create a signal with a debug name to identify it easily in DevTools
const count = signal(0, { debugName: 'countSignal' });
```

Avec des noms explicites, on identifie beaucoup plus vite les signals concernés dans le graphe.

Même si ça ne suffit pas toujours à résoudre immédiatement le problème, ça permet de 𝐠𝐚𝐠𝐧𝐞𝐫 𝐝𝐮 𝐭𝐞𝐦𝐩𝐬 𝐩𝐨𝐮𝐫 𝐭𝐫𝐨𝐮𝐯𝐞𝐫 𝐥𝐞𝐬 𝐜𝐨𝐮𝐩𝐚𝐛𝐥𝐞𝐬.

De mon côté, il faut encore que je creuse.
Activez pour voir l’im

---

Réflexion sur Signals vs RxJS

Ma réflexion sur les 𝐒𝐢𝐠𝐧𝐚𝐥𝐬 vs 𝐑𝐱𝐉𝐒 a évolué. J’arrive maintenant à mieux formuler ce qui ne va pas, ou ce qui me manque (de mon point de vue).

> Il n’existe pas d’utilitaires proposés par Angular permettant à un Signal de réagir 𝐝𝐞 𝐟𝐚ç𝐨𝐧 𝐬𝐲𝐧𝐜𝐡𝐫𝐨𝐧𝐞 à un événement ou à une action afin de mettre à jour son état.
> Cela peut me contraindre, par habitude, à utiliser RxJS.

👉 Cas théorique

- On dispatch plusieurs fois le même événement de manière successive.

Permettre à un Signal de réagir de façon synchrone permettrait d’obtenir un état beaucoup plus 𝐩𝐫é𝐝𝐢𝐜𝐭𝐢𝐛𝐥𝐞.

Cela simplifie énormément le 𝐦𝐨𝐝è𝐥𝐞 𝐦𝐞𝐧𝐭𝐚𝐥 nécessaire pour se représenter les flux de mise à jour d’un état (𝑠𝑡𝑎𝑡𝑒).

Si tu te poses la question de pourquoi ne pas utiliser un `effect`, n’hésite pas à aller lire un article que j’ai écrit sur le sujet (lien en commentaire).

Au-delà de ça, 𝐑𝐱𝐉𝐒 reste le roi pour orchestrer des événements asynchrones complexes.

De même, si tu fais de l’𝐞𝐯𝐞𝐧𝐭-𝐝𝐫𝐢𝐯𝐞𝐧, je pense qu’il reste indispensable.

Cependant, j’aimerais aussi pouvoir réagir 𝐝𝐞 𝐟𝐚ç𝐨𝐧 𝐬𝐲𝐧𝐜𝐡𝐫𝐨𝐧𝐞 à des événements, sans passer par RxJS.

Je vais donc me créer mes petits utilitaires pour :

- créer des sources capables d’émettre des événements ;
- fournir sans doute un utilitaire de type `on` pour réagir à ces changements.

---

D'après mon dernier sondage, 99% des devs Angular pensent qu'il est toujours nécessaire d'utiliser RxJs aujourd'hui.

Ce n'est pas un échantillon représentatif. Donc ça veut juste dire ce que ça dit.

Personnellement, je ne suis pas aussi enthousiate quant à l'idée de devoir utiliser RxJs systématiquement dans nos applications Angular.

Toutefois, je reconnais toujours la puissance de cet outil, mais je pense qu'il manque d'intégration dans Angular.

Là où les signal ont la vie facile.

Travailler avec RxJs nécessite toujours plus de code pour l'intégrer dans Angular.

Voici deux idées qui ne sont pas officielles, mais dont je voulais te partager pour moderniser RxJs dans Angular.

## Dis moi ce que t'en penses

Je viens de créer un utilitaire 𝐞𝐱𝐩𝐥𝐢𝐜𝐢𝐭𝐂𝐨𝐦𝐩𝐮𝐭𝐞𝐝 dédié aux signals, qui simplifie certaines migrations des observables vers les signals.

J’ai plusieurs morceaux de code écrits avec RxJS et des observables que je souhaite transformer en signals, car c’est tout à fait approprié.

Ces morceaux de code sont souvent écrits avec des `combineLatest`, suivis d’un `map`, afin de créer des sortes de sélecteurs généralement dédiés aux composants.

Inspiré de 𝐞𝐱𝐩𝐥𝐢𝐜𝐢𝐭𝐄𝐟𝐟𝐞𝐜𝐭 provenant de ngxtension, j’ai créé 𝐞𝐱𝐩𝐥𝐢𝐜𝐢𝐭𝐂𝐨𝐦𝐩𝐮𝐭𝐞𝐝, qui reprend grossièrement le même principe. (Je n’invente rien.)

D’une part, l’aspect « explicite » permet d’éviter les side effects avec les signals, qui peuvent être assez nombreux.

D’autre part, cela rend la migration beaucoup plus triviale, grâce à la signature de la fonction qui se rapproche fortement d’un `combineLatest` suivi d’un `map`.

```ts
combineLatest(...).pipe(map(data => ...))

explicitComputed([...], data => ...)
```

⚠️ 𝐀𝐭𝐭𝐞𝐧𝐭𝐢𝐨𝐧, je tiens toutefois à rappeler certaines limitations de ce pattern et ses différences.

👉 Avant
Avec `combineLatest`, chaque événement émis par les sources est propagé dans le `map`.

👉 Après
Avec `explicitComputed`, les sources sont désormais des signals, et la fonction callback sera appelée uniquement lors de la change detection ou si la référence est lue (`myRef()`).

Ainsi, les signals utilisés comme sources peuvent prendre plusieurs valeurs avant que la change detection ne se déclenche, mais seule la dernière valeur sera prise en compte.

> Attention aussi, si vous devez remplacer des combineLatest imbriqués.

👉 Lien du code
https://lnkd.in/dJwZpyhC

## Ps: j'ai oublié de mettre le point clé "untracked", le lien du code à la version corrigé. Merci Matthieu Riegler (et n'hésite pas à regarder son commentaire où il donne son avis sur ce genre de fonction).

---

Je viens de finir le dernier « 𝐠𝐫𝐨𝐬 » 𝐞𝐱𝐞𝐦𝐩𝐥𝐞 qui utilise les primitives Angular de ma lib 𝐧𝐠-𝐜𝐫𝐚𝐟𝐭.

Je suis 𝐜𝐨𝐧𝐭𝐞𝐧𝐭 𝐝𝐞 𝐜𝐞 𝐪𝐮𝐞 ç𝐚 𝐝𝐨𝐧𝐧𝐞 𝐜ô𝐭é 𝐜𝐨𝐝𝐞.

Il y a 𝐛𝐞𝐚𝐮𝐜𝐨𝐮𝐩 𝐝𝐞 𝐟𝐨𝐧𝐜𝐭𝐢𝐨𝐧𝐧𝐚𝐥𝐢𝐭é𝐬 (𝑙𝑎 𝑙𝑖𝑠𝑡𝑒 𝑐𝑜𝑚𝑝𝑙è𝑡𝑒 𝑒𝑠𝑡 𝑒𝑛 𝑐𝑜𝑚𝑚𝑒𝑛𝑡𝑎𝑖𝑟𝑒).

En bref,

- ça récupère 𝐮𝐧𝐞 𝐥𝐢𝐬𝐭𝐞 𝐝’𝐮𝐭𝐢𝐥𝐢𝐬𝐚𝐭𝐞𝐮𝐫𝐬,
- ça la 𝐦𝐞𝐭 𝐞𝐧 𝐜𝐚𝐜𝐡𝐞,
- on peut 𝐬𝐮𝐩𝐩𝐫𝐢𝐦𝐞𝐫 𝐝𝐞𝐬 𝐮𝐭𝐢𝐥𝐢𝐬𝐚𝐭𝐞𝐮𝐫𝐬 — soit 𝑢𝑛𝑖𝑡𝑎𝑖𝑟𝑒𝑚𝑒𝑛𝑡, avec un 𝑑é𝑙𝑎𝑖 𝑑𝑒 𝑟é𝑡𝑟𝑎𝑐𝑡𝑎𝑡𝑖𝑜𝑛, soit 𝑒𝑛 𝑚𝑎𝑠𝑠𝑒.

Le code final est 𝐩𝐫𝐚𝐭𝐢𝐪𝐮𝐞𝐦𝐞𝐧𝐭 𝟏𝟎𝟎 % 𝐝é𝐜𝐥𝐚𝐫𝐚𝐭𝐢𝐟.

Il y a 𝟐 𝐞𝐟𝐟𝐞𝐜𝐭𝐬 qui traînent, et il existe des techniques pour 𝑠’𝑒𝑛 𝑝𝑎𝑠𝑠𝑒𝑟 (𝑐𝑓. 𝑚𝑜𝑛 𝑑𝑒𝑟𝑛𝑖𝑒𝑟 𝑎𝑟𝑡𝑖𝑐𝑙𝑒 𝑠𝑢𝑟 𝑙𝑒𝑠 𝑠𝑖𝑔𝑛𝑎𝑙𝑠), mais je pense que ça 𝐧𝐮𝐢𝐫𝐚𝐢𝐭 𝐮𝐧 𝐩𝐞𝐮 à 𝐥𝐚 𝐜𝐨𝐦𝐩𝐫é𝐡𝐞𝐧𝐬𝐢𝐨𝐧.

Je trouve aussi qu’il manque 𝐪𝐮𝐞𝐥𝐪𝐮𝐞𝐬 𝐮𝐭𝐢𝐥𝐢𝐭𝐚𝐢𝐫𝐞𝐬 pour simplifier la gestion des listes (ce que je prévois d'ajouter dans une prochaine MAJ).

Tout ça tient dans 𝐦𝐨𝐢𝐧𝐬 𝐝𝐞 𝟒𝟎𝟎 𝐥𝐢𝐠𝐧𝐞𝐬 𝐝𝐞 𝐜𝐨𝐝𝐞.

Niveau 𝐥𝐢𝐬𝐢𝐛𝐢𝐥𝐢𝐭é, je trouve que c’est 𝑡𝑜𝑝 grâce à l’approche 𝐝é𝐜𝐥𝐚𝐫𝐚𝐭𝐢𝐯𝐞.

👉 𝐄𝐬𝐭-𝐜𝐞 𝐪𝐮𝐞 𝐭𝐮 𝐯𝐨𝐢𝐬 𝐝𝐞𝐬 𝐜𝐡𝐨𝐬𝐞𝐬 à 𝐚𝐦é𝐥𝐢𝐨𝐫𝐞𝐫 ?
👉 𝐎𝐮 𝐝𝐞𝐬 𝐚𝐬𝐩𝐞𝐜𝐭𝐬 𝐪𝐮𝐢 𝐧𝐞 𝐬𝐨𝐧𝐭 𝐩𝐚𝐬 𝐜𝐥𝐚𝐢𝐫𝐬 ?

L’exemple sera bientôt dispo avec 𝐥𝐚 𝐝𝐨𝐜 𝐞𝐧 𝐥𝐢𝐠𝐧𝐞.
Activez pour voir l’image en plus grand.

---

Je me rapproche du but. (sortir une première version de ma lib ng-craft)

La première version de la doc me semble ok.

Les exemples sont presque prêts !

Bientôt, je déploierai.

- la doc
  -la lib sur npm
- un repo github avec que les exemples qui pourront s'exécuter sur stackblitz.

## Pour les tests, j'ai utiliser vitest avec Angular 21 💎

---

Ce qui me manque pour vraiment utiliser les signals d’Angular à 100 % sans galérer.

👉 Des Resources qu’on peut run en parallèle
(cf. mon article sur 𝐫𝐞𝐬𝐨𝐮𝐫𝐜𝐞𝐁𝐲𝐆𝐫𝐨𝐮𝐩 sur dev.to).

👉 Des Resources qu’on pourrait appeler directement
(ce qui permet de faire des mutations).

👉 nestedEffect, pour isoler ce qui est run dans le nestedEffect de l’effect du host
Ça me permet de faire des réactions à des Resources qui run en parallèle.

👉 Un moyen de détecter que la structure d’un signal a changé
Sinon, je dois juste checker si les clés ont changé.

👉 Des Resources qui gardent par défaut la dernière valeur récupérée lorsqu’une nouvelle requête est en train de se faire
C’est plus ou moins OK avec ce qui est prévu
(j’avais vu une PR ou une issue passer à ce sujet).

👉 Améliorer l’API de linkedSignal quand on utilise source + computation

Actuellement, on est contraint d’ajouter les types explicitement.
C’est dû à une limitation du typage de TypeScript :
une output infer (ici le retour du signal de source) ne peut pas servir en tant qu’input infer dans le même objet
(l’input pour la computation).

Si jamais tu commences à aller plus loin avec les Signals, je te recommande fortement de ne pas passer par un 𝐞𝐟𝐟𝐞𝐜𝐭, ni un 𝐥𝐢𝐧𝐤𝐞𝐝𝐒𝐢𝐠𝐧𝐚𝐥.

Mais plutôt par ce qu’on pourrait appeler des :

👉 explicitEffect
👉 explicitLinkedSignal

Pourquoi ?
👉 Pour limiter les side effects
Je suis très souvent obligé de mettre des 𝐮𝐧𝐭𝐫𝐚𝐜𝐤𝐞𝐝 de partout
(et je le fais après m’être cassé le crâne à comprendre la source du problème).

👉 Pourquoi un explicitLinkedSignal ?
Parce que s’il y a des signals dans le callback de 𝐜𝐨𝐦𝐩𝐮𝐭𝐚𝐭𝐢𝐨𝐧,
ça va retrigger la computation à chaque changement
(même si tu as défini une 𝐬𝐨𝐮𝐫𝐜𝐞).

Sinon, je trouve les Signals vraiment top à utiliser.
J’adore la DX, vraiment bravo à l’équipe d’Angular d’avoir mis en place ce système.

D’ailleurs, ils viennent d’améliorer le debug par graphe des Resources
(faut que je teste).

---

👉 Question : RxJS est-il toujours pertinent sur les applications Angular modernes ?

À 𝐪𝐮𝐞𝐥 𝐦𝐨𝐦𝐞𝐧𝐭 𝐑𝐱𝐉𝐒 𝐫𝐞𝐬𝐭𝐞-𝐭-𝐢𝐥 𝐢𝐧𝐝𝐢𝐬𝐩𝐞𝐧𝐬𝐚𝐛𝐥𝐞 ?
𝑁’𝑦 𝑎-𝑡-𝑖𝑙 𝑝𝑎𝑠 𝑑’𝑎𝑢𝑡𝑟𝑒𝑠 𝑠𝑜𝑙𝑢𝑡𝑖𝑜𝑛𝑠 ?
Sommes-nous vraiment certains qu’il soit incontournable ?

Pour ma part, je pense que 𝐑𝐱𝐉𝐒 devient 𝑑𝑒 𝑚𝑜𝑖𝑛𝑠 𝑒𝑛 𝑚𝑜𝑖𝑛𝑠 𝑐𝑒𝑛𝑡𝑟𝑎𝑙.

Cependant, il reste important de maîtriser les 𝐩𝐚𝐭𝐭𝐞𝐫𝐧𝐬 𝐫é𝐚𝐜𝐭𝐢𝐟𝐬 liés aux event (coucou l'architecture 𝐞𝐯𝐞𝐧𝐭-𝐝𝐫𝐢𝐯𝐞𝐧).

RxJS facilite l’orchestration des événements, ce qui reste un avantage.

Toutefois, je constate que les outils de 𝐬𝐞𝐫𝐯𝐞𝐫 𝐬𝐭𝐚𝐭𝐞 𝐦𝐚𝐧𝐚𝐠𝐞𝐦𝐞𝐧𝐭 sont souvent sous-exploités.

## Ils répondent à de nombreux besoins standards, notamment pour les appels API où RxJs n'apporte souvent pas de valeur (si ce n'est l'inverse).

J'ai soumis une idée de talk pour hashtag#NgBaguetteConf 2026 sur Paris.

Si toi aussi tu as des idées, c'est le moment car la soumission des talk termine fin janvier.

## J'en ai une autre, mais il me faut encore un peu de temps pour la préparer. J'espère avoir le temps d'ici fin janvier, sinon tant pis.

Je suis en train de construire la doc de ma lib de state management pour Angular 🪶

Pour cela je m’aide de l'intelligence artificielle.

Mais sans te mentir et elle hallucine énormément.

Elle va prendre des exemples de d'autres librairies (coucou TanStackQuery, NgRx 😅) qui n'ont rien à voir avec ma syntaxe.

Je suis obligé de passer sur chaque page pour vérifier et systématiquement corriger.

Peut-être que j'avais donné trop de contexte.

Mais en faisant une par une, le résultat est beaucoup mieux.

J'espère, à travers cette première version de la documentation, transmettre suffisamment d'informations ainsi que tous les concepts que j'ai souhaité mettre en place.

En tout cas, c'est grave cool et je sens le projet qui arrive à son terme.

Il me restera encore quelques étapes comme corriger les tests, déployer la librairie et déployer la doc.

Mais avant ça, il me reste aussi à terminer la création des exemples et ça, c'est vraiment la meilleure partie.

Je dis ça, car la philosophie de l'outil correspond carrément à mon style de code et j'en suis très fier.

Ça me procure un sentiment de fluidité, aussi bien pour moi que pour l'IA, c'est incroyable.

## J'essaie de vous partager tout ça très vite.

Cette semaine, j'ai appris un truc de super utile avec Playwright pour tester mes app Angular.

Alors sans doute que vous le connaissez déjà, mais moi, c'est la première fois que je rencontre le besoin et je ne connaissais pas cette façon de faire.

J'utilise Playwright pour faire des tests e2e, que j'ai branchés à des github actions.

Ce qui me permet qu'à chaque fois qu'une PR est créée, ou est mise à jour, de lancer les tests automatiquement.

Le problème, c'est que même si ça marchait bien en local, les nouveaux tests que j'implémentais ne fonctionnaient souvent pas du premier coup dans la CI.

Et j'arrivais à les corriger à coups de devinettes, mais c'était vraiment très compliqué et très coûteux en temps.

Mais depuis hier, j'ai trouvé une astuce qui marche super bien.

C'est qu'on peut record l'ensemble du test qui a planté via Playwright et ça sans effort.

Une simple config, comme je le partage dans le screenshot et c'est fini.

Il faut bien penser à sauvegarder quelque part le report des tests.

Et de cette façon, j'ai plus qu'à télécharger le report en local, ouvrir le fichier, regarder les vidéos et ajuster justement mes tests pour que tout fonctionne bien.

Et toi est-ce que tu as d'autres astuces à me partager pour faire du débogage avec Playwright?
TS Typage avancé de ma query - Mise en place de l'optimistic update et reload automatique des query en parallèle.

## Je rencontre une limitation de Typage TS que peu connaissent et comment je la contourne.

Faire du dev réduit le risque de développer une maladie de démence 🆘

Une dernière touche positive pour finir ce challenge.

D’après l’article (en lien), une activité cognitive intense réduit le risque de démence jusqu’à 37 %.

Je pense que, lorsque l’on fait du dev, on est souvent amené à beaucoup réfléchir et à avoir une activité mentale intense ✅

Reste à voir si, quand on travaille sur un bon projet legacy qui fait des nœuds au cerveau, c’est toujours une bonne chose pour le cerveau 🤯

Pour finir, je remercie tous ceux qui ont régulièrement lu et parfois laissé un commentaire ou un j’aime sur cette série de posts.

## Je vous souhaite une très bonne fin d’année. 🎉

---

Jour 23/24: Correction dans mon dernier article, l'input "model" est compatible avec les bindings des HostDirectives 🔥

Concrètement:
@Directive({ standalone: true })
export class ChildCounterFacadeDirective {
public readonly counterValue = model<number>(0);
//...

@Component({
selector: 'app-child-counter',
changeDetection: ChangeDetectionStrategy.OnPush,
hostDirectives: [
{
directive: ChildCounterFacadeDirective,
inputs: ['counterValue'],
outputs: ['counterValueChange'],
},
],

Ca fonctionne.

Pas besoin de créer une output supplémentaire "counterValueChange" dans la directive (comme je l'avais présenté initialement).

## Merci à Lucas Garcia pour la correction 🤝

Jour 22/24 : Grosse avancée sur la création « fait main » des utilitaires query et mutation.

Il y a quelques jours, j’ai partagé un premier article sur le sujet, où j’ai créé l’équivalent de la resource d’Angular, mais uniquement basé sur RxJS (resource$).

J’avais également créé le resourceById$, qui permet de faire des appels en parallèle.

C’étaient les deux premières briques nécessaires pour créer ce que j’appelle les query et mutation, qui vont rendre la DX plus explicite et simple à mettre en place.

Ici, je te joins la mise en place d’une query et d’une mutation 100% déclarative.

La query va gérer elle-même l’optimistic update suite au changement de statut de la mutation patchEntity$.

Et si la mutation échoue, la query va se recharger afin de mettre à jour ses données.

Là, c’est l’exemple le plus « simple », sans mutations ou queries en parallèle. Je vais bientôt te partager un exemple plus poussé, mais tout aussi simple à mettre en place.

Après cela, j’ajouterai des fonctionnalités pour simplifier la composition (step by step).

Si tu souhaites avoir le code avant la publication de l’article dédié, n’hésite pas à m’envoyer un MP.

## Ps: j'ai le destroy$ d'obligatoire (vu que le projet pour lequel je les ai créé n'a pas encore accès au takeUntilDestroyed d'Angular).

Jour 21/24 : J'explore la mise en place d’interfaces sur mon outil de state management.

J’ai eu l’idée hier soir d’ajouter la possibilité de définir des interfaces « classiques » sur mon store.

Cela permettra d’utiliser un store à l’instar d’une classe ou d’une fonction classique, tout en respectant un contrat.

Je n’ai pas encore eu le temps d’expérimenter davantage, mais je partage un screenshot de ce à quoi cela devrait ressembler.

Quand je parle d’interfaces « classiques », c’est aussi parce que je réfléchis à des interfaces « plus poussées ».

Elles permettront par exemple d’indiquer si un state doit être « persisté » ou attaché aux query params.

Ou encore de définir les fonctions que le store doit exposer.

## Affaire à suivre.

Jour 20/24 : Je crée des « primitives » pour mon outil de state management Angular.

Au fur et à mesure que je réfléchis à la manière dont mon outil peut résoudre facilement certains problèmes, les patterns que j’ai mis en place sont amenés à évoluer.

Et récemment, j’ai eu un de ces déclics : transformer en conservant les fonctionnalités existantes, mais en adoptant l’outil le plus approprié.

Ce déclic consiste à créer des « primitives réactives » — je ne sais pas si le terme est exact — qui sont toutes organisées de la même façon.

Ces premières primitives sont : « state », « queryParams », « query », « mutation ».

Le premier paramètre est dédié au passage de la configuration.

Puis les suivants servent à ajouter des méthodes, des états dérivés ou encore des effets de bord (comme la sauvegarde dans le localStorage).

Ce pattern simplifie — selon moi — la composition d’un state.

Il devient « facile » de pouvoir réutiliser des utilitaires génériques pour les associer à un state, une query…

J’ai pas mal d’utilitaires déjà existants que je vous partagerai, et qui couvrent déjà énormément de cas courants.

L’objectif reste : simplifier la DX, pour mettre en place une meilleure UX.

Ces primitives sont utilisables dans un contexte d’injection, et peuvent toujours être utilisées dans un store « craft », où l’on retrouve ce même principe de composition, mais à un niveau différent.

Je pense avoir identifié ce que je souhaite exposer comme utilitaires pour mon store, afin que tout suive la même logique et limite la friction.

Dans le screenshot :

- un counter expose les méthodes increment et decrement, et réagit à la source (cf. mon article sur les signals) reset pour se remettre à zéro.

- paginationQueryParams expose la méthode nextPage, et réagit à la source reset pour remettre les query params à l’état par défaut.
  N’hésite pas à me dire ce que tu en penses.

---

our 19 : Nouvel article. Utilise les directives Angular pour construire les façades de tes composants (et arrête de perdre du temps avec les services). 🎁

Dans cet article, on va parler des HostDirectives.

Mais pas pour créer des composants « dumb » — il existe déjà beaucoup de contenu sur ce sujet.

On va plutôt voir comment gérer toute la logique du composant, ce que l’on fait habituellement dans un service ou un store.

Cette approche permet de réduire encore davantage la logique présente directement dans le composant, au bénéfice de la DX. 🤝

Si tu veux en savoir plus, n’hésite pas à aller voir ça.

Et dis-moi en commentaire si tu utilises déjà cette méthode ou si c’est la première fois que tu en entends parler.

## N’oublie pas de laisser un j’aime pour soutenir mes posts, cela m’aide beaucoup.

Jour 18 : Savais-tu qu’on peut utiliser les signals de cette façon ?
Gestion d'un state avec linkedSignal, 100% déclaratif et réactif, sans avoir recours à RxJS.

Dans l’un de mes derniers articles, je présente un pattern basé sur linkedSignal, qui réagit à la recomputation des signals utilisés comme sources.

Je trouve ce pattern acceptable, même s’il comporte certaines limites.

J’ai essayé de toutes les lister de façon exhaustive, afin d’éviter les mauvaises surprises. N’hésite pas à aller voir ça.

## Et toi, qu’en penses-tu ? Est-ce une bonne ou une mauvaise pratique ?

Jour 17/24: Nouvelle vidéo YouTube en approche ! Je vous montre comment typer une fonction utilitaire query (niveau avancé, mais accessible)

Je vous montre comment typer une fonction utilitaire "query" pour un server state management encore plus robuste.

On va plonger dans la gestion des paramètres conditionnels :
certaines informations seront obligatoires, et si elles sont absentes, certaines propriétés deviendront carrément interdites.

## Le lien en commentaire:

Jour 16/24: Un basique de typage TypeScript à la portée de tous les juniors

Nouvelle astuce de typage, un basique qui va te permettre d'écrire des types plus avancés.

Elle est très simple à maîtriser en plus !

## N'hésite pas à me dire si tu l'utilises déjà et dans quels cas :D

---

Jour 15/24 : Astuce de typage que tout dev TypeScript devrait connaître — les types conditionnels 🎥

Je te partage une petite vidéo dans laquelle je t’explique comment utiliser le typage conditionnel.

C’est un basique à connaître, et je m’en servirai pour aller plus loin dans les notions de typage.

N’hésite pas à aller voir cette vidéo : c’est un quick win assuré.

## Et n’hésite pas à me dire si tu l’utilises régulièrement ou non.

Jour 14/24: StoryTime Angular : mon premier blog Angular, du CSR au SSR 🤯

Mon premier gros projet Angular, ce n’était pas une app d’entreprise.

C’était mon blog sur le sommeil.

Backend en PHP pur (simple à héberger), frontend en Angular pour monter en compétences.

Le site sort vite, sans IA, avec de la débrouille et beaucoup de doc.

Puis la réalité arrive :
❌ Pages pas indexées sur Google

C’est là que j’ai découvert un truc essentiel :

👉 Angular en Client Side Rendering, ce n’est pas l’idéal pour le SEO

Je me lance donc dans Angular Universal.

Et là… grosse claque.

Très peu de doc à l’époque, déploiement complexe, Node + PHP à faire cohabiter, gestion des ports, serveur, meta tags dynamiques…

Je crois que je n’ai jamais autant galéré sur une feature.

Mais j’y ai appris énormément.

Avec le recul, Angular a beaucoup évolué et tout ça est aujourd’hui bien plus accessible.

Ce projet n’était pas parfait, mais il a été fondamental dans mon parcours de développeur frontend.

J'ai fait un article avec un peu plus de détails si cela t'intéresse. Il est en commentaire.

## Et toi t'as déjà dû utiliser le SSR avec Angular ? Comment ça c'est passé ?

Jour 13/24: Debug en live d'un problème de typage TypeScript et en Français.

J'avais un petit problème de typage TS sur mon outil de state management.

Du coup, j'ai décidé de m'enregistrer pour te monter un peu comment ça se passe en coulisse.

Comme on ne voit pas souvent de vidéo sur le Typage, je me suis dit que ça pourrait t'intéresser.

## Et si tu as des questions ou des points que tu aimerais que j'explique n'hésite pas.

Jour 12 : Ce que les juniors Angular ne maîtrisent généralement pas ➡️ le code déclaratif.

Écrire du code déclaratif (au niveau TypeScript), c’est vraiment quelque chose que j’aurais aimé apprendre dès le début de ma carrière de développeur Frontend.

Cela se popularise beaucoup, mais pas encore assez vite à mon goût.
Le concept peut toutefois rester assez flou, voire méconnu.

Alors si tu ne maîtrises pas encore ce principe, je t’invite à lire l’article rédigé par le maître en la matière 👉 Mike Pearson.

Je le trouve particulièrement instructif, et il permet de bien s’imprégner de la philosophie derrière ce concept.

## Dis-moi ce que tu en penses.

Jour 11 : Viens, on recrée TanStackQuery en RxJS (et en mieux) pour Angular 🎁

Voici un nouvel article de ma mini-série TanStackQuery réalisé avec RxJS.

Et oui, on va faire mieux, en particulier sur ces points :

- Écrire du code 100 % déclaratif
- Personnaliser l’UX grâce à la composition

Bien entendu, on ne va pas tout recréer, mais tu auras une excellente base pour implémenter la plupart des fonctionnalités offertes par TanStackQuery.

D’ailleurs, cet outil est 100 % compatible avec les anciennes versions d’Angular.

Seul RxJS est requis : pas besoin d’avoir accès aux Signals.

C’est d’ailleurs pour cela que j’ai commencé à créer ce petit outil de server state management pour un projet qui n’est pas encore à jour.

J’espère que ça va te plaire, et si tu as des idées ou des commentaires, n’hésite pas !

## N'hésite pas à mettre en like, pour ce type de contenu qui n'existe pas encore.

Jour 10: 🎁 Quelques utilitaires pour travailler avec les Signals qui pourront être utiles toSource / computedSource / sourceFromEvent

Dans la dernière partie de mon article sur les Signals Recomputation Reactions, je te partage quelques utilitaires qui peuvent t'intéresser.

Assure-toi d'avoir bien compris les limites des Signals avant de les utiliser, sinon tu risques d'avoir (peut-être) des surprises.

En-tout-cas, je les trouve les bienvenues quand on reste dans le flow des signals.

Retrouve le code dans l'article en commentaire. 👇

## Et n'hésite pas à me dire ce que tu en penses.

Jour 9: Vers une nouvelle génération d’inputs/outputs des composants d’Angular ?

L'arrivé des Signals permettrait de revoir la conception des inputs/outputs de nos composants.

Les Signals offrent un pattern d'observabilité intéressant qui pourrait servir pour créer nos inputs et outputs.

- Côté "enfant", on peut réagir à un changement de valeur d'un signal venant du parent lors d'une Change Detection (mécanisme d'input de l'enfant)

- Côté "parent", on peut réagir à un changement de valeur d'un signal venant de l'enfant lors d'une Change Detection (mécanisme d'output de l'enfant)

Le plus, c'est que nos services peuvent déjà adopter ce modèle.

C'est ce que j'ai fait dans mon outil de states management.

Ce qui permet d'uniformiser le passage d'information à la fois pour des services et aussi des composants.

> Toutefois, il faudra sans doute préserver le mécanisme d'Event qu'offre les observables et que je n'ai pas représenté ici.

> J'ai utilisé un utilitaire source, que je présente dans mon dernier article. C'est un signal, dont on récupère toujours undefined à la première lecture. (Lien en commentaire)

## N'hésite pas à me dire ce que tu en penses, en tout cas, je trouve ça prometteur.

Jour 8: Tout a changé dans mon apprentissage du typage TypeScript depuis que je mets ça en place.

Nouvelle vidéo pour te présenter comment tu peux tester tes types en TypeScript.

Ça prend vraiment 2s à mettre en place, et même si cette technique à quelques limites, elle reste essentielle.

Ça te permet de faire du TDD, des tests de non-régression...

C'est particulièrement utile quand tu commences à implémenter des types dérivés ou un peu plus avancé.

## Est-ce que tu as déjà mis en place des tests de typage, est-ce que tu fais différemment ?

Jour 7: La notion de Typage TS la plus importante pour ne plus passer pour und débutant.

Aujourd'hui, je te partage une vidéo sur une notion de typage importante.

Elle va te permettre d'avoir une meilleure DX dans ta codebase et de clarifier tes intentions de code.

Je l'utilise régulièrement et elle est game changer.

Alors est-ce que tu la connaissais ?

## Le lien en commentaire 🔗

Jour 6: Projet frontend SaaS voué à l'échec:
(Je ne parle pas de landing page, ni de markerting)

- Démarré, avec l'idée qu'il sert juste à afficher
- Il y a juste besoin de bidouillé pour que ça fonctionne.
- Des maquettes (s'il y en a) uniquement pour ordinateur (aie pour les utilisateurs mobiles.)
- Pas de tooling adapté
- Pas de supervision de la prod
- Pas de tests (en même temps, si mes données s'affichent, c'est bon ?)
- Fait en js
- Des devs qui interviennent sans connaître le projet juste pour ajouter une feature (prestation à la feature, au plus vite).
- Ne laisse pas le temps à son équipe de réfacto
- Pas de potentielle monté de version

(J'en oublie sûrement un paquet, qu'est ce que tu rajouterai ?)

Projet frontend SaaS voué à réussir :

- A un framework avec lequel l'équipe est à l'aise et à les compétences (React, Vue, Solid, Svelte, c'est non...)
- A des outils appropriés (outil de server state management, client state management, formulaires, supervision, lazy-loading, optimisation de la taille des fichiers) dont les dev comprennent leur philosophie et utilité.
- A un design système clair, cohérent, approprié et adaptable
- A une vision globale des flux de données de l'application
- Maîtrise ses dépendances et ses couplages.
- Projet clairement structuré (dossiers/fichiers)
- Des test (e2e, intégration, unitaire) pour valider les comportements attendus
- Montées de version des outils régulières
- Se permet de refactoriser son code pour l'adapter au mieux aux nouvelles contraintes.
- Souhaite offrir la meilleure UX/UI possible même si ça peut prendre plusieurs itérations.

Un projet frontend, c'est loin d'être si évident :

- On s'efforce de rendre son utilisation naturelle en évitant le maximum de friction à l'utilisateur.
- La plupart des app que l'on utilise au quotidien sont souvent là depuis des années et ont pu s'adapter pour répondre au mieux à nos besoins, mais ce process à mis des années pour en arriver là.
- Certaines des app qu'on utilise ont coûté des millions pour être pensées et développés par un tas de personnes et pourtant, il arrive toujours quelques bugs plus ou moins gênants.

## Pour conclure : Utilise Angular et mon outil de states management 😉

Jour 5: 🎁 5 Comportements qu'il faut absolument connaître quand on utilise des réactions avec les Signals d'Angular - Calendrier de l’Avent Angular

Aujourd'hui, je te partage mes conclusions sur les limitations des Signals en particulier lorsqu'on les utilise avec des réactions.

Ca a été le fruit de pas beaucoup d'expérimentations et de réflexion.

Je peux toutefois me tromper, et peut-être avoir donné de mauvaises explications. Alors n'hésite pas à me corriger.

En attendant, je pense que connaître ces 5 limitations t'aideront à mieux comprendre comment fonctionne les Signals.

## Certaines étaient déjà documentées (dans d'autres articles), d'autres nons, alors n'hésite pas à faire un tour.

Jour 4 : Calendrier de l’Avent Angular – 🎁 T'abuses de ne pas utiliser groupBy dans tes projets Angular !

On va parler d'RxJs et en particulier de l'opérateur groupBy.

J'en parle de temps en temps, mais je ne le vois pas encore à l'action.

C'est vrai que mentalement ce n'est pas évident à se représenter ce qu'il permet de faire.

Un dev m'a posé des questions dessus, car il ne comprenait pas très bien à quoi il servait.

Alors oui, groupBy permet de trier comme on peut trier une liste.

Mais il permet de trier en restant dans le domaine des observables et ça, on peut en tirer parti pour améliorer l'UX.

## J'ai réalisé une petite démo qui met en avant la différence de comportement entre l'utilisation d'un mergeMap et l'utilisation de groupBy+mergeMap+switchMap.

Jour 3 : Calendrier de l’Avent Angular – 🎁 Voici une démo pour t’aider à comprendre quelques différences comportementales entre les Signals et les Observables.

J’ai trouvé un super exemple (à mon sens) pour mettre en avant une différence de comportement entre l’utilisation des Signals et des Observables.

(J’ai écrit comportementale… j’ai l’impression d’être un psy en pleine analyse.)

Je n’ai pas mis beaucoup d’explications dans cette démo, je te laisse faire ta propre analyse.

> Clique sur l’écran et regarde les logs.

(Si tu es sur ton téléphone, je ne suis pas sûr que tu puisses les voir.)

Essaie ensuite d’analyser l’ordre dans lequel les logs apparaissent.

Je trouve que c’est un cas très simple mais très explicite pour observer les différences entre Observables et Signals.

## Je te partagerai prochainement une analyse détaillée, avec des explications sur ce qu’il se passe.

Jour 2 : Calendrier de l’Avent Angular – 🎁 linkedSignal + Signal Recomputation Event → vers un state 100 % déclaratif ?

On continue la mise en place d’un système de réaction avec les Signals.

J’ai légèrement retravaillé le wording de l’article, où j’ai renommé Signal Event en Signal Recomputation Event.

J’ai également davantage insisté sur l’aspect « réaction » via les Signals.

Et aujourd’hui, je te propose un autre super pattern, dans lequel un linkedSignal permet de lister toutes ses réactions.

Cela permet d’obtenir un state 100 % déclaratif et presque prédictif.

Je te laisse découvrir ce pattern avec sa démo incluse.

## Cependant, ce pattern a des limites : sauras-tu les identifier ? 😉

---

Jour 1 : Calendrier de l’Avent Angular – 🎁 Découvre comment créer des events basés uniquement sur les Signals d’Angular

C’est trop cool aujourd’hui : premier jour du calendrier de l’Avent dédié à Angular.

Et pour fêter ça, je voulais te partager une notion importante pour moi, sur laquelle j’ai basé mon outil de state management.

🎁 Je vais te montrer comment implémenter un système d’événements entièrement basé sur les Signals d’Angular, et comment y réagir pour mettre à jour des states.

Pour cela, rendez-vous sur mon blog dédié à Angular sur dev . to (lien en commentaire).

Tu y trouveras une première partie qui présente une première façon d’implémenter ce genre d’événements. La suite arrivera prochainement 😉.

C’est clairement ma vision que je te partage.

Dis-moi ce que tu en penses : est-ce une bonne idée, ou au contraire penses-tu que cela pourrait desservir la communauté ?
