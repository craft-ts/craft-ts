/**
 * `@craft-ts/component/style` — the style tokens the framework's components
 * expose to an application's sheets.
 *
 * A `*.style.ts` may import style vocabulary and nothing else (the build
 * plugin evaluates it in Node), so it cannot import `@craft-ts/component`
 * itself. This entry carries only tokens declared in the framework's own
 * sheets.
 */
export { craftAiLauncherPosition } from './lib/ai/ai-overlay.style';
