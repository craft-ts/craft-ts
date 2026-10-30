import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * The method an AI follows to resume a recorded session: read, propose,
 * drive, hand back, check, freeze. Served as an MCP prompt so any host gets
 * the same steps; the skill `craft-ts-guided-resume` says the same.
 */
export const GUIDED_RESUME_PROMPT = `Tu reprends une session de debug enregistrée : tu ramènes l'application vivante là où elle était au point choisi, pour ce que la personne veut y observer, puis tu écris une recette rejouable et figes un point. Le skill craft-ts-guided-resume décrit la méthode en détail ; voici l'essentiel.

Outils : le serveur MCP des logs (resume.*, session.*, recipe.list/get) et celui du registre (resume.doctor, app.*, checkpoint.*, recipe.run/save/repair/network, page). Si ton hôte diffère leur chargement, charge-les avant de conclure qu'ils manquent.

1. Si le prompt contient un requestId, appeler resume.doctor(requestId) puis resume.request(requestId) : ce sont la demande et l'onglet exacts, même si d'autres onglets ou demandes existent. Ne pas les remplacer par « latest ». Lire ensuite, sans agir dans l'app : session.story jusqu'au point et les quelques étapes qui le suivent (ce que la personne a fait ensuite est souvent ce qu'elle veut regarder) ; session.prerequisites ; checkpoint.list ; recipe.list. Choisir le meilleur chemin pour cet événement, mais ne pas le restaurer ni l'exécuter avant l'entretien.

2. Avant toute action dans l'app, demander l'objectif dans la conversation active de l'agent, en un seul message avec des réponses que tu proposes depuis l'enregistrement :
   - que veux-tu observer à partir de ce point ?
   - veux-tu une reprise fonctionnelle sur le serveur actuel, ou un test de comportement isolé des API réelles ? En mode mocké, le replay enregistré amène au point puis la recette fournit des cas nommés aux prochains appels Craft ; tout appel non couvert échoue sans réseau réel.
   - qu'est-ce qui doit être identique à l'enregistrement (compte et rôle, données du serveur que la suite lit ou écrit, brouillon) ?
   - puis-je écrire sur le serveur pour y arriver (réinitialiser, recréer) ?
   - le parcours servira-t-il une fois ou plusieurs fois ?
   Saute ce qui est déjà dit. La personne répond dans la conversation active ; le panneau intégré à l'onglet est en lecture seule pour l'instant. Ne duplique pas l'entretien dans le fil. Sans réponse précise : la prochaine action comme objectif, aucune écriture sans accord, validité limitée à la session. Reformule l'objectif en une phrase.

3. Après l'entretien, restaurer et valider le point valide ; sinon exécuter la recette existante ; seulement sans point ni recette appropriés, conduire une reprise guidée. Réparer les vérifications resume.doctor en échec, puis le relancer. Ne tue aucun processus et ne modifie aucune configuration sans accord.

4. Vérifier d'abord, sur le serveur vivant, les données dont l'objectif dépend (session.recordedCall contre ce que l'app lit). Préférer l'état et les méthodes Craft (registry.* et app.replay) ; utiliser page et ses contrôles nommés quand l'interface fait partie du scénario. Le navigateur et les captures servent à regarder ou montrer, jamais à agir. Publier les étapes, attentes, blocages et consignes d'action avec resume.say et le même requestId : le fil est visible dans le dashboard et dans le panneau de l'onglet d'application. Pour une action attendue de la personne, écrire explicitement quoi faire et dans quel onglet. Si tu as besoin d'une réponse textuelle, pose la question dans la conversation de l'agent, car le panneau de l'app ne permet pas de répondre.

5. Rendre la main seulement pour un secret, un code ou un choix que la personne seule peut faire. Pour une connexion : app.handoff avec until = session.prerequisites.session.signedInWhen, en disant où se connecter (l'onglet, son URL), et resume.say avec le même texte en kind handoff. Le panneau et la bannière apparaissent dans l'onglet d'application. Si le délai expire, publie une nouvelle consigne dans le fil avant de relancer.

6. Vérifier contre l'objectif : app.diff sans écart qui compte pour lui ; app.writes.

7. Si la personne veut refaire ou rouvrir le parcours, checkpoint.save seul ne suffit pas : enregistrer obligatoirement une recette avec recipe.save. Son schéma guide les étapes typées : goto/create pour préparer, handoff, act/invoke pour poursuivre, expect pour vérifier une route ou un état Craft, checkpoint pour figer le résultat. Les champs de l'objectif exact/approximate, mayWrite, strategy, cleanup et revisions ont des valeurs sûres par défaut ; ne les remplis que si l'objectif l'exige. La recette prépare l'app avant le relais humain (par exemple ouvrir la page de connexion), puis reprend seule les étapes déterministes. Ajouter des données autonomes par défaut, des attentes essentielles et leurs remèdes, et le nettoyage inverse des créations. Ne jamais y mettre de secret. Avant de l'enregistrer, prouver que l'état de départ existe dans l'onglet neuf : goto ne restaure ni primitives, ni localStorage/origin storage, ni entités serveur. Lire l'état actif avec registry.list/get et page, reprendre les adresses exactes qu'ils retournent, sans reconstruire des chemins depuis session.story. Si registry.list/get ne répond pas, ne devine pas les adresses : utilise page pour les résultats visibles et signale toute assertion que le runner ne peut pas encoder. Pour un panier ou brouillon local requis, privilégier l'invocation d'une méthode d'état qui le prépare, puis mocker tous les appels serveur déclenchés pendant cette préparation afin qu'aucune écriture réelle n'ait lieu ; vérifier l'état exact ensuite. Pour une recette destinée à laisser la personne observer l'écran, insérer un handoff sans until juste après l'affichage à inspecter, avec un message qui demande de cliquer « C'est fait » après observation. Un until déjà vrai ne fait pas pause. Exécuter la première vérification avec supervised=true, mais ne pas compter sur ce réglage pour les relances du dashboard : ajouter dans la recette la pause humaine voulue, car une exécution ordinaire enchaîne les étapes. Vérifier la recette elle-même depuis l'état de départ prévu, mener chaque relais humain, confirmer status=completed et vérifier l'état essentiel. Puis checkpoint.save pour l'objectif, la durée et sa raison, les probes, created et deviations, en passant recipeId depuis la recette ; ensuite checkpoint.validate. Ce lien permet au point expiré de démarrer à nouveau la recette. Si la recette ne peut pas être enregistrée ou vérifiée, dire que seul un point temporaire existe et donner l'échec précis.

En mode mocké, ajouter au profil `network` les cas nommés `success`, `exception` (exception Craft typée) et `failure` (transport) pour les appels visés. Une server function se désigne par son id ; un `CraftHttpClient` par sa méthode et son URL exactes, sous la forme `POST /api/cart`. Demander un `mockChoices` avant chaque lancement si aucun `defaultCaseId` n'est enregistré ; ne mémoriser un choix par défaut que si la personne le demande. `recipe.run` applique le profil pendant l'exécution ; après restauration d'un checkpoint valide, `recipe.network` active le profil sans rejouer les étapes. Si la connexion doit rester réelle, mettre l'étape `{ "type": "network", "mode": "mocked" }` après le relais de connexion et avant les actions testées. Tout appel non couvert est bloqué, jamais envoyé au serveur.

8. Le runner vérifie lui-même les attentes à chaque exécution, sans validation IA. Les attentes accessoires violées sont consignées. Si une attente essentielle échoue sans remède, le runner arrête, nettoie et demande une réparation. Réparer à partir de l'étape cassée avec recipe.repair, sans tout refaire.

9. Conclure dans le chat et, si un requestId existe, dans le fil (kind done) : le point et l'objectif, sa durée et pourquoi, les écarts, et ce que la personne fait ensuite. Le panneau d'application affiche le fil en lecture seule ; les réponses de la personne restent dans la conversation active de l'agent.`;

