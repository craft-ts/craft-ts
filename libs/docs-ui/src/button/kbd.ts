import { craftComponent, h, type Input } from '@craft-ts/component';
import { proseUi } from '../prose/prose.style.ts';

export interface KbdInput {
  /** The key as it is printed: `⌘`, `K`, `Esc`. */
  readonly keys: Input<string>;
}

/**
 * One keyboard key. The vocabulary has no `kbd` helper, so it is a plain `kbd`
 * element with the key-cap class of the prose sheet — the same one the Markdown
 * pipeline uses for `<kbd>` in a paragraph.
 */
export const DocKbd = craftComponent('DocKbd', {}, (input: KbdInput) =>
  h('kbd', { class: proseUi.kbd }, input.keys),
);
