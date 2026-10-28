import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * The method an AI follows to resume a recorded session: read, propose,
 * drive, hand back, check, freeze. Served as an MCP prompt so any host gets
 * the same steps; the skill `craft-ts-guided-resume` says the same.
 */
export const GUIDED_RESUME_PROMPT = `Tu reprends une session de debug enregistrée : tu ramènes l'application vivante là où elle était au point choisi, pour ce que la personne veut y observer, puis tu écris une recette rejouable et figes un point. Le skill craft-ts-guided-resume décrit la méthode en détail ; voici l'essentiel.

Outils : le serveur MCP des logs (resume.*, session.*, recipe.list/get) et celui du registre (resume.doctor, app.*, checkpoint.*, recipe.run/save/repair, page). Si ton hôte diffère leur chargement, charge-les avant de conclure qu'ils manquent.

1. Commencer par resume.doctor. Lire ensuite, sans agir dans l'app : resume.request ; session.story jusqu'au point et les quelques étapes qui le suivent (ce que la personne a fait ensuite est souvent ce qu'elle veut regarder) ; session.prerequisites ; checkpoint.list ; recipe.list. Choisir le meilleur chemin pour cet événement, mais ne pas le restaurer ni l'exécuter avant l'entretien.

2. Avant toute action dans l'app, demander l'objectif en un seul message, avec des réponses que tu proposes depuis l'enregistrement, et la même question dans le fil (resume.say, kind question) :
   - que veux-tu observer à partir de ce point ?
   - qu'est-ce qui doit être identique à l'enregistrement (compte et rôle, données du serveur que la suite lit ou écrit, brouillon) ?
   - puis-je écrire sur le serveur pour y arriver (réinitialiser, recréer) ?
   - le parcours servira-t-il une fois ou plusieurs fois ?
   Saute ce qui est déjà dit. Sans réponse précise : la prochaine action comme objectif, aucune écriture sans accord. Reformule l'objectif en une phrase.

3. Après l'entretien, restaurer et valider le point valide ; sinon exécuter la recette existante ; seulement sans point ni recette appropriés, conduire une reprise guidée. Réparer les vérifications resume.doctor en échec, puis le relancer. Ne tue aucun processus et ne modifie aucune configuration sans accord.

4. Vérifier d'abord, sur le serveur vivant, les données dont l'objectif dépend (session.recordedCall contre ce que l'app lit). Préférer l'état et les méthodes Craft (registry.* et app.replay) ; utiliser page et ses contrôles nommés quand l'interface fait partie du scénario. Le navigateur et les captures servent à regarder ou montrer, jamais à agir. Chaque étape dans le fil (resume.say).

5. Rendre la main seulement pour un secret : app.handoff avec until = session.prerequisites.session.signedInWhen, en disant où se connecter (l'onglet, son URL). Même consigne dans le chat et le fil. Si le délai expire, redemande et relance.

6. Vérifier contre l'objectif : app.diff sans écart qui compte pour lui ; app.writes.

7. Écrire une recette autonome par défaut avec recipe.save : séparer préparation et scénario, créer des données propres avec variables, écrire des attentes minimales essentielles/accessoires et leurs remèdes, transformer les secrets en étapes humaines, et déclarer le nettoyage inverse de chaque création. Puis checkpoint.save avec goal, ttlMs et ttlReason, probes (celles de session.prerequisites plus une pour les données de l'objectif), created, deviations ; ensuite checkpoint.validate.

8. Le runner vérifie lui-même les attentes à chaque exécution, sans validation IA. Les attentes accessoires violées sont consignées. Si une attente essentielle échoue sans remède, le runner arrête, nettoie et demande une réparation. Réparer à partir de l'étape cassée avec recipe.repair, sans tout refaire.

9. Conclure en une phrase, dans le chat et le fil (kind done) : le point et l'objectif, sa durée et pourquoi, les écarts, et ce que la personne fait ensuite.`;

export function registerGuidedResumePrompt(server: McpServer): void {
  server.registerPrompt(
    'reprise-guidee',
    {
      title: 'Reprise guidée',
      description:
        'Ramener l’application vivante au point d’une session enregistrée, rendre la main pour les identifiants, puis figer un point de reprise.',
      argsSchema: {
        sessionId: z.string().optional().describe('Session à reprendre ; la dernière demande sinon'),
      },
    },
    ({ sessionId }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: sessionId
              ? `${GUIDED_RESUME_PROMPT}\n\nSession à reprendre : ${sessionId}.`
              : GUIDED_RESUME_PROMPT,
          },
        },
      ],
    }),
  );
}
