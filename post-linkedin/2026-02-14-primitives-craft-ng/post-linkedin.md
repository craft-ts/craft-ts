les primitives de @craft-ng que tout développeur Angular devrait connaître

Un jour on m'a dit : « Gérer l'état et les appels API en Angular, c'est trop compliqué ». 🤔

Je me suis demandé : pourquoi ? Et si on rendait ça simple et déclaratif ?

C'est comme ça qu'est née l'idée derrière @craft-ng.

𝟓 𝐩𝐫𝐢𝐦𝐢𝐭𝐢𝐯𝐞𝐬 𝐩𝐨𝐮𝐫 𝐫𝐞𝐝𝐞𝐟𝐢𝐧𝐢𝐫 𝐥𝐚 𝐠𝐞𝐬𝐭𝐢𝐨𝐧 𝐝'𝐞́𝐭𝐚𝐭 :

1️⃣ **state** — Au lieu de combiner Signals et Computeds dans tous les sens, une primitive qui les intègre déjà. Avec des méthodes, des computed — tout en un.

2️⃣ **query** — Gère les appels serveur : cache, loading states, error handling. Fini le boilerplate.

3️⃣ **mutation** — POST, PUT, DELETE ? C'est géré. Lui et query deviennent amis pour les optimistic updates. 🤝

4️⃣ **queryParam** — Sync automatique avec l'URL. Filtres, pagination, recherche. C'est déclaratif et ça marche.

5️⃣ **asyncProcess** — N'importe quelle opération async. Track le status, les erreurs. Une ligne de code.

𝐂𝐞 𝐪𝐮𝐢 𝐦𝐞 𝐦𝐞𝐭 𝐣𝐞𝐮𝐧𝐞 ?

Le système d'**insertions**.

Chaque primitive accepte des plugins. Besoin de persister dans le localStorage ? Une insertion. Réagir à une mutation ? Une insertion. Ajouter des méthodes custom ? Une insertion.

C'est simple. C'est composable. Zéro limite.

Et ça change vraiment la manière de coder en Angular.

J'ai créé un carrousel pour vous montrer comment ça marche. Jetez un œil ! 👉

📚 Découvrez la doc complète : https://ng-angular-stack.github.io/craft/

---

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
