Je mets @craft-ng à disposition de la communauté Angular, en beta.

J'ai passé des mois à m'attaquer aux points qui me gênaient dans Angular. Pas pour remplacer le framework : pour aller au bout de ce qu'il permet déjà.

Voilà ce que j'en ai tiré. 👇

𝟏- 𝐋'𝐢𝐧𝐣𝐞𝐜𝐭𝐢𝐨𝐧 𝐝𝐞 𝐝𝐞́𝐩𝐞𝐧𝐝𝐚𝐧𝐜𝐞𝐬, 𝐞𝐧𝐟𝐢𝐧 𝐭𝐲𝐩𝐞́𝐞

Le DI d'Angular est extrêmement puissant. C'est même l'une des meilleures choses du framework.

Mais il n'est pas typé.

Résultat : on l'utilise de façon très basique. `providedIn: 'root'` partout, un singleton par service, et on s'arrête là. Parce que dès qu'on va plus loin, on prend le risque d'un oubli de provider… découvert en prod.

Avec craft-ng, chaque dépendance passe par le système de types. Un oubli de provider devient une erreur de compilation, dans ton éditeur, avant même de lancer l'app.

Et ça change tout : tu peux enfin expérimenter sans risque.

C'est pour ça que je trouve ça aussi intéressant pour apprendre ce qu'est vraiment l'injection de dépendances — et pour pousser des concepts jusqu'à ce qu'ils collent exactement à ton besoin.

𝟐- 𝐔𝐧 𝐬𝐭𝐚𝐭𝐞 𝐦𝐚𝐧𝐚𝐠𝐞𝐦𝐞𝐧𝐭 𝐞𝐱𝐡𝐚𝐮𝐬𝐭𝐢𝐟 𝐞𝐭 𝐝𝐞́𝐜𝐥𝐚𝐫𝐚𝐭𝐢𝐟

C'est là que j'ai passé le plus de temps.

Je voulais une solution qui couvre les trois états d'une app, pas seulement un :
→ les données serveur
→ les données client
→ les données dans l'URL

Et surtout : qu'elles soient déclaratives.

Tu lis le code, et tu sais comment il va évoluer. Pas besoin de chercher ailleurs qui déclenche quoi.

𝟑- 𝐑𝐞́𝐜𝐮𝐩𝐞́𝐫𝐞𝐫 𝐜𝐞 𝐝𝐨𝐧𝐭 𝐭𝐮 𝐚𝐬 𝐛𝐞𝐬𝐨𝐢𝐧, 𝐨𝐮̀ 𝐭𝐮 𝐞𝐧 𝐚𝐬 𝐛𝐞𝐬𝐨𝐢𝐧

Toujours dans cet esprit déclaratif.

Ça donne un tracking de dépendances très fin, très granulaire. Et ça simplifie énormément les tests.

Ma conviction : 𝐮𝐧 𝐭𝐞𝐬𝐭 𝐧𝐞 𝐝𝐞𝐯𝐫𝐚𝐢𝐭 𝐩𝐚𝐬 𝐩𝐨𝐮𝐯𝐨𝐢𝐫 𝐬𝐞 𝐥𝐚𝐧𝐜𝐞𝐫 𝐬𝐢 𝐬𝐚 𝐜𝐨𝐧𝐟𝐢𝐠𝐮𝐫𝐚𝐭𝐢𝐨𝐧 𝐧'𝐞𝐬𝐭 𝐩𝐚𝐬 𝐛𝐨𝐧𝐧𝐞.

Grâce au tracking des dépendances, même profondes, c'est exactement ce qui se passe : tant que ton test n'est pas correctement configuré, il ne part pas.

Et l'autocomplétion TypeScript te guide pour le configurer. Correctement, et vite.

Fini la boucle "je lance, je lis NullInjectorError, j'ajoute un provider, je relance".

