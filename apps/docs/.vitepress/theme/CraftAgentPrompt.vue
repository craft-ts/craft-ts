<script setup lang="ts">
import { ref } from 'vue';

const prompt = `You are setting up a new framework-independent CraftTS project.

1. Ask me first whether to use EffectTS v4 (not v3). Use --effect=v4 or --effect=none.
2. Ask which agent integrations to install: Codex, Cursor, and Cloud Code. Pass them with --agents.
3. Create the project with: npx craft create <project-directory> --effect=<v4|none> --agents=<list>
4. Read the generated README and agent instructions before writing application code.
5. Run npm install, then verify npm run lint, npm run typecheck, npm run test, npm run architecture, and npm run e2e.
6. Start the app with npm run dev and verify the routed page and its API request in the browser.
7. Keep the project framework-independent: use CraftTS primitives, CraftHttpClient, craftRoutes, and the generated architecture checks. Do not introduce Angular, raw fetch, async/await, or ad hoc reactive state.
8. Report the selected EffectTS/agent options, every command run, and any remaining issue.`;
const promptPreview = 'You are setting up a CraftTS project';

const copied = ref(false);

function copyWithFallback(): void {
  const textarea = document.createElement('textarea');
  textarea.value = prompt;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

async function copyPrompt(): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(prompt);
  } else {
    copyWithFallback();
  }
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1800);
}
</script>

<template>
  <div class="craft-agent-prompt">
    <div class="craft-agent-prompt__logo-frame">
      <img
        class="craft-agent-prompt__logo craft-agent-prompt__logo--default"
        src="/assets/craft-ts-logo.png"
        alt="CraftTS logo"
      />
      <img
        class="craft-agent-prompt__logo craft-agent-prompt__logo--effect"
        src="/assets/effect-craft-mark-hover.png"
        alt=""
        aria-hidden="true"
      />
    </div>

    <div class="craft-agent-prompt__card">
      <div class="craft-agent-prompt__header">
        <div>
          <p class="craft-agent-prompt__eyebrow">
            Start with an agent
          </p>
        </div>
        <button
          type="button"
          class="craft-agent-prompt__copy"
          :aria-label="copied ? 'Prompt copied' : 'Copy the setup prompt'"
          title="Copy prompt"
          @click="copyPrompt"
        >
          <svg
            class="craft-agent-prompt__copy-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <rect x="8" y="8" width="11" height="11" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
          <span class="craft-agent-prompt__copy-status" aria-live="polite">
            {{ copied ? 'Copied' : '' }}
          </span>
        </button>
      </div>

      <pre class="craft-agent-prompt__body"><code>{{ promptPreview }}…</code></pre>
    </div>
  </div>
</template>

<style scoped>
.craft-agent-prompt {
  position: relative;
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 0.9rem;
  width: min(100%, 300px);
}

.craft-agent-prompt__logo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.craft-agent-prompt__logo-frame {
  position: relative;
  width: min(165px, 48vw);
  aspect-ratio: 1;
}

.craft-agent-prompt__logo--default,
.craft-agent-prompt__logo--effect {
  position: absolute;
  inset: 0;
  transition: opacity 320ms ease;
}

.craft-agent-prompt__logo--effect {
  opacity: 0;
}

.craft-agent-prompt__card {
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 35%, var(--vp-c-divider));
  border-radius: 11px;
  background: var(--vp-code-block-bg);
  box-shadow: 0 12px 32px rgb(0 0 0 / 12%);
  text-align: left;
}

.craft-agent-prompt__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.55rem 0.7rem;
  border-bottom: 1px solid var(--vp-c-divider);
}

.craft-agent-prompt__eyebrow {
  margin: 0;
}

.craft-agent-prompt__eyebrow {
  color: var(--vp-c-brand-1);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.craft-agent-prompt__copy {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 999px;
  padding: 0;
  color: var(--vp-c-brand-1);
  background: transparent;
  cursor: pointer;
}

.craft-agent-prompt__copy:hover {
  color: var(--vp-c-white);
  background: var(--vp-c-brand-1);
}

.craft-agent-prompt__copy-icon {
  width: 1rem;
  height: 1rem;
}

.craft-agent-prompt__copy-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.craft-agent-prompt__body {
  height: auto;
  margin: 0;
  overflow: hidden;
  padding: 0.55rem 0.7rem;
  color: var(--vp-code-block-color);
  font-size: 0.6rem;
  line-height: 1.4;
  white-space: nowrap;
  text-overflow: ellipsis;
}

@media (max-width: 639px) {
  .craft-agent-prompt {
    width: min(100%, 280px);
  }
}
</style>
