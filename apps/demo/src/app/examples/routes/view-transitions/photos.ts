/**
 * Static artwork used by the view-transitions demo (`gallery` → `photo-detail`).
 * Pure CSS gradients so the demo needs no network — the point is the animated
 * shared-element morph between the two routes, not the imagery itself.
 */
export interface Photo {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly emoji: string;
  readonly gradient: string;
}

export const PHOTOS: readonly Photo[] = [
  {
    id: 'aurora',
    title: 'Aurora',
    subtitle: 'Northern lights',
    description:
      'Ribbons of green and violet folding across a polar sky. Clicked from the grid, the tile morphs straight into this hero.',
    emoji: '🌌',
    gradient: 'linear-gradient(135deg, #0f2027, #2c5364, #00c9a7)',
  },
  {
    id: 'ember',
    title: 'Ember',
    subtitle: 'Volcanic dusk',
    description:
      'Warm coals glowing under a darkening horizon. The same view-transition-name links the card and this panel.',
    emoji: '🔥',
    gradient: 'linear-gradient(135deg, #ff512f, #dd2476, #ff8a00)',
  },
  {
    id: 'tide',
    title: 'Tide',
    subtitle: 'Deep ocean',
    description:
      'Cold blues sliding into teal. Navigate back and the hero morphs neatly back into its grid tile.',
    emoji: '🌊',
    gradient: 'linear-gradient(135deg, #2193b0, #6dd5ed, #1a2980)',
  },
  {
    id: 'bloom',
    title: 'Bloom',
    subtitle: 'Spring meadow',
    description:
      'Soft pinks over fresh green. Each card carries a unique transition name so only the clicked one animates.',
    emoji: '🌸',
    gradient: 'linear-gradient(135deg, #f857a6, #ff5858, #b5ec8e)',
  },
  {
    id: 'dune',
    title: 'Dune',
    subtitle: 'Desert noon',
    description:
      'Sun-baked sand under a pale sky. The browser View Transitions API does the cross-fade for free.',
    emoji: '🏜️',
    gradient: 'linear-gradient(135deg, #f7971e, #ffd200, #f4a261)',
  },
  {
    id: 'nebula',
    title: 'Nebula',
    subtitle: 'Star nursery',
    description:
      'Dust and light far from anywhere. Angular runs the navigation inside document.startViewTransition().',
    emoji: '✨',
    gradient: 'linear-gradient(135deg, #654ea3, #eaafc8, #7f7fd5)',
  },
];

export function findPhoto(id: string): Photo | undefined {
  return PHOTOS.find((photo) => photo.id === id);
}
