import { craftComponent, span, type Input } from '@craft-ts/component';
import { iconUi, type IconName } from './icon.style.ts';

export type { IconName };
export { ICON_NAMES } from './icon.style.ts';

export type IconSize = 'sm' | 'md' | 'lg';

export interface IconInput {
  readonly name: Input<IconName>;
  readonly size: Input<IconSize>;
}

/**
 * A glyph, drawn as a mask in the colour of its surroundings. Decorative by
 * default: the control or the line that holds it carries the name, so the icon
 * is hidden from assistive technology rather than announced as "image".
 */
export const DocIcon = craftComponent('DocIcon', {}, (input: IconInput) =>
  span({
    class: iconUi.root,
    'aria-hidden': 'true',
    'data-icon': input.name,
    'data-icon-size': input.size,
  }),
);
