Graphe d'architecture dans @craft-ng, et ce que Nx ne couvre pas (de mon point de vue)

Je viens de poser un graphe statique de l'app, plus des règles d'architecture par-dessus.

Nx, je l'utilise déjà. Le project graph, les tags, `depConstraints`, `nx affected` : ça marche très bien pour un monorepo.

Le truc, c'est que le nœud Nx, c'est un projet. Une app, une lib.

Tout ce qui se passe 𝐝𝐚𝐧𝐬 l'app, Nx ne le voit pas. Les routes, les services, qui injecte qui, quel endpoint HTTP, quelle clé de persistence.

Deux features dans le même projet peuvent se parler. `enforce-module-boundaries` ne dit rien : il n'y a pas d'import entre libs.

C'est pour ça que le graphe Craft ne part pas des imports TypeScript. Il part du programme : routes, `provides`, `depends-on`, appels HTTP, `craftUnique`.

Concrètement, ça apporte quoi ?

- un endpoint HTTP n'a qu'un owner (`assertHttpEndpointUnique`)
- une clé de stockage `craftUnique` n'est vraiment utilisée qu'une seule fois dans le projet
- un `craftComputed` : on s'assure que ça reste toujours de la lecture
- A injecte B, B réinjecte A : dans la même app, Nx ne dit rien. Le graphe Craft refuse ce cycle. Ça évite le boot cassé, les tests injouables, et le "je ne sais plus qui possède quoi"
- des frontières de dossiers à l'intérieur d'une app (`assertPathBoundaries`) — le cousin de `depConstraints`, mais sur la dépendance, pas sur l'import

Ce sont des `it()` Vitest. On charge le graphe, on assert.

De mon point de vue, c'est un des plus gros piliers contre l'AI slop : mettre en place des règles d'architecture solides, qui vont favoriser un code déclaratif et robuste.

C'est aussi une des plus grosses valeurs ajoutées de @craft-ng. J'en suis vraiment très fier.

C'est une couche qui vient en plus du typage et de la safety du compilateur, en plus des règles ESLint, en plus des règles Nx. Un moyen de tester, et de rendre son application robuste. C'est complémentaire.

C'est encore les débuts. Sans doute qu'il y aura des loupés, et des cas pas pris en compte. Mais je sais qu'avec l'utilisation et l'expérimentation, ces cas seront de plus en plus restreints, et les apps de plus en plus solides — grâce à ces règles, qui peuvent être hautement customisées à chaque approche.

Ça ne remplace pas Nx.

Nx continue de faire ce que Craft ne fera pas : affected, cache, barrels, interdire un package npm selon le tag, orchestrer la CI.

Le graphe Craft ne décide pas quoi relancer. Il dit si la forme de l'app tient encore.

Les deux tournent déjà ensemble : `npx nx architecture demo`.

La page qui détaille les limites des deux côtés :
https://ng-angular-stack.github.io/craft/guide/testing/craft-graph-vs-nx

Donne moi ton avis, ou pose moi des questions, si tu veux des clarifications.

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
