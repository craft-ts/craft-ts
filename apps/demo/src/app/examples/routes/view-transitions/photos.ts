/**
 * Static artwork used by the view-transitions demo (`gallery` → `photo-detail`).
 * Gradients (see `photoArt` in `view-transitions.style.ts`) so the demo needs no
 * network — the point is the animated shared-element morph between the two
 * routes, not the imagery itself.
 */
export interface Photo {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly emoji: string;
}

export const PHOTOS: readonly Photo[] = [
  {
    id: 'aurora',
    title: 'Aurora',
    subtitle: 'Northern lights',
    description:
      'Ribbons of green and violet folding across a polar sky. Clicked from the grid, the tile morphs straight into this hero.',
    emoji: '🌌',
  },
  {
    id: 'ember',
    title: 'Ember',
    subtitle: 'Volcanic dusk',
    description:
      'Warm coals glowing under a darkening horizon. The same view-transition-name links the card and this panel.',
    emoji: '🔥',
  },
  {
    id: 'tide',
    title: 'Tide',
    subtitle: 'Deep ocean',
    description:
      'Cold blues sliding into teal. Navigate back and the hero morphs neatly back into its grid tile.',
    emoji: '🌊',
  },
  {
    id: 'bloom',
    title: 'Bloom',
    subtitle: 'Spring meadow',
    description:
      'Soft pinks over fresh green. Each card carries a unique transition name so only the clicked one animates.',
    emoji: '🌸',
  },
  {
    id: 'dune',
    title: 'Dune',
    subtitle: 'Desert noon',
    description:
      'Sun-baked sand under a pale sky. The browser View Transitions API does the cross-fade for free.',
    emoji: '🏜️',
  },
  {
    id: 'nebula',
    title: 'Nebula',
    subtitle: 'Star nursery',
    description:
      'Dust and light far from anywhere. Angular runs the navigation inside document.startViewTransition().',
    emoji: '✨',
  },
];

export function findPhoto(id: string): Photo | undefined {
  return PHOTOS.find((photo) => photo.id === id);
}
