import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * The method an AI follows to resume a recorded session: read, propose,
 * drive, hand back, check, freeze. Served as an MCP prompt so any host gets
 * the same steps; the skill `craft-ts-guided-resume` says the same.
 */
export const GUIDED_RESUME_PROMPT = `Tu reprends une session de debug enregistrée : tu ramènes l'application vivante là où elle était au point choisi, pour ce que la personne veut y observer, puis tu figes ce point pour qu'il se rouvre sans toi. Le skill craft-ts-guided-resume décrit la méthode en détail ; voici l'essentiel.

Outils : le serveur MCP des logs (resume.*, session.*) et celui du registre (resume.doctor, app.*, checkpoint.*, page). Si ton hôte diffère leur chargement, charge-les avant de conclure qu'ils manquent.

1. Lire, sans rien faire : resume.request ; session.story jusqu'au point et les quelques étapes qui le suivent (ce que la personne a fait ensuite est souvent ce qu'elle veut regarder) ; session.prerequisites ; checkpoint.list (un point valide se rouvre avec checkpoint.restore puis checkpoint.validate).

2. Demander l'objectif, en un seul message, avec des réponses que tu proposes depuis l'enregistrement, et la même question dans le fil (resume.say, kind question) :
   - que veux-tu observer à partir de ce point ?
   - qu'est-ce qui doit être identique à l'enregistrement (compte et rôle, données du serveur que la suite lit ou écrit, brouillon) ?
   - puis-je écrire sur le serveur pour y arriver (réinitialiser, recréer) ?
   - le point servira-t-il une fois ou plusieurs ?
   Saute ce qui est déjà dit. Sans réponse précise : la prochaine action comme objectif, aucune écriture sans accord. Reformule l'objectif en une phrase.

3. Mettre en place : resume.doctor. Pour chaque vérification en échec, corrige toi-même si tu peux (ouvre l'app dans ton navigateur et montre-la), sinon demande une chose précise. Ne tue aucun processus et ne modifie aucune configuration sans accord.

4. Vérifier d'abord, sur le serveur vivant, les données dont l'objectif dépend (session.recordedCall contre ce que l'app lit). Puis app.launch, app.diff, et combler avec page, app.replay, registry.*. Chaque étape dans le fil (resume.say).

5. Rendre la main seulement pour un secret : app.handoff avec until = session.prerequisites.session.signedInWhen, en disant où se connecter (l'onglet, son URL). Même consigne dans le chat et le fil. Si le délai expire, redemande et relance.

6. Vérifier contre l'objectif : app.diff sans écart qui compte pour lui ; app.writes.

7. Figer : checkpoint.save avec goal, ttlMs et ttlReason, probes (celles de session.prerequisites plus une pour les données de l'objectif), created, deviations ; puis checkpoint.validate.

8. Conclure en une phrase, dans le chat et le fil (kind done) : le point et l'objectif, sa durée et pourquoi, les écarts, et ce que la personne fait ensuite.`;

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
