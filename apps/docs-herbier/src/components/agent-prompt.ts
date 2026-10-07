import { craftComponent, div, h, p, pre } from '@craft-ts/component';
import { DocCopyButton } from '@craft-ts/docs-ui';
import { agentPromptUi } from './agent-prompt.style.ts';

/** The prompt an agent is given to set up a project. It is what "Copy" copies. */
export const SETUP_PROMPT = `You are setting up a new framework-independent CraftTS project.

1. Ask me first whether to use EffectTS v4 (not v3). Use --effect=v4 or --effect=none.
2. Ask which agent integrations to install: Codex, Cursor, or Claude Code. Pass them with --agents (use claude-code for Claude Code).
3. Create the project with: npx craft create <project-directory> --effect=<v4|none> --agents=<list>
4. Read the generated README, agent instructions, and CraftTS skills before writing application code. Use the skills generated for the selected agent integration.
5. Run npm install, then verify npm run lint, npm run typecheck, npm run test, npm run architecture, and npm run e2e.
6. Start the app with npm run dev and verify the routed page and its API request in the browser.
7. Keep the project framework-independent: use CraftTS primitives, CraftHttpClient, craftRoutes, and the generated architecture checks. Do not introduce Angular, raw fetch, async/await, or ad hoc reactive state.
8. Report the selected EffectTS/agent options, every command run, and any remaining issue.`;

const PREVIEW = 'You are setting up a CraftTS project…';

/** A card with the first words of the setup prompt and a button that copies all of it. */
export const AgentPrompt = craftComponent('AgentPrompt', {}, () =>
  div({ class: agentPromptUi.root }, [
    div({ class: agentPromptUi.header }, [
      p({ class: agentPromptUi.eyebrow }, 'Start with an agent'),
      DocCopyButton({
        text: function* () {
          return SETUP_PROMPT;
        },
      }),
    ]),
    pre({ class: agentPromptUi.preview, tabindex: 0, 'aria-label': 'Setup prompt' }, [
      h('code', PREVIEW),
    ]),
  ]),
);
