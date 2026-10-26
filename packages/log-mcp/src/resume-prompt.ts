import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * The method an AI follows to resume a recorded session: read, propose,
 * drive, hand back, check, freeze. Served as an MCP prompt so any host gets
 * the same steps; the skill `craft-ts-guided-resume` says the same.
 */
export const GUIDED_RESUME_PROMPT = `Tu reprends une session de debug enregistrée : tu ramènes l'application vivante dans l'état où elle était au point choisi, puis tu figes ce point pour qu'il se rouvre sans toi.

Outils : log-mcp (lecture de l'archive) et function-registry-mcp (conduite de l'onglet).

1. Lire.
   - resume.request : la session et le point demandés depuis « Reprendre ici ». Sans demande, demande un id de session.
   - checkpoint.list (sessionId, beforeSequence) : s'il existe un point non expiré, checkpoint.restore puis checkpoint.validate. S'il est valide, c'est fini.
   - session.story, session.target, session.prerequisites : ce que la personne a fait, l'état visé, l'identité et les entités dont le point dépend.

2. Proposer, en deux ou trois phrases : le point (qui fait quoi, où), ce qu'il faut (rôle, données), ce que tu vas faire. N'attends pas de validation sauf si une action est irréversible.

3. Conduire.
   - app.launch (sessionId, beforeSequence) recharge l'onglet sur l'état enregistré, barrière d'écriture active.
   - app.diff dit ce qui manque. Comble l'écart avec page (goto, fill, click), app.replay (un geste enregistré, arguments adaptés aux données vivantes) et registry.*. Crée ce qui n'existe pas ici plutôt que d'abandonner.
   - session.recordedCall donne une réponse enregistrée pour recopier des valeurs.
   - Les jetons de l'archive sont masqués (craft-ref:…) : une session enregistrée n'est jamais ouverte telle quelle.

4. Rendre la main, uniquement pour ce que tu ne peux pas faire : mot de passe, code reçu, choix qui appartient à la personne. Tu ne lis ni ne tapes jamais un secret ; page refuse un champ sensible.
   - app.handoff (message court, field, until) : la condition porte sur l'état vivant, par exemple { address: 'service:session / query:signInProcess', path: 'token', matches: '^(?!craft-ref:)' }. Tu reprends seul dès qu'elle tient.
   - Dis dans le chat la même consigne que le bandeau.

5. Vérifier : app.diff jusqu'à ce que la route soit la même et que les écarts restants soient assumés. app.writes liste ce que la reprise a écrit ; une écriture retenue vers un tiers ne part pas sans accord explicite.

6. Figer : checkpoint.save avec
   - ttlMs et ttlReason choisis par toi d'après ce qui expire (durée du jeton, réinitialisation des données…) ;
   - probes : des requêtes de la même origine qui prouvent que le point tient (le compte est connecté, l'entité existe), avec {{state <adresse> <chemin>}} pour un jeton ou un id vivant ;
   - created : ce que tu as créé, avec la requête qui le supprime ;
   - deviations : les écarts assumés (« connectée avec ines@staging », « produit recréé : p-9034 au lieu de espresso »).
   Puis checkpoint.validate.

7. Conclure en une phrase : le point, sa durée et pourquoi, les écarts. La personne reprend la main dans l'onglet.

Si un point existant ne tient plus (sonde rouge), répare-le à partir de lui : ne refais pas tout.`;

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
