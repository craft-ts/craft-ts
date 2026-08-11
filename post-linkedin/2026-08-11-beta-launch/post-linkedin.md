Je mets @craft-ng à disposition de la communauté Angular, en beta.

J'ai passé des mois à m'attaquer aux points qui me gênaient dans Angular. Pas pour remplacer le framework : pour aller au bout de ce qu'il permet déjà.

𝟏- 𝐋'𝐢𝐧𝐣𝐞𝐜𝐭𝐢𝐨𝐧 𝐝𝐞 𝐝𝐞́𝐩𝐞𝐧𝐝𝐚𝐧𝐜𝐞𝐬, 𝐞𝐧𝐟𝐢𝐧 𝐭𝐲𝐩𝐞́𝐞
Le DI d'Angular est puissant, mais pas typé. Alors on l'utilise de façon basique, par peur de l'oubli qui casse en prod.
Ici, un provider oublié = une erreur de compilation. Tu peux enfin expérimenter sans risque.

𝟐- 𝐔𝐧 𝐬𝐭𝐚𝐭𝐞 𝐦𝐚𝐧𝐚𝐠𝐞𝐦𝐞𝐧𝐭 𝐞𝐱𝐡𝐚𝐮𝐬𝐭𝐢𝐟
Serveur, client, URL. Les trois. Et déclaratifs : tu lis le code, tu sais comment il va évoluer.

𝟑- 𝐃𝐞𝐬 𝐭𝐞𝐬𝐭𝐬 𝐪𝐮𝐢 𝐧𝐞 𝐩𝐞𝐮𝐯𝐞𝐧𝐭 𝐩𝐚𝐬 𝐞̂𝐭𝐫𝐞 𝐦𝐚𝐥 𝐜𝐨𝐧𝐟𝐢𝐠𝐮𝐫𝐞́𝐬
Un test ne devrait pas pouvoir se lancer si sa config n'est pas bonne.
Grâce au tracking des dépendances, même profondes, c'est exactement ce qui se passe — et l'autocomplétion te guide pour le configurer vite.

𝟒- 𝐃𝐞 𝐥'𝐨𝐛𝐬𝐞𝐫𝐯𝐚𝐛𝐢𝐥𝐢𝐭𝐞́ 𝐜𝐨̂𝐭𝐞́ 𝐟𝐫𝐨𝐧𝐭
Pour moi l'un des plus gros leviers pour profiter de l'IA aujourd'hui.
L'état de l'app au moment où ça casse, et la chaîne causale qui remonte jusqu'au clic.

𝟓- 𝐔𝐧 𝐫𝐨𝐮𝐭𝐢𝐧𝐠 𝐛𝐞𝐚𝐮𝐜𝐨𝐮𝐩 𝐩𝐥𝐮𝐬 𝐫𝐨𝐛𝐮𝐬𝐭𝐞
Routes typées de bout en bout côté DX, navigation non bloquante côté UX.

𝟔- 𝐔𝐧𝐞 𝐜𝐨𝐦𝐩𝐨𝐬𝐢𝐭𝐢𝐨𝐧 𝐢𝐧𝐞́𝐠𝐚𝐥𝐞́𝐞
Une directive décore la logique ET le template du composant. Je n'ai vu ça nulle part ailleurs en front.

𝟕- 𝐒𝐞𝐥𝐞𝐜𝐭𝐨𝐫𝐥𝐞𝐬𝐬, 𝐬𝐚𝐧𝐬 𝐛𝐚𝐥𝐢𝐬𝐞 𝐝𝐚𝐧𝐬 𝐥𝐞 𝐃𝐎𝐌
Ce que tu écris est ce qui atterrit dans le DOM.

J'en suis vraiment fier. Et j'ai posé les pièces qui vont me permettre d'aller beaucoup plus loin. 🚀

C'est une beta : l'API bougera encore. Je suis preneur de tout retour, critique ou idée — c'est aussi pour ça que je la publie maintenant plutôt que dans six mois.

📚 https://ng-angular-stack.github.io/craft/

Je suis Romain Geffrault.
Développeur Angular et créateur de @craft-ng
Suis-moi pour plus de contenu sur Angular
