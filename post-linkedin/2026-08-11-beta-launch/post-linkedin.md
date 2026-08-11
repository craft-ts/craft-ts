Je mets @craft-ng à disposition de la communauté Angular, en beta.

Après des mois à construire ça le soir et le week-end, il est temps de le sortir du garage.

craft-ng, c'est une boîte à outils Signal-first pour modéliser l'état d'une app Angular : l'état local, l'état serveur, l'état dans l'URL, les services, les formulaires, les routes.

Le fil conducteur : déclarer, et laisser le compilateur tenir le reste.

Concrètement, 3 choses que ça change 👇

1- Les erreurs sont des valeurs typées.

Un 403 devient un code que tu déclares. Ton template ne compile plus tant que tu n'as pas dit ce que l'utilisateur voit. Plus de `'Une erreur est survenue'` qui avale l'information que le serveur t'avait donnée.

2- Le graphe de dépendances devient visible par le compilateur.

Chaque dépendance passe par `yield*`, donc elle existe dans le type. Oublier de provide un service n'est plus un incident en production : c'est un souligné rouge dans ton éditeur.

3- Les tests décrivent le vrai graphe.

Plus de boucle "je lance, je lis NullInjectorError, j'ajoute un provider, je relance". Le registre de test est exhaustif, et le typage refuse de tourner tant qu'un nœud n'est pas décidé.

Maintenant, la partie honnête. 🙂

C'est une beta. Je l'assume, et je préfère le dire clairement plutôt que de le découvrir avec toi :

- l'API des primitives de base (`state`, `query`, `mutation`) est celle dans laquelle j'ai le plus confiance
- la surface autour bougera encore, avec un changelog et une note de migration à chaque fois
- le typecheck est plus lent sur les graphes profonds — c'est mon chantier actuel, et je ne le cache pas

Et c'est exactement pour ça que je la publie maintenant, plutôt que dans six mois.

Une API se juge à l'usage, pas dans la tête de celui qui l'a écrite. Tant qu'on est en beta, tes retours peuvent encore la changer. Après, ce sera trop tard.

Donc je suis preneur de tout : critiques, incompréhensions, "ça ne marchera jamais chez nous parce que…", idées d'évolutions, ou juste le moment précis où tu as décroché en lisant la doc.

Ce dernier point m'intéresse particulièrement, d'ailleurs. 👀

Les questions sur lesquelles j'aimerais le plus être bousculé :

→ le choix des générateurs (`yield*`) : ergonomie acceptable, ou barrière à l'entrée ?
→ le typage poussé : est-ce que ça vaut son coût, ou est-ce que je suis allé trop loin ?
→ et surtout : quelle est la glue que tu en as marre d'écrire dans TES apps Angular ?

Ouvre une issue, une discussion, ou réponds ici. Je lis tout.

📚 Doc : https://ng-angular-stack.github.io/craft/
💻 GitHub : https://github.com/ng-angular-stack/ng-craft

npm install @craft-ng/core@beta

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
