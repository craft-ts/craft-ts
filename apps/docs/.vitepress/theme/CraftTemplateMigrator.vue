<script setup lang="ts">
import { computed, ref } from 'vue';
import { migrateTemplateToCraft } from '../../../../libs/dev-tools/src/template-migration';

const source = ref(`<section class="card">
  <h2>Hello</h2>
  <button class="primary" type="button">Save</button>
</section>`);
const componentName = ref('');
const copied = ref(false);

const result = computed(() =>
  migrateTemplateToCraft(source.value, {
    componentName: componentName.value || undefined,
  }),
);

async function copyResult(): Promise<void> {
  await navigator.clipboard.writeText(result.value.code);
  copied.value = true;
  window.setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <div class="template-migrator">
    <label class="template-migrator__label" for="craft-template-source">
      HTML or Web component to convert
    </label>
    <textarea
      id="craft-template-source"
      v-model="source"
      class="template-migrator__textarea"
      rows="10"
      spellcheck="false"
    />

    <label class="template-migrator__label" for="craft-template-name">
      Full component name (optional)
    </label>
    <input
      id="craft-template-name"
      v-model="componentName"
      class="template-migrator__input"
      placeholder="e.g. SaveCard"
    />

    <div class="template-migrator__toolbar">
      <span v-if="result.diagnostics.length" class="template-migrator__warning">
        {{ result.diagnostics.length }} point(s) to check manually
      </span>
      <button type="button" class="template-migrator__copy" @click="copyResult">
        {{ copied ? 'Copied' : 'Copy the template' }}
      </button>
    </div>

    <textarea
      :value="result.code"
      class="template-migrator__textarea template-migrator__output"
      rows="16"
      readonly
      spellcheck="false"
      aria-label="Generated Craft template"
    />

    <ul v-if="result.diagnostics.length" class="template-migrator__diagnostics">
      <li v-for="diagnostic in result.diagnostics" :key="diagnostic.message">
        {{ diagnostic.message }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.template-migrator {
  display: grid;
  gap: 0.65rem;
  margin: 1.5rem 0;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.template-migrator__label {
  font-weight: 600;
}

.template-migrator__textarea,
.template-migrator__input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 0.7rem;
  font: inherit;
}

.template-migrator__textarea {
  font-family: var(--vp-font-family-mono);
  resize: vertical;
}

.template-migrator__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.template-migrator__copy {
  border: 0;
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  color: white;
  background: var(--vp-c-brand-3);
  cursor: pointer;
}

.template-migrator__warning,
.template-migrator__diagnostics {
  color: var(--vp-c-warning-1);
}
</style>
