/**
 * The theme, and nothing that renders.
 *
 * A `*.style.ts` of an application may only import style vocabulary, because the
 * build plugin evaluates it in Node. The theme variables, the fonts and the
 * motion of Herbier are vocabulary of that kind; this entry hands them to such a
 * file without dragging in a single component.
 */
export * from './foundation/herbier.style.ts';
export { eyebrow } from './nav/nav.style.ts';
export { codeUi } from './code/code.style.ts';
