/**
 * The docs theme, and nothing that renders.
 *
 * A `*.style.ts` of an application may only import style vocabulary, because the
 * build plugin evaluates it in Node. The theme comes from `@craft-ts/ui/style`;
 * what the docs add to it — the eyebrow caption of a section — is vocabulary of
 * the same kind.
 */
export * from '@craft-ts/ui/style';
export { eyebrow } from './nav/nav.style.ts';
