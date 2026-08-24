// https://vitepress.dev/guide/custom-theme
import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import AuthorNote from './AuthorNote.vue';
import CraftAgentPrompt from './CraftAgentPrompt.vue';
import CraftTemplateMigrator from './CraftTemplateMigrator.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
      'home-hero-image': () => h(CraftAgentPrompt),
    });
  },
  enhanceApp({ app }) {
    app.component('AuthorNote', AuthorNote);
    app.component('CraftAgentPrompt', CraftAgentPrompt);
    app.component('CraftTemplateMigrator', CraftTemplateMigrator);
  },
} satisfies Theme;
