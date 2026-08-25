/**
 * Le cas qui a motivé tout le dispositif : un bouton collant qui n'apparaît
 * jamais, parce que l'ancêtre qui devait fournir le scroll port ne le fournit
 * pas — et rien, ni au build ni au runtime, ne le dit.
 *
 * Ici c'est une erreur de compilation, et le message dit *où* déclarer.
 */
import {
  bg,
  blockSize,
  color,
  craftStyles,
  containerType,
  display,
  inlineSize,
  palette,
  position,
  provides,
  radii,
  radius,
  requires,
  scrollPort,
  space,
} from '../src/index.ts';

export const backToTop = craftStyles('backToTop', {
  /**
   * Le bouton exige un scroll port sur l'axe de bloc. `requires` s'attache à la
   * **classe**, pas à la feuille : c'est cette règle-là qui en dépend, et c'est
   * elle que le message d'erreur nommera.
   */
  button: [
    requires(scrollPort.block),
    position.sticky,
    display.block,
    inlineSize(space(12)),
    blockSize(space(12)),
    radius(radii.full),
    bg(palette.accent.success),
    color(palette.surface.page),
  ],
});

export const shell = craftStyles('appShell', {
  /**
   * Le layout fournit le port. `provides` retourne `overflow-block: auto` ET
   * `min-block-size: 0` ET la décharge, dans le même objet.
   *
   * Retirer cette ligne ne casse pas le rendu en silence : ça casse la
   * compilation, avant même de lancer l'app.
   */
  main: [
    provides(scrollPort.block),
    provides(containerType.scrollState),
    display.block,
  ],
});
