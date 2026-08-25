/**
 * Ce que l'exemple prouve — et surtout ce qu'il **refuse**.
 *
 * Les `@ts-expect-error` sont la moitié intéressante : chacun échouerait si la
 * garantie correspondante n'existait pas, ce qui est exactement le rôle d'un
 * `@ts-expect-error` (il rougit quand la ligne se met à compiler).
 */
import { describe, expect, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import type { ChannelsOf } from '@craft-ts/core';
import { div, span } from '@craft-ts/component';
import {
  assign,
  classKeyOf,
  bg,
  color,
  p,
  palette,
  scenarios,
  scrollPort,
  seal,
  space,
  unit,
  unsafeLength,
} from '../src/index.ts';
import type { Obligation, VariantsOf } from '../src/index.ts';
import { badge, bp, tone, v } from './badge.style.ts';
import { backToTop, shell } from './back-to-top.style.ts';

describe('niveau 1 — aucune valeur n’est une chaîne', () => {
  it('refuse tout ce qui n’est pas une valeur du design system', () => {
    p(space(4));
    p(unit.rem(1.5));
    bg(palette.surface.raised);

    // @ts-expect-error une longueur n'est pas une chaîne
    p('12px');
    // @ts-expect-error ni même une chaîne qui a la bonne forme
    p(`${4}px`);
    // @ts-expect-error une couleur n'est pas un mot-clé CSS
    bg('red');
    // @ts-expect-error l'échelle est fermée : 7 n'est pas un pas
    p(space(7));
    // @ts-expect-error une couleur là où une longueur est attendue
    p(palette.text.strong);

    expect(p(space(4))).toEqual({
      property: 'padding',
      value: '1rem',
      unproven: '',
    });
  });

  it('laisse une trace quand on sort de l’échelle', () => {
    const escape = p(unsafeLength('13px', 'alignement sur une image legacy'));

    // La dette n'est pas interdite, elle est comptable — c'est ce qui la rend
    // visible dans le graphe au lieu de la pousser hors du design system.
    expect(escape.unproven).toBe('alignement sur une image legacy');
  });

  it('type les variables par leur grammaire @property', () => {
    color(v.ink);
    color(v.ink.or(palette.text.muted));

    // @ts-expect-error le fallback est typé contre le même kind
    v.ink.or(space(4));
    // @ts-expect-error une variable <color> n'est pas une longueur
    p(v.ink);

    expect(color(v.ink).value).toBe('var(--badge-ink)');
    expect(assign(v.ink, palette.accent.danger)).toEqual({
      '--badge-ink': '#a11b1b',
    });
  });
});

describe('niveau 2 — le contrat de variantes est inféré', () => {
  it('ne retient que les points de coupure réellement utilisés', () => {
    type Contract = VariantsOf<typeof badge.root>;

    // `bp` définit sm ET md ; la classe n'utilise que md. Une matrice qui
    // dépliait tous les points de l'axe doublerait le nombre de captures pour
    // des scénarios que personne ne rend jamais.
    type _viewport = Expect<Equal<Contract['viewport'], 'md'>>;
    type _scheme = Expect<Equal<Contract['scheme'], 'dark'>>;
    type _tone = Expect<Equal<Contract['tone'], 'danger' | 'success'>>;

    expect(bp.sm.point).toBe('sm');
  });

  it('déplie le produit cartésien complet, base comprise', () => {
    const matrix = scenarios('badge-root');

    // 2 schemes × 3 tones × 2 viewports = 12. Aucune réduction « intelligente »
    // ici : une couverture qui se déclare complète sans l'être est pire que
    // pas de couverture.
    expect(matrix).toHaveLength(12);
    expect(matrix[0].id).toBe('base|base|base');
    expect(matrix.map((scenario) => scenario.id)).toContain('dark|danger|md');

    // La classe `dot` ne varie pas : un seul scénario, pas douze.
    expect(scenarios('badge-dot')).toHaveLength(1);
  });

  it('donne à chaque point un driver, sinon le scénario est inatteignable', () => {
    expect(bp.md.driver).toEqual({ kind: 'resize', minInlineSize: '64rem' });
    expect(tone.danger.driver).toEqual({
      kind: 'setAttribute',
      name: 'data-tone',
      value: 'danger',
    });
  });
});

describe('niveau 3 — les obligations remontent l’arbre', () => {
  it('fait remonter la demande jusqu’au nœud qui peut y répondre', () => {
    const page = div([span({ class: backToTop.button })]);

    // La demande a traversé le span puis le div : personne ne l'a satisfaite.
    // C'est nommément celle-là qui reste ouverte, pas « quelque chose ».
    type _stillOpen = Expect<
      Equal<
        ChannelsOf<typeof page>['obligations'],
        Obligation<'scrollPort.block'>
      >
    >;

    // Tant que personne n'a scellé, ce n'est pas une erreur : un ancêtre a
    // encore le droit de répondre. C'est au scellage que ça devient faux.
    // @ts-expect-error obligation 'scrollPort.block' non déchargée
    seal(page);

    expect(page.kind).toBe('element');
  });

  it('annule la demande au nœud qui la fournit', () => {
    const app = div({ class: shell.main }, [
      div([span({ class: backToTop.button })]),
    ]);

    // `provides(scrollPort.block)` a posé le CSS **et** la décharge. Le seul
    // chemin vers `overflow: auto` passe par là — la propriété n'existe pas
    // dans la table.
    type _closed = Expect<Equal<ChannelsOf<typeof app>['obligations'], never>>;

    expect(seal(app).kind).toBe('element');
  });

  it('émet le CSS et la décharge dans le même objet', () => {
    // La classe rendue est une liste de classes **atomiques** : la dédup est au
    // niveau de la règle, donc la sortie grossit avec le vocabulaire et pas
    // avec le nombre de composants. Le nom de feuille reste retrouvable.
    expect(classKeyOf(shell.main)).toBe('appShell-main');
    expect(shell.main.split(' ')).toHaveLength(4);
    // Le couplage est le point : `min-block-size: 0` sans `overflow-block` ne
    // sert à rien, et l'inverse produit un port qui ne rétrécit jamais.
    expect(scrollPort.block.effect.map((rule) => rule.property)).toEqual([
      'overflow-block',
      'min-block-size',
    ]);
  });
});
