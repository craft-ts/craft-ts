import type { Product } from './model';

/**
 * La promotion de la semaine : une remise sur une catégorie, jusqu'à une
 * date de fin. Le serveur la calcule à son heure ; la vitrine décompte le
 * temps qu'il reste à la sienne, et n'applique la remise que tant que la fin
 * n'est pas passée. Tout dépend donc de l'heure qu'il est.
 */
export interface Promotion {
  readonly id: string;
  readonly title: string;
  readonly categoryId: string;
  /** Remise en pourcentage (20 = −20 %). */
  readonly percentOff: number;
  /** Fin de la promotion (ISO 8601). */
  readonly endsAt: string;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** La promotion de la semaine de `nowMs` : les pâtisseries, jusqu'au dimanche 23 h 59 min 59 s. */
export function weeklyPromotion(nowMs: number): Promotion {
  const end = new Date(nowMs);
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  end.setHours(23, 59, 59, 0);
  const day = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return {
    id: `semaine-patisseries-${day}`,
    title: 'La semaine des pâtisseries',
    categoryId: 'pastries',
    percentOff: 20,
    endsAt: end.toISOString(),
  };
}

/** Le temps qu'il reste avant la fin, en millisecondes ; 0 une fois finie. */
export function promotionRemainingMs(promotion: Promotion, nowMs: number): number {
  return Math.max(0, Date.parse(promotion.endsAt) - nowMs);
}

export function isPromotionActive(promotion: Promotion | undefined, nowMs: number): promotion is Promotion {
  return promotion !== undefined && promotionRemainingMs(promotion, nowMs) > 0;
}

/** Les produits remisés : les produits simples de la catégorie (une formule garde son prix). */
export function isPromoted(product: Pick<Product, 'kind' | 'categoryId'>, promotion: Promotion | undefined, nowMs: number): boolean {
  return isPromotionActive(promotion, nowMs) && product.kind === 'simple' && product.categoryId === promotion.categoryId;
}

/** Le prix à payer maintenant, au centime. */
export function promotedPrice(product: Pick<Product, 'kind' | 'categoryId' | 'price'>, promotion: Promotion | undefined, nowMs: number): number {
  if (!isPromoted(product, promotion, nowMs) || !promotion) return product.price;
  return Math.round(product.price * (100 - promotion.percentOff)) / 100;
}

/** « 2 j 05 h 12 min 09 s », ou ce qu'il en reste ; « Terminée » une fois finie. */
export function promotionCountdown(promotion: Promotion, nowMs: number): string {
  const remaining = promotionRemainingMs(promotion, nowMs);
  if (remaining === 0) return 'Terminée';
  const days = Math.floor(remaining / DAY);
  const hours = Math.floor((remaining % DAY) / HOUR);
  const minutes = Math.floor((remaining % HOUR) / MINUTE);
  const seconds = Math.floor((remaining % MINUTE) / SECOND);
  const two = (value: number) => String(value).padStart(2, '0');
  return [
    ...(days > 0 ? [`${days} j`] : []),
    ...(days > 0 || hours > 0 ? [`${two(hours)} h`] : []),
    `${two(minutes)} min`,
    `${two(seconds)} s`,
  ].join(' ');
}
