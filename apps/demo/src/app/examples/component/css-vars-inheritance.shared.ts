import { craftComponent, div, p, span } from '@craft-ts/component';
import { inheritance } from './css-vars.style';

/** Reads `badgeVars.ink`; it sets nothing itself. */
export const InheritedBadge = craftComponent(
  'InheritedBadge',
  {},
  () => ({}),
  () => span({ class: inheritance.badge }, 'Inherited from parent'),
);

/**
 * Sets `badgeVars.ink` once, in its own sheet. The variable is registered with
 * `inherits: true`, so the badge inside reads the parent's value.
 */
export const InheritanceExample = craftComponent(
  'InheritanceExample',
  {},
  () => ({}),
  () =>
    div({ class: inheritance.parent }, [
      p('The parent sets the badge ink in its sheet: set(badgeVars.ink, …).'),
      InheritedBadge(),
    ]),
);
