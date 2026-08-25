// https://vitepress.dev/guide/custom-theme
import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import AuthorNote from './AuthorNote.vue';
import CraftAgentPrompt from './CraftAgentPrompt.vue';
import CraftTemplateMigrator from './CraftTemplateMigrator.vue';
import './style.css';

const effectActionSelector = '.VPHomeHero .actions a[href$="/learn-effect/"]';

let effectRouteActive = false;
let effectActionHovered = false;
let darkBeforeEffectMode: boolean | null = null;

function isEffectRoute(path: string): boolean {
  return /(^|\/)learn-effect(?:\/|$)/.test(path);
}

function syncDarkMode(): void {
  if (typeof document === 'undefined') return;

  const shouldUseDarkMode = effectRouteActive || effectActionHovered;
  const root = document.documentElement;
  root.classList.toggle('effect-route', effectRouteActive);

  if (shouldUseDarkMode) {
    if (darkBeforeEffectMode === null) {
      darkBeforeEffectMode = root.classList.contains('dark');
    }
    root.classList.add('dark');
    return;
  }

  if (darkBeforeEffectMode !== null) {
    root.classList.toggle('dark', darkBeforeEffectMode);
    darkBeforeEffectMode = null;
  }
}

function isEffectActionTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(effectActionSelector) !== null;
}

function handleEffectActionPointerOver(event: PointerEvent): void {
  if (!isEffectActionTarget(event.target)) return;
  effectActionHovered = true;
  syncDarkMode();
}

function handleEffectActionPointerOut(event: PointerEvent): void {
  if (!isEffectActionTarget(event.target)) return;

  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && isEffectActionTarget(nextTarget)) return;

  effectActionHovered = false;
  syncDarkMode();
}

export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
      'home-hero-image': () => h(CraftAgentPrompt),
    });
  },
  enhanceApp({ app, router }) {
    app.component('AuthorNote', AuthorNote);
    app.component('CraftAgentPrompt', CraftAgentPrompt);
    app.component('CraftTemplateMigrator', CraftTemplateMigrator);

    if (typeof document === 'undefined') return;

    effectRouteActive = isEffectRoute(router.route.path);
    document.addEventListener('pointerover', handleEffectActionPointerOver);
    document.addEventListener('pointerout', handleEffectActionPointerOut);
    syncDarkMode();

    router.onAfterRouteChange = (path) => {
      effectRouteActive = isEffectRoute(path);
      syncDarkMode();
    };
  },
} satisfies Theme;