export function registerGuidedResumePrompt(server: McpServer): void {
  server.registerPrompt(
    'reprise-guidee',
    {
      title: 'Reprise guidée',
      description:
        'Ramener l’application vivante au point d’une session enregistrée, rendre la main pour les identifiants, puis figer un point de reprise.',
      argsSchema: {
        requestId: z
          .string()
          .uuid()
          .optional()
          .describe('Demande exacte copiée depuis « Reprendre ici »'),
        sessionId: z
          .string()
          .optional()
          .describe('Session à reprendre ; la dernière demande sinon'),
        beforeSequence: z
          .number()
          .int()
          .nonnegative()
          .optional()
          .describe('Événement, si le point est fourni manuellement'),
        participantId: z
          .string()
          .optional()
          .describe('Onglet enregistré à suivre'),
      },
    },
    ({ requestId, sessionId, beforeSequence, participantId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              GUIDED_RESUME_PROMPT,
              requestId ? `Demande exacte : ${requestId}.` : '',
              sessionId ? `Session à reprendre : ${sessionId}.` : '',
              beforeSequence === undefined
                ? ''
                : `Juste avant l’événement ${beforeSequence}.`,
              participantId ? `Onglet enregistré : ${participantId}.` : '',
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        },
      ],
    }),
  );
}