𝟒- 𝐃𝐞 𝐥'𝐨𝐛𝐬𝐞𝐫𝐯𝐚𝐛𝐢𝐥𝐢𝐭𝐞́ 𝐝𝐚𝐧𝐬 𝐧𝐨𝐬 𝐩𝐫𝐨𝐣𝐞𝐭𝐬 𝐟𝐫𝐨𝐧𝐭

Celui-là me tenait vraiment à cœur.

C'est pour moi l'un des leviers les plus importants pour profiter de l'IA aujourd'hui.

L'objectif est simple : pouvoir déboguer instantanément un bug ou un comportement non voulu. Avoir l'état de l'app au moment où ça casse, et la chaîne causale qui remonte jusqu'au clic de l'utilisateur.

Et ça a plein d'autres vertus, on en reparlera. 😉

𝟓- 𝐔𝐧 𝐫𝐨𝐮𝐭𝐢𝐧𝐠 𝐛𝐞𝐚𝐮𝐜𝐨𝐮𝐩 𝐩𝐥𝐮𝐬 𝐫𝐨𝐛𝐮𝐬𝐭𝐞

Côté DX : les routes sont typées de bout en bout.

Le chemin, les params, les inputs du composant, les services dont il a besoin. Une route qui pointe vers rien, un input mal orthographié, un service non fourni → erreur de compilation. Pas un écran blanc.

Côté UX : la navigation ne bloque plus.

Les guards, les resolvers et les erreurs de chargement lazy sont gérés sans figer l'interface, avec un état de pending que tu contrôles.

Les deux vont ensemble, et c'est ça que je trouve précieux : la sécurité au build ET une navigation fluide pour l'utilisateur.

𝟔- 𝐔𝐧𝐞 𝐜𝐨𝐦𝐩𝐨𝐬𝐢𝐭𝐢𝐨𝐧 𝐝𝐞 𝐜𝐨𝐦𝐩𝐨𝐬𝐚𝐧𝐭𝐬 𝐞𝐭 𝐝𝐞 𝐝𝐢𝐫𝐞𝐜𝐭𝐢𝐯𝐞𝐬 𝐢𝐧𝐞́𝐠𝐚𝐥𝐞́𝐞

Là, je pèse mes mots : je n'ai vu ça nulle part ailleurs en front.

Une directive craft décore à la fois la 𝐥𝐨𝐠𝐢𝐪𝐮𝐞 du composant et son 𝐭𝐞𝐦𝐩𝐥𝐚𝐭𝐞. Elle peut enrichir le contexte, ajouter un input public, ou décider de ne rien rendre du tout.

Et tout ça reste typé.

```ts
const Card = craftComponent(/* … */).pipe(hasPermission('edit'));
```

Le comportement et le markup voyagent ensemble, et se composent de gauche à droite.

𝟕- 𝐒𝐞𝐥𝐞𝐜𝐭𝐨𝐫𝐥𝐞𝐬𝐬 𝐞𝐭 𝐬𝐚𝐧𝐬 𝐛𝐚𝐥𝐢𝐬𝐞 𝐝𝐚𝐧𝐬 𝐥𝐞 𝐃𝐎𝐌

Les composants craft sont des fonctions. Pas de sélecteur à déclarer, pas d'élément hôte enveloppé autour de ton markup.

Ce que tu écris est ce qui atterrit dans le DOM.

---

Je suis vraiment fier de ce que ça donne aujourd'hui.

Et j'ai posé quelques pièces maîtresses qui vont me permettre d'emmener la lib beaucoup plus loin. Il y a de quoi faire.

C'est une beta : l'API bougera encore, avec un changelog et une note de migration à chaque fois.

Je suis preneur de tout retour — critique, incompréhension, idée d'évolution. C'est aussi pour ça que je la publie maintenant plutôt que dans six mois.

📚 Doc : https://ng-angular-stack.github.io/craft/
💻 GitHub : https://github.com/ng-angular-stack/ng-craft

npm install @craft-ng/core@beta

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
